"""Test altyapısı.

Testler gerçek PostgreSQL'e (ayrı `factoryguard_test` veritabanı) karşı çalışır; SQLite kullanılmaz
çünkü JSONB, bileşik FK ve ileride RLS davranışı farklıdır. Şema Alembic migration'larıyla kurulur,
böylece migration'lar da her test çalıştırmasında doğrulanır.
"""
from __future__ import annotations

import os

os.environ.setdefault(
    "FG_DATABASE_URL", "postgresql+psycopg://factoryguard:dev-only-change-me@127.0.0.1:5432/factoryguard_test"
)
os.environ["FG_ENV"] = "test"

from pathlib import Path  # noqa: E402

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.core.db import get_engine, get_sessionmaker  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base, Membership, Organization, User  # noqa: E402
from app.modules.auth.service import throttle  # noqa: E402

BACKEND = Path(__file__).resolve().parents[1]
PASSWORD = "dogru-parola-123456"
_PW_HASH = None


def _alembic_cfg() -> Config:
    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "migrations"))
    cfg.attributes["configure_logger"] = False
    return cfg


@pytest.fixture(scope="session", autouse=True)
def _schema():
    assert "factoryguard_test" in os.environ["FG_DATABASE_URL"], "Testler yalnızca test veritabanında çalışır"
    with get_engine().begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
    cfg = _alembic_cfg()
    command.upgrade(cfg, "head")
    command.downgrade(cfg, "base")  # downgrade yolu da çalışmalı
    command.upgrade(cfg, "head")
    yield


@pytest.fixture(autouse=True)
def _clean():
    yield
    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
    with get_engine().begin() as conn:
        conn.execute(text(f"TRUNCATE {tables} CASCADE"))
    throttle.reset()


@pytest.fixture
def db():
    with get_sessionmaker()() as s:
        yield s


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def _pw_hash() -> str:
    global _PW_HASH
    if _PW_HASH is None:
        _PW_HASH = hash_password(PASSWORD)
    return _PW_HASH


@pytest.fixture
def make_user(db):
    def _make(email: str, org: Organization | None = None, role: str = "owner", active: bool = True) -> User:
        u = User(email=email, full_name=email.split("@")[0], password_hash=_pw_hash(), is_active=active)
        db.add(u)
        db.flush()
        if org is not None:
            db.add(Membership(organization_id=org.id, user_id=u.id, role=role))
        db.commit()
        return u

    return _make


@pytest.fixture
def make_org(db):
    def _make(name: str) -> Organization:
        o = Organization(name=name)
        db.add(o)
        db.commit()
        return o

    return _make


@pytest.fixture
def login(client):
    def _login(email: str, password: str = PASSWORD, org_id=None) -> dict:
        r = client.post("/api/v1/auth/login", json={"email": email, "password": password})
        assert r.status_code == 200, r.text
        h = {"Authorization": f"Bearer {r.json()['access_token']}"}
        if org_id:
            h["X-Organization-ID"] = str(org_id)
        return h

    return _login
