"""Yönetim komutları.

İlk kurulum (açık kayıt endpoint'i yoktur, ilk kullanıcı bu komutla oluşturulur):
  python -m app.cli create-owner --email admin@fabrika.com --full-name "Ad Soyad" --org-name "Fabrika A.Ş."
Parola sorulur; otomasyon için FG_INITIAL_PASSWORD ortam değişkeni kullanılabilir.
"""
from __future__ import annotations

import argparse
import getpass
import os
import sys

from email_validator import EmailNotValidError, validate_email
from sqlalchemy import select

from app.core.db import get_sessionmaker
from app.core.security import MIN_PASSWORD_LENGTH, hash_password
from app.models import Membership, Organization, User
from app.modules.audit.service import record


def create_owner(email: str, full_name: str, org_name: str, password: str) -> tuple[User, Organization]:
    email = validate_email(email, check_deliverability=False).normalized.lower()
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Parola en az {MIN_PASSWORD_LENGTH} karakter olmalı")
    with get_sessionmaker()() as db:
        if db.scalar(select(User).where(User.email == email)):
            raise ValueError(f"{email} zaten kayıtlı")
        user = User(email=email, full_name=full_name.strip(), password_hash=hash_password(password))
        org = Organization(name=org_name.strip())
        db.add_all([user, org])
        db.flush()
        db.add(Membership(organization_id=org.id, user_id=user.id, role="owner"))
        record(db, "cli.create_owner", user_id=user.id, organization_id=org.id, target_type="user", target_id=user.id)
        db.commit()
        return user, org


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="factoryguard")
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("create-owner", help="İlk kullanıcıyı ve organizasyonu oluştur")
    c.add_argument("--email", required=True)
    c.add_argument("--full-name", required=True)
    c.add_argument("--org-name", required=True)
    a = p.parse_args(argv)

    password = os.environ.get("FG_INITIAL_PASSWORD") or getpass.getpass("Parola: ")
    try:
        user, org = create_owner(a.email, a.full_name, a.org_name, password)
    except (ValueError, EmailNotValidError) as exc:
        print(f"HATA: {exc}", file=sys.stderr)
        return 1
    print(f"Oluşturuldu: kullanıcı={user.email} organizasyon={org.name} ({org.id})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
