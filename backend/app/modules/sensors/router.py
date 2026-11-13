"""Sensör yönetimi, kayıt (enroll) ve sağlık/heartbeat kontrolü."""
from __future__ import annotations

import base64
import sys
import tempfile
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated

_REPO_ROOT = str(Path(__file__).resolve().parents[4])
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, StringConstraints
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.core.deps import (
    AdminTenant,
    AuthenticatedSensor,
    DbSession,
    Tenant,
    TenantContext,
    client_ip,
    get_tenant,
    require_role,
)
from app.core.security import decode_access_token, hash_token, new_sensor_credential
from app.models import DiscoveryRun, Membership, RiskFinding, Sensor, User
from app.modules.audit.service import record
from app.modules.ingestion.schemas import CommunicationIn, ObservationIn
from app.modules.ingestion.service import ingest_communications, ingest_observations
from app.modules.sites.router import get_site_or_404
from app.schemas.common import Name
from sensor.cli import run as run_zeek_dir
from sensor.normalizer.normalize import Normalizer
from sensor.parsers.pcap_binary import parse_pcap_bytes
from sensor.parsers.zeek import read_zeek_log

router = APIRouter(prefix="/sensors", tags=["sensors"])

AnalystTenant = Annotated[TenantContext, Depends(require_role("analyst"))]

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


class SensorUploadAnalyzeRequest(BaseModel):
    filename: str | None = None
    content_base64: str | None = None
    sample: str | None = None


class SensorUploadAnalyzeOut(BaseModel):
    filename: str
    devices_discovered: int
    assets_created: int
    assets_updated: int
    communications_created: int
    communications_updated: int
    open_risks_total: int


_PCAP_MAGICS = (
    b"\xd4\xc3\xb2\xa1",
    b"\xa1\xb2\xc3\xd4",
    b"\x4d\x3c\xb2\xa1",
    b"\xa1\xb2\x3c\x4d",
    b"\x0a\x0d\x0d\x0a",
)


@router.post("/{sensor_id}/analyze-upload", response_model=SensorUploadAnalyzeOut)
def analyze_sensor_upload(
    sensor_id: uuid.UUID,
    body: SensorUploadAnalyzeRequest,
    request: Request,
    db: DbSession,
    ctx: AnalystTenant,
):
    """Web arayüzünden tek tıkla PCAP (`.pcap`/`.pcapng`), Zeek `.log` veya hazır örnek analizi."""
    sensor = _get_sensor_or_404(db, ctx, sensor_id)
    if sensor.status == "revoked":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "İptal edilmiş (revoked) sensör üzerinden analiz yapılamaz",
        )

    repo_root = Path(__file__).resolve().parents[4]
    if body.sample:
        if body.sample == "real-modbus-pcap":
            sample_dir = repo_root / "sample-data" / "zeek" / "real-modbus-testdata-part1"
            label = "MODBUS-TestDataPart1.pcap (Zeek 9.0.1)"
        elif body.sample == "synthetic-zeek":
            sample_dir = repo_root / "sample-data" / "zeek" / "sample"
            label = "Ornek-Fabrika-Zeek-Paketi"
        else:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Geçersiz örnek veri adı")
        if not sample_dir.is_dir():
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Örnek veri dizini bulunamadı")
        bundle = run_zeek_dir(sample_dir, str(sensor.id))
    elif body.content_base64:
        label = (body.filename or "yuklenen-dosya").strip()
        try:
            raw_bytes = base64.b64decode(body.content_base64, validate=False)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Geçersiz Base64 dosya içeriği") from exc

        if not raw_bytes:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Yüklenen dosya boş")
        if len(raw_bytes) > 20 * 1024 * 1024:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Dosya boyutu en fazla 20 MB olabilir")

        lower_name = label.lower()
        is_pcap = raw_bytes[:4] in _PCAP_MAGICS or lower_name.endswith((".pcap", ".pcapng", ".cap"))
        if is_pcap:
            try:
                bundle = parse_pcap_bytes(raw_bytes, str(sensor.id))
            except ValueError as exc:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
        else:
            # Zeek JSON veya TSV log dosyası
            with tempfile.TemporaryDirectory() as tmpdir:
                tmp_path = Path(tmpdir) / "conn.log"
                tmp_path.write_bytes(raw_bytes)
                norm = Normalizer(str(sensor.id))
                for rec in read_zeek_log(tmp_path):
                    if "func" in rec:
                        norm.add_modbus(rec)
                    elif "assigned_addr" in rec or "client_addr" in rec:
                        norm.add_dhcp(rec)
                    elif "query" in rec and "answers" in rec:
                        norm.add_dns(rec)
                    else:
                        norm.add_conn(rec)
                bundle = {
                    "observations": norm.observations(),
                    "communications": norm.communications(),
                }
    else:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Analiz için dosya ('content_base64') veya hazır senaryo ('sample') seçilmelidir",
        )

    raw_obs = bundle.get("observations") or []
    raw_comms = bundle.get("communications") or []
    if not raw_obs and not raw_comms:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Dosyada geçerli IPv4/TCP/UDP veya Zeek bağlantı kaydı bulunamadı",
        )

    obs_models = [ObservationIn.model_validate(o) for o in raw_obs]
    comm_models = [CommunicationIn.model_validate(c) for c in raw_comms]

    obs_stats = (
        ingest_observations(db, sensor, obs_models)
        if obs_models
        else None
    )
    comm_stats = (
        ingest_communications(db, sensor, comm_models)
        if comm_models
        else None
    )

    sensor.last_seen_at = datetime.now(UTC)
    if sensor.status == "offline":
        sensor.status = "active"

    record(
        db,
        "sensor.analyze_upload",
        user_id=ctx.user.id,
        organization_id=ctx.organization_id,
        target_type="sensor",
        target_id=sensor.id,
        metadata={
            "filename": label,
            "devices_discovered": len(obs_models),
            "flows_discovered": len(comm_models),
        },
        ip_address=client_ip(request),
    )
    db.commit()

    open_risks = (
        db.scalar(
            select(func.count())
            .select_from(RiskFinding)
            .where(
                RiskFinding.organization_id == ctx.organization_id,
                RiskFinding.status.in_(("open", "investigating")),
            )
        )
        or 0
    )

    return SensorUploadAnalyzeOut(
        filename=label,
        devices_discovered=len(obs_models),
        assets_created=obs_stats.assets_created if obs_stats else 0,
        assets_updated=obs_stats.assets_updated if obs_stats else 0,
        communications_created=comm_stats.communications_created if comm_stats else 0,
        communications_updated=comm_stats.communications_updated if comm_stats else 0,
        open_risks_total=open_risks,
    )

