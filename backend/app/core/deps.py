"""Ortak FastAPI bağımlılıkları: kimlik doğrulama, tenant bağlamı ve rol kontrolü.

Tenant seçimi: istemci `X-Organization-ID` başlığını gönderir. Kullanıcının tek üyeliği varsa
başlık zorunlu değildir. Üyelik yoksa 403 döner. Tüm tenant'a ait sorgular
`TenantContext.organization_id` ile filtrelenmek ZORUNDADIR.
"""
from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import decode_access_token, hash_token
from app.models import Membership, Sensor, User

ROLE_RANK = {"viewer": 0, "analyst": 1, "admin": 2, "owner": 3}

_bearer = HTTPBearer(auto_error=False)

DbSession = Annotated[Session, Depends(get_db)]


def _unauthorized(detail: str = "Kimlik doğrulama gerekli") -> HTTPException:
    return HTTPException(status.HTTP_401_UNAUTHORIZED, detail, headers={"WWW-Authenticate": "Bearer"})


def get_current_user(
    db: DbSession,
    cred: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    if cred is None or cred.scheme.lower() != "bearer":
        raise _unauthorized()
    user_id = decode_access_token(cred.credentials)
    if user_id is None:
        raise _unauthorized("Geçersiz veya süresi dolmuş token")
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise _unauthorized("Geçersiz veya süresi dolmuş token")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


@dataclass(frozen=True)
class TenantContext:
    user: User
    organization_id: uuid.UUID
    role: str

    def has_role(self, minimum: str) -> bool:
        return ROLE_RANK[self.role] >= ROLE_RANK[minimum]


def get_tenant(
    db: DbSession,
    user: CurrentUser,
    x_organization_id: Annotated[uuid.UUID | None, Header()] = None,
) -> TenantContext:
    if x_organization_id is not None:
        m = db.get(Membership, (x_organization_id, user.id))
        if m is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Bu organizasyona erişim yetkiniz yok")
        return TenantContext(user, m.organization_id, m.role)
    memberships = db.scalars(select(Membership).where(Membership.user_id == user.id).limit(2)).all()
    if len(memberships) == 1:
        return TenantContext(user, memberships[0].organization_id, memberships[0].role)
    if not memberships:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Herhangi bir organizasyona üyeliğiniz yok")
    raise HTTPException(status.HTTP_400_BAD_REQUEST, "Birden fazla organizasyon: X-Organization-ID başlığı gerekli")


Tenant = Annotated[TenantContext, Depends(get_tenant)]


def require_role(minimum: str) -> Callable[..., TenantContext]:
    if minimum not in ROLE_RANK:
        raise ValueError(minimum)

    def _dep(ctx: Tenant) -> TenantContext:
        if not ctx.has_role(minimum):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Bu işlem için yetkiniz yok")
        return ctx

    return _dep


AdminTenant = Annotated[TenantContext, Depends(require_role("admin"))]


def client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def get_current_sensor(
    db: DbSession,
    cred: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    x_sensor_token: Annotated[str | None, Header()] = None,
) -> Sensor:
    """Sensör veri gönderimi ve heartbeat için kimlik doğrulama.

    Sensör `X-Sensor-Token: fg_snr_...` veya `Authorization: Bearer fg_snr_...` gönderebilir.
    """
    raw = x_sensor_token
    if not raw and cred is not None and cred.scheme.lower() == "bearer":
        raw = cred.credentials
    if not raw or not raw.startswith("fg_snr_"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sensör kimlik doğrulaması gerekli")
    fp = hash_token(raw)
    sensor = db.scalar(select(Sensor).where(Sensor.credential_fingerprint == fp))
    if sensor is None or sensor.status == "revoked":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Geçersiz veya iptal edilmiş sensör kimliği")
    return sensor


AuthenticatedSensor = Annotated[Sensor, Depends(get_current_sensor)]
