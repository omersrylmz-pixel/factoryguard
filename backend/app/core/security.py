"""Parola hash'leme ve token üretimi.

- Parolalar Argon2id ile hash'lenir (argon2-cffi varsayılanları).
- Access token: kısa ömürlü JWT (HS256).
- Refresh token: rastgele opak değer; veritabanında yalnızca SHA-256 hash'i saklanır.
"""
from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core.config import get_settings

_ph = PasswordHasher()
# Var olmayan kullanıcı için de aynı sürede yanıt vermek (kullanıcı sayımı saldırısını zorlaştırmak) için.
_DUMMY_HASH = _ph.hash("factoryguard-timing-dummy")

MIN_PASSWORD_LENGTH = 12


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    try:
        ok = _ph.verify(password_hash or _DUMMY_HASH, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False
    return ok and password_hash is not None


def create_access_token(user_id: uuid.UUID) -> tuple[str, int]:
    s = get_settings()
    now = datetime.now(UTC)
    expires = s.access_token_minutes * 60
    payload = {
        "sub": str(user_id),
        "type": "access",
        "iat": now,
        "exp": now + timedelta(seconds=expires),
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(payload, s.jwt_secret, algorithm=s.jwt_algorithm), expires


def decode_access_token(token: str) -> uuid.UUID | None:
    s = get_settings()
    try:
        payload = jwt.decode(token, s.jwt_secret, algorithms=[s.jwt_algorithm], options={"require": ["exp", "sub"]})
        if payload.get("type") != "access":
            return None
        return uuid.UUID(payload["sub"])
    except (jwt.PyJWTError, ValueError):
        return None


def new_refresh_token() -> tuple[str, str]:
    raw = secrets.token_urlsafe(48)
    return raw, hash_token(raw)


def new_sensor_credential() -> tuple[str, str]:
    """Sensör için tek seferlik API anahtarı (`fg_snr_...`) ve SHA-256 fingerprint üretir."""
    raw = f"fg_snr_{secrets.token_urlsafe(36)}"
    return raw, hash_token(raw)


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()
