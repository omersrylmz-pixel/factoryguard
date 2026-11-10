from datetime import UTC, datetime, timedelta

import jwt
from sqlalchemy import select

from app.core.config import get_settings
from app.models import AuditLog, RefreshToken
from tests.conftest import PASSWORD


def test_login_success_returns_token_and_cookie(client, make_org, make_user):
    org = make_org("Fabrika A")
    make_user("ali@a.com", org)
    r = client.post("/api/v1/auth/login", json={"email": "ALI@a.com", "password": PASSWORD})
    assert r.status_code == 200
    body = r.json()
    assert body["token_type"] == "bearer" and body["access_token"]
    assert body["organizations"] == [{"id": str(org.id), "name": "Fabrika A", "role": "owner"}]
    cookie = r.headers["set-cookie"].lower()
    assert "fg_refresh=" in cookie and "httponly" in cookie and "samesite=strict" in cookie
    assert "path=/api/v1/auth" in cookie


def test_login_wrong_password_and_unknown_user_same_error(client, make_user, db):
    make_user("ali@a.com")
    r1 = client.post("/api/v1/auth/login", json={"email": "ali@a.com", "password": "yanlis"})
    r2 = client.post("/api/v1/auth/login", json={"email": "yok@a.com", "password": "yanlis"})
    assert r1.status_code == r2.status_code == 401
    assert r1.json() == r2.json()
    assert db.scalar(select(AuditLog).where(AuditLog.action == "auth.login_failed").limit(1)) is not None


def test_inactive_user_cannot_login(client, make_user):
    make_user("pasif@a.com", active=False)
    r = client.post("/api/v1/auth/login", json={"email": "pasif@a.com", "password": PASSWORD})
    assert r.status_code == 401


def test_login_throttled_after_failures(client, make_user):
    make_user("ali@a.com")
    for _ in range(get_settings().login_max_failures):
        assert client.post("/api/v1/auth/login", json={"email": "ali@a.com", "password": "x"}).status_code == 401
    r = client.post("/api/v1/auth/login", json={"email": "ali@a.com", "password": PASSWORD})
    assert r.status_code == 429


def test_invalid_login_payload_rejected(client):
    assert client.post("/api/v1/auth/login", json={"email": "not-an-email", "password": "x"}).status_code == 422
    assert client.post("/api/v1/auth/login", content="{bozuk", headers={"Content-Type": "application/json"}).status_code == 422


def test_protected_endpoints_require_auth(client):
    for path in ("/api/v1/auth/me", "/api/v1/sites", "/api/v1/zones", "/api/v1/organizations", "/api/v1/audit-logs"):
        assert client.get(path).status_code == 401, path
    assert client.get("/api/v1/sites", headers={"Authorization": "Bearer abc.def.ghi"}).status_code == 401


def test_expired_and_forged_tokens_rejected(client, make_user):
    u = make_user("ali@a.com")
    s = get_settings()
    now = datetime.now(UTC)
    expired = jwt.encode({"sub": str(u.id), "type": "access", "exp": now - timedelta(minutes=1)}, s.jwt_secret, "HS256")
    forged = jwt.encode({"sub": str(u.id), "type": "access", "exp": now + timedelta(minutes=5)}, "baska-anahtar" * 4, "HS256")
    for t in (expired, forged):
        assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {t}"}).status_code == 401


def test_refresh_rotates_token_and_detects_reuse(client, make_user, db):
    make_user("ali@a.com")
    r = client.post("/api/v1/auth/login", json={"email": "ali@a.com", "password": PASSWORD})
    old = r.cookies.get("fg_refresh")
    r2 = client.post("/api/v1/auth/refresh")
    assert r2.status_code == 200 and r2.json()["access_token"]
    new = r2.cookies.get("fg_refresh")
    assert new and new != old
    # Eski (döndürülmüş) token tekrar kullanılırsa -> tüm oturumlar iptal
    client.cookies.clear()
    client.cookies.set("fg_refresh", old, path="/api/v1/auth")
    assert client.post("/api/v1/auth/refresh").status_code == 401
    client.cookies.clear()
    client.cookies.set("fg_refresh", new, path="/api/v1/auth")
    assert client.post("/api/v1/auth/refresh").status_code == 401
    assert db.scalar(select(AuditLog).where(AuditLog.action == "auth.refresh_reuse_detected")) is not None


def test_refresh_without_cookie_401(client):
    assert client.post("/api/v1/auth/refresh").status_code == 401


def test_logout_revokes_refresh_token(client, make_user, db):
    make_user("ali@a.com")
    client.post("/api/v1/auth/login", json={"email": "ali@a.com", "password": PASSWORD})
    raw = client.cookies.get("fg_refresh")
    assert client.post("/api/v1/auth/logout").status_code == 204
    client.cookies.set("fg_refresh", raw, path="/api/v1/auth")
    assert client.post("/api/v1/auth/refresh").status_code == 401
    assert all(t.revoked_at is not None for t in db.scalars(select(RefreshToken)))


def test_refresh_token_stored_hashed(client, make_user, db):
    make_user("ali@a.com")
    client.post("/api/v1/auth/login", json={"email": "ali@a.com", "password": PASSWORD})
    raw = client.cookies.get("fg_refresh")
    stored = db.scalars(select(RefreshToken.token_hash)).all()
    assert raw not in stored and len(stored[0]) == 64


def test_production_settings_require_secret():
    import pytest
    from pydantic import ValidationError

    from app.core.config import Settings

    with pytest.raises(ValidationError):
        Settings(env="production")
    Settings(env="production", jwt_secret="x" * 40, cookie_secure=True)
