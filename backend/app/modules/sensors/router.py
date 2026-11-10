"""Sensör yönetimi, kayıt (enroll) ve sağlık/heartbeat kontrolü."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, StringConstraints
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.deps import AdminTenant, AuthenticatedSensor, DbSession, Tenant, TenantContext, client_ip, get_tenant
from app.core.security import decode_access_token, hash_token, new_sensor_credential
from app.models import DiscoveryRun, Membership, Sensor, User
from app.modules.audit.service import record
from app.modules.sites.router import get_site_or_404
from app.schemas.common import Name

router = APIRouter(prefix="/sensors", tags=["sensors"])

VersionStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]
SENSOR_OFFLINE_THRESHOLD_SECONDS = 180
_bearer = HTTPBearer(auto_error=False)


def compute_connectivity(sensor: Sensor, now: datetime | None = None) -> tuple[str, bool]:
    """Sensörün gerçek zamanlı bağlantı durumunu hesaplar.

    Son görülme zamanı yoksa veya eşik süreyi (180 sn) aşmışsa 'offline' döner.
    """
    if sensor.status == "revoked":
        return "revoked", False
    if sensor.last_seen_at is None:
        return "offline", False
    now = now or datetime.now(UTC)
    last = sensor.last_seen_at if sensor.last_seen_at.tzinfo else sensor.last_seen_at.replace(tzinfo=UTC)
    if (now - last).total_seconds() > SENSOR_OFFLINE_THRESHOLD_SECONDS:
        return "offline", False
    return "active", True


class SensorEnrollRequest(BaseModel):
    site_id: uuid.UUID
    name: Name
    version: VersionStr = "0.1.0"


class SensorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    site_id: uuid.UUID
    name: str
    version: str
    status: str
    connectivity_status: str
    is_connected: bool
    credential_fingerprint: str
    last_seen_at: datetime | None
    created_at: datetime


class SensorEnrollResponse(SensorOut):
    """`sensor_token` yalnızca kayıt anında bir kez döndürülür; veritabanında saklanmaz."""

    sensor_token: str


class DiscoveryRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    sensor_id: uuid.UUID
    started_at: datetime
    ended_at: datetime | None
    status: str
    devices_seen: int


class SensorDetailOut(SensorOut):
    recent_runs: list[DiscoveryRunOut]


class SensorHealthOut(BaseModel):
    sensor_id: uuid.UUID
    status: str
    connectivity_status: str
    is_connected: bool
    version: str
    last_seen_at: datetime | None
    offline_threshold_seconds: int = SENSOR_OFFLINE_THRESHOLD_SECONDS


class HeartbeatRequest(BaseModel):
    version: VersionStr | None = None


def _to_sensor_out(sensor: Sensor) -> SensorOut:
    conn_status, is_conn = compute_connectivity(sensor)
    return SensorOut(
        id=sensor.id,
        organization_id=sensor.organization_id,
        site_id=sensor.site_id,
        name=sensor.name,
        version=sensor.version,
        status=sensor.status,
        connectivity_status=conn_status,
        is_connected=is_conn,
        credential_fingerprint=sensor.credential_fingerprint,
        last_seen_at=sensor.last_seen_at,
        created_at=sensor.created_at,
    )


def _get_sensor_or_404(db, ctx: TenantContext, sensor_id: uuid.UUID) -> Sensor:
    sensor = db.scalar(
        select(Sensor).where(Sensor.id == sensor_id, Sensor.organization_id == ctx.organization_id)
    )
    if sensor is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sensör bulunamadı")
    return sensor


@router.post("/enroll", response_model=SensorEnrollResponse, status_code=status.HTTP_201_CREATED)
def enroll_sensor(body: SensorEnrollRequest, request: Request, db: DbSession, ctx: AdminTenant):
    get_site_or_404(db, ctx, body.site_id)
    raw_token, fp = new_sensor_credential()
    sensor = Sensor(
        organization_id=ctx.organization_id,
        site_id=body.site_id,
        name=body.name,
        version=body.version,
        status="active",
        credential_fingerprint=fp,
    )
    db.add(sensor)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Bu fabrikada aynı isimde bir sensör zaten var") from None
    record(
        db,
        "sensor.enroll",
        user_id=ctx.user.id,
        organization_id=ctx.organization_id,
        target_type="sensor",
        target_id=sensor.id,
        metadata={"site_id": str(body.site_id), "name": body.name, "version": body.version},
        ip_address=client_ip(request),
    )
    db.commit()
    base = _to_sensor_out(sensor)
    return SensorEnrollResponse(**base.model_dump(), sensor_token=raw_token)


@router.get("", response_model=list[SensorOut])
def list_sensors(db: DbSession, ctx: Tenant, site_id: uuid.UUID | None = None):
    q = select(Sensor).where(Sensor.organization_id == ctx.organization_id)
    if site_id:
        q = q.where(Sensor.site_id == site_id)
    sensors = db.scalars(q.order_by(Sensor.name)).all()
    return [_to_sensor_out(s) for s in sensors]


@router.get("/{sensor_id}", response_model=SensorDetailOut)
def get_sensor(sensor_id: uuid.UUID, db: DbSession, ctx: Tenant):
    sensor = _get_sensor_or_404(db, ctx, sensor_id)
    runs = db.scalars(
        select(DiscoveryRun)
        .where(DiscoveryRun.sensor_id == sensor.id)
        .order_by(DiscoveryRun.started_at.desc())
        .limit(20)
    ).all()
    base = _to_sensor_out(sensor)
    return SensorDetailOut(
        **base.model_dump(),
        recent_runs=[DiscoveryRunOut.model_validate(r) for r in runs],
    )


@router.get("/{sensor_id}/health", response_model=SensorHealthOut)
def sensor_health(
    sensor_id: uuid.UUID,
    db: DbSession,
    cred: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    x_sensor_token: Annotated[str | None, Header()] = None,
    x_organization_id: Annotated[uuid.UUID | None, Header()] = None,
):
    """Hem kullanıcı (Bearer JWT) hem de sensörün kendisi (`X-Sensor-Token`) tarafından çağrılabilir.

    Sensör kendi token'ı ile çağırdığında `last_seen_at` güncellenir (heartbeat).
    """
    raw_sensor = x_sensor_token
    if not raw_sensor and cred is not None and cred.credentials.startswith("fg_snr_"):
        raw_sensor = cred.credentials

    if raw_sensor:
        fp = hash_token(raw_sensor)
        sensor = db.scalar(select(Sensor).where(Sensor.id == sensor_id, Sensor.credential_fingerprint == fp))
        if sensor is None or sensor.status == "revoked":
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Geçersiz veya iptal edilmiş sensör kimliği")
        sensor.last_seen_at = datetime.now(UTC)
        sensor.status = "active"
        db.commit()
    else:
        if cred is None or cred.scheme.lower() != "bearer":
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Kimlik doğrulama gerekli")
        user_id = decode_access_token(cred.credentials)
        if user_id is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Geçersiz veya süresi dolmuş token")
        user = db.get(User, user_id)
        if user is None or not user.is_active:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Geçersiz veya süresi dolmuş token")
        ctx = get_tenant(db, user, x_organization_id)
        sensor = _get_sensor_or_404(db, ctx, sensor_id)

    conn_status, is_conn = compute_connectivity(sensor)
    return SensorHealthOut(
        sensor_id=sensor.id,
        status=sensor.status,
        connectivity_status=conn_status,
        is_connected=is_conn,
        version=sensor.version,
        last_seen_at=sensor.last_seen_at,
    )


@router.post("/heartbeat", response_model=SensorHealthOut)
def sensor_heartbeat(
    sensor: AuthenticatedSensor,
    db: DbSession,
    body: HeartbeatRequest | None = None,
):
    """Sensörün kendi kimliğiyle (`X-Sensor-Token`) periyodik heartbeat göndermesi."""
    sensor.last_seen_at = datetime.now(UTC)
    sensor.status = "active"
    if body and body.version:
        sensor.version = body.version
    db.commit()
    conn_status, is_conn = compute_connectivity(sensor)
    return SensorHealthOut(
        sensor_id=sensor.id,
        status=sensor.status,
        connectivity_status=conn_status,
        is_connected=is_conn,
        version=sensor.version,
        last_seen_at=sensor.last_seen_at,
    )
