"""Kimlik doğrulama iş mantığı: giriş, refresh token rotasyonu, çıkış, basit kaba kuvvet koruması."""
from __future__ import annotations

import threading
import time
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import hash_token, new_refresh_token, verify_password
from app.models import Membership, Organization, RefreshToken, User
from app.modules.auth.schemas import OrganizationMembershipOut


class LoginThrottle:
    """E-posta başına başarısız giriş sayacı (süreç içi bellek).

    Local-first tek süreçli kurulum için yeterli; çok süreçli dağıtımda paylaşımlı depo gerekir
    (bkz. docs/PROJECT_STATUS.md bilinen sınırlamalar).
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._failures: dict[str, list[float]] = {}

    def _recent(self, key: str, now: float) -> list[float]:
        window = get_settings().login_lockout_seconds
        items = [t for t in self._failures.get(key, []) if now - t < window]
        self._failures[key] = items
        return items

    def is_locked(self, key: str) -> bool:
        with self._lock:
            return len(self._recent(key, time.monotonic())) >= get_settings().login_max_failures

    def fail(self, key: str) -> None:
        with self._lock:
            now = time.monotonic()
            self._recent(key, now).append(now)

    def reset(self, key: str | None = None) -> None:
        with self._lock:
            if key is None:
                self._failures.clear()
            else:
                self._failures.pop(key, None)


throttle = LoginThrottle()


def authenticate(db: Session, email: str, password: str) -> tuple[User | None, User | None]:
    """(doğrulanmış kullanıcı, bulunan kullanıcı) döndürür. Zamanlama farkını azaltmak için
    kullanıcı yoksa da hash doğrulaması yapılır."""
    user = db.scalar(select(User).where(User.email == email.lower()))
    ok = verify_password(password, user.password_hash if user else None)
    if user and ok and user.is_active:
        return user, user
    return None, user


def issue_refresh_token(db: Session, user_id: uuid.UUID) -> str:
    raw, digest = new_refresh_token()
    db.add(
        RefreshToken(
            user_id=user_id,
            token_hash=digest,
            expires_at=datetime.now(UTC) + timedelta(days=get_settings().refresh_token_days),
        )
    )
    return raw


class RefreshError(Exception):
    def __init__(self, reason: str, user_id: uuid.UUID | None = None):
        self.reason, self.user_id = reason, user_id


def rotate_refresh_token(db: Session, raw: str) -> tuple[User, str]:
    """Geçerli token'ı iptal edip yenisini üretir. İptal edilmiş bir token tekrar kullanılırsa
    (çalınmış token belirtisi) kullanıcının tüm refresh token'ları iptal edilir."""
    token = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw)).with_for_update())
    now = datetime.now(UTC)
    if token is None:
        raise RefreshError("unknown")
    if token.revoked_at is not None:
        revoke_all(db, token.user_id)
        raise RefreshError("reuse_detected", token.user_id)
    if token.expires_at <= now:
        raise RefreshError("expired", token.user_id)
    user = db.get(User, token.user_id)
    if user is None or not user.is_active:
        raise RefreshError("inactive", token.user_id)
    token.revoked_at = now
    token.last_used_at = now
    return user, issue_refresh_token(db, user.id)


def revoke_token(db: Session, raw: str) -> uuid.UUID | None:
    token = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw)))
    if token is None:
        return None
    if token.revoked_at is None:
        token.revoked_at = datetime.now(UTC)
    return token.user_id


def revoke_all(db: Session, user_id: uuid.UUID) -> None:
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )


def user_organizations(db: Session, user_id: uuid.UUID) -> list[OrganizationMembershipOut]:
    rows = db.execute(
        select(Organization.id, Organization.name, Membership.role)
        .join(Membership, Membership.organization_id == Organization.id)
        .where(Membership.user_id == user_id)
        .order_by(Organization.name)
    ).all()
    return [OrganizationMembershipOut(id=r.id, name=r.name, role=r.role) for r in rows]
