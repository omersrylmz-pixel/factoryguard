"""Merkezi cihaz envanteri API uç noktaları (`/api/v1/assets`)."""
from __future__ import annotations

import csv
import io
import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.deps import DbSession, Tenant, TenantContext, client_ip, require_role
from app.models import Asset, AssetCommunication, AssetIdentifier, AssetObservation, RiskFinding, Zone
from app.models.asset import ASSET_TYPES
from app.models.base import CRITICALITY_LEVELS
from app.modules.assets.schemas import (
    AssetCommunicationOut,
    AssetDetailOut,
    AssetIdentifierOut,
    AssetObservationOut,
    AssetOut,
    AssetPage,
    AssetUpdate,
    CsvImportRequest,
    CsvImportResult,
    CsvRowError,
    _validate_optional_ip,
    _validate_optional_mac,
)
from app.modules.audit.service import changes, record
from app.modules.discovery.classifier import infer_from_evidence
from app.modules.ingestion.service import _upsert_identifier
from app.modules.risk_engine.router import _to_risk_out
from app.modules.risk_engine.service import evaluate_organization_risks
from app.modules.sites.router import get_site_or_404

router = APIRouter(prefix="/assets", tags=["assets"])

AnalystTenant = Annotated[TenantContext, Depends(require_role("analyst"))]

_CSV_TYPE_ALIASES: dict[str, str] = {
    "plc": "plc",
    "hmi": "hmi",
    "scada": "scada_server",
    "scada_server": "scada_server",
    "scada server": "scada_server",
    "ipc": "industrial_pc",
    "industrial_pc": "industrial_pc",
    "industrial pc": "industrial_pc",
    "endustriyel pc": "industrial_pc",
    "network_device": "network_device",
    "network device": "network_device",
    "switch": "network_device",
    "router": "network_device",
    "firewall": "network_device",
    "engineering_workstation": "engineering_workstation",
    "engineering workstation": "engineering_workstation",
    "server": "server",
    "sunucu": "server",
    "computer": "computer",
    "bilgisayar": "computer",
    "unknown": "unknown_device",
    "unknown_device": "unknown_device",
}


def _to_asset_out(asset: Asset, observed_protocols: list[str] | None = None) -> AssetOut:
    hint = infer_from_evidence(
        current_type=asset.asset_type,
        is_verified=asset.is_verified,
        vendor=asset.vendor,
        hostname=asset.hostname,
        observed_protocols=observed_protocols or [],
        base_confidence=asset.confidence,
        mac_address=asset.mac_address,
    )
    return AssetOut(
        id=asset.id,
        organization_id=asset.organization_id,
        site_id=asset.site_id,
        zone_id=asset.zone_id,
        name=asset.name,
        ip_address=asset.ip_address,
        mac_address=asset.mac_address,
        hostname=asset.hostname,
        asset_type=asset.asset_type,
        vendor=asset.vendor,
        model=asset.model,
        serial_number=asset.serial_number,
        firmware_version=asset.firmware_version,
        criticality=asset.criticality,
        confidence=asset.confidence,
        is_verified=asset.is_verified,
        is_active=asset.is_active,
        first_seen_at=asset.first_seen_at,
        last_seen_at=asset.last_seen_at,
        created_at=asset.created_at,
        classification_label=hint.classification_label,
        vendor_status_label=hint.vendor_status_label,
    )


def _get_asset_or_404(db: Session, ctx: TenantContext, asset_id: uuid.UUID) -> Asset:
    asset = db.scalar(
        select(Asset).where(Asset.id == asset_id, Asset.organization_id == ctx.organization_id)
    )
    if asset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cihaz bulunamadı")
    return asset


@router.get("", response_model=AssetPage)
def list_assets(
    db: DbSession,
    ctx: Tenant,
    site_id: uuid.UUID | None = None,
    zone_id: uuid.UUID | None = None,
    ip: str | None = None,
    mac: str | None = None,
    asset_type: str | None = None,
    vendor: str | None = None,
    criticality: str | None = None,
    is_verified: bool | None = None,
    q: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    stmt = select(Asset).where(Asset.organization_id == ctx.organization_id)
    if site_id is not None:
        stmt = stmt.where(Asset.site_id == site_id)
    if zone_id is not None:
        stmt = stmt.where(Asset.zone_id == zone_id)
    if ip:
        stmt = stmt.where(Asset.ip_address.ilike(f"%{ip.strip()}%"))
    if mac:
        stmt = stmt.where(Asset.mac_address.ilike(f"%{mac.strip()}%"))
    if asset_type:
        stmt = stmt.where(Asset.asset_type == asset_type.strip().lower())
    if vendor:
        stmt = stmt.where(Asset.vendor.ilike(f"%{vendor.strip()}%"))
    if criticality:
        stmt = stmt.where(Asset.criticality == criticality.strip().lower())
    if is_verified is not None:
        stmt = stmt.where(Asset.is_verified.is_(is_verified))
    if q and q.strip():
        pat = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Asset.name.ilike(pat),
                Asset.ip_address.ilike(pat),
                Asset.mac_address.ilike(pat),
                Asset.hostname.ilike(pat),
                Asset.vendor.ilike(pat),
                Asset.model.ilike(pat),
            )
        )

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(Asset.last_seen_at.desc(), Asset.ip_address).limit(limit).offset(offset)).all()
    return AssetPage(items=[_to_asset_out(a) for a in rows], total=total)


@router.get("/{asset_id}", response_model=AssetDetailOut)
def get_asset(asset_id: uuid.UUID, db: DbSession, ctx: Tenant):
    asset = _get_asset_or_404(db, ctx, asset_id)
    identifiers = db.scalars(
        select(AssetIdentifier)
        .where(AssetIdentifier.asset_id == asset.id)
        .order_by(AssetIdentifier.last_seen_at.desc())
    ).all()
    observations = db.scalars(
        select(AssetObservation)
        .where(AssetObservation.asset_id == asset.id, AssetObservation.organization_id == ctx.organization_id)
        .order_by(AssetObservation.observed_at.desc())
        .limit(50)
    ).all()

    observed_protocols: set[str] = set()
    for obs in observations:
        for p in obs.evidence.get("observed_protocols") or []:
            if isinstance(p, str):
                observed_protocols.add(p)

    comms = db.scalars(
        select(AssetCommunication)
        .where(
            AssetCommunication.organization_id == ctx.organization_id,
            or_(
                AssetCommunication.source_asset_id == asset.id,
                AssetCommunication.target_asset_id == asset.id,
            ),
        )
        .order_by(AssetCommunication.last_seen_at.desc())
    ).all()

    peer_ids = {
        c.target_asset_id if c.source_asset_id == asset.id else c.source_asset_id for c in comms
    }
    peers_by_id: dict[uuid.UUID, Asset] = {}
    if peer_ids:
        for p in db.scalars(select(Asset).where(Asset.id.in_(peer_ids))).all():
            peers_by_id[p.id] = p

    comm_out: list[AssetCommunicationOut] = []
    for c in comms:
        is_out = c.source_asset_id == asset.id
        peer_id = c.target_asset_id if is_out else c.source_asset_id
        peer = peers_by_id.get(peer_id)
        comm_out.append(
            AssetCommunicationOut(
                id=c.id,
                direction="outbound" if is_out else "inbound",
                peer_asset_id=peer_id,
                peer_ip=peer.ip_address if peer else None,
                peer_name=peer.name or (peer.hostname if peer else None),
                protocol=c.protocol,
                source_port=c.source_port,
                target_port=c.target_port,
                connection_count=c.connection_count,
                first_seen_at=c.first_seen_at,
                last_seen_at=c.last_seen_at,
            )
        )

    hint = infer_from_evidence(
        current_type=asset.asset_type,
        is_verified=asset.is_verified,
        vendor=asset.vendor,
        hostname=asset.hostname,
        observed_protocols=sorted(observed_protocols),
        base_confidence=asset.confidence,
        mac_address=asset.mac_address,
    )
    findings = db.scalars(
        select(RiskFinding)
        .where(
            RiskFinding.organization_id == ctx.organization_id,
            RiskFinding.asset_id == asset.id,
        )
        .order_by(RiskFinding.score.desc(), RiskFinding.last_seen_at.desc())
    ).all()
    base = _to_asset_out(asset, sorted(observed_protocols))
    return AssetDetailOut(
        **base.model_dump(),
        classification_reasons=hint.reasons,
        identifiers=[AssetIdentifierOut.model_validate(i) for i in identifiers],
        observations=[AssetObservationOut.model_validate(o) for o in observations],
        communications=comm_out,
        risk_findings=[_to_risk_out(f, asset).model_dump(mode="json") for f in findings],
    )


@router.patch("/{asset_id}", response_model=AssetOut)
def update_asset(
    asset_id: uuid.UUID,
    body: AssetUpdate,
    request: Request,
    db: DbSession,
    ctx: AnalystTenant,
):
    asset = _get_asset_or_404(db, ctx, asset_id)
    updates = body.model_dump(exclude_unset=True)

    if "zone_id" in updates and updates["zone_id"] is not None:
        zone = db.scalar(
            select(Zone).where(
                Zone.id == updates["zone_id"],
                Zone.organization_id == ctx.organization_id,
                Zone.site_id == asset.site_id,
            )
        )
        if zone is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Bölge bulunamadı veya bu fabrikaya ait değil")

    for non_null_field in ("asset_type", "criticality", "is_verified", "is_active"):
        if non_null_field in updates and updates[non_null_field] is None:
            updates.pop(non_null_field)

    diff = changes(asset, updates)
    for k, v in updates.items():
        setattr(asset, k, v)

    if updates.get("is_verified") is True:
        asset.confidence = 1.0

    now = datetime.now(UTC)
    if "ip_address" in updates and asset.ip_address:
        _upsert_identifier(db, asset.id, "ip", asset.ip_address, now, now, asset.confidence)
    if "mac_address" in updates and asset.mac_address:
        _upsert_identifier(db, asset.id, "mac", asset.mac_address, now, now, asset.confidence)
    if "hostname" in updates and asset.hostname:
        _upsert_identifier(db, asset.id, "hostname", asset.hostname, now, now, asset.confidence)

    if diff:
        # UUID değerlerini JSON serileştirilebilir string'e çevir
        serializable_diff = {
            k: {
                "old": str(v["old"]) if isinstance(v["old"], uuid.UUID) else v["old"],
                "new": str(v["new"]) if isinstance(v["new"], uuid.UUID) else v["new"],
            }
            for k, v in diff.items()
        }
        record(
            db,
            "asset.update",
            user_id=ctx.user.id,
            organization_id=ctx.organization_id,
            target_type="asset",
            target_id=asset.id,
            metadata={"changes": serializable_diff},
            ip_address=client_ip(request),
        )
    db.commit()
    evaluate_organization_risks(db, ctx.organization_id, site_id=asset.site_id)
    return _to_asset_out(asset)


def _pick_col(row: dict[str, str], *names: str) -> str | None:
    for n in names:
        val = row.get(n)
        if val is not None and val.strip() != "":
            return val.strip()
    return None


@router.post("/import", response_model=CsvImportResult)
def import_assets_csv(
    body: CsvImportRequest,
    request: Request,
    db: DbSession,
    ctx: AnalystTenant,
):
    """CSV içeriğinden toplu cihaz envanteri içe aktarır.

    Desteklenen sütun adları (büyük/küçük harf duyarsız):
    name/cihaz_adi, ip_address/ip, mac_address/mac, hostname, asset_type/cihaz_turu,
    vendor/uretici, model, serial_number/seri_no, firmware_version/firmware,
    zone/bolge, criticality/kritiklik, is_verified/dogrulandi
    """
    site = get_site_or_404(db, ctx, body.site_id)

    zones_by_name = {
        z.name.lower(): z.id
        for z in db.scalars(
            select(Zone).where(Zone.organization_id == ctx.organization_id, Zone.site_id == site.id)
        ).all()
    }

    reader = csv.DictReader(io.StringIO(body.csv_content.lstrip("\ufeff")))
    if not reader.fieldnames:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "CSV başlık satırı bulunamadı")

    created = 0
    updated = 0
    processed = 0
    errors: list[CsvRowError] = []
    now = datetime.now(UTC)

    for idx, raw_row in enumerate(reader, start=2):
        row = {(k or "").strip().lower(): (v or "").strip() for k, v in raw_row.items()}
        if not any(row.values()):
            continue
        processed += 1

        try:
            ip = _validate_optional_ip(_pick_col(row, "ip_address", "ip"))
            mac = _validate_optional_mac(_pick_col(row, "mac_address", "mac"))
            hostname = _pick_col(row, "hostname", "host")
            name = _pick_col(row, "name", "cihaz_adi", "device_name")
            if not ip and not mac and not hostname and not name:
                raise ValueError("En az bir kimlik alanı (ip, mac, hostname veya name) gerekli")

            raw_type = (_pick_col(row, "asset_type", "cihaz_turu", "type") or "unknown_device").lower()
            asset_type = _CSV_TYPE_ALIASES.get(raw_type)
            if not asset_type or asset_type not in ASSET_TYPES:
                raise ValueError(f"Geçersiz cihaz türü: {raw_type}")

            crit = (_pick_col(row, "criticality", "kritiklik") or "medium").lower()
            if crit not in CRITICALITY_LEVELS:
                raise ValueError(f"Geçersiz kritiklik: {crit}")

            zone_name = _pick_col(row, "zone", "bolge", "zone_name")
            zone_id = None
            if zone_name:
                zone_id = zones_by_name.get(zone_name.lower())
                if zone_id is None:
                    raise ValueError(f"Bölge bulunamadı: {zone_name}")

            ver_raw = (_pick_col(row, "is_verified", "dogrulandi", "verified") or "true").lower()
            is_verified = ver_raw in ("1", "true", "evet", "yes", "dogrulandi")

            vendor = _pick_col(row, "vendor", "uretici")
            model = _pick_col(row, "model")
            serial = _pick_col(row, "serial_number", "seri_no", "serial")
            firmware = _pick_col(row, "firmware_version", "firmware")

            existing = None
            if ip:
                existing = db.scalar(
                    select(Asset).where(
                        Asset.organization_id == ctx.organization_id,
                        Asset.site_id == site.id,
                        Asset.ip_address == ip,
                    )
                )
            if existing is None and mac:
                existing = db.scalar(
                    select(Asset).where(
                        Asset.organization_id == ctx.organization_id,
                        Asset.site_id == site.id,
                        Asset.mac_address == mac,
                    )
                )

            conf = 1.0 if is_verified else 0.75
            if existing is None:
                asset = Asset(
                    organization_id=ctx.organization_id,
                    site_id=site.id,
                    zone_id=zone_id,
                    name=name,
                    ip_address=ip,
                    mac_address=mac,
                    hostname=hostname,
                    asset_type=asset_type,
                    vendor=vendor,
                    model=model,
                    serial_number=serial,
                    firmware_version=firmware,
                    criticality=crit,
                    confidence=conf,
                    is_verified=is_verified,
                    first_seen_at=now,
                    last_seen_at=now,
                )
                db.add(asset)
                db.flush()
                created += 1
            else:
                asset = existing
                for attr, val in (
                    ("name", name),
                    ("ip_address", ip),
                    ("mac_address", mac),
                    ("hostname", hostname),
                    ("vendor", vendor),
                    ("model", model),
                    ("serial_number", serial),
                    ("firmware_version", firmware),
                    ("zone_id", zone_id),
                ):
                    if val is not None:
                        setattr(asset, attr, val)
                if raw_type != "unknown_device":
                    asset.asset_type = asset_type
                asset.criticality = crit
                asset.is_verified = is_verified
                asset.confidence = max(asset.confidence, conf)
                asset.last_seen_at = now
                db.flush()
                updated += 1

            _upsert_identifier(db, asset.id, "ip", ip, now, now, conf)
            _upsert_identifier(db, asset.id, "mac", mac, now, now, conf)
            _upsert_identifier(db, asset.id, "hostname", hostname, now, now, conf)

        except ValueError as exc:
            errors.append(CsvRowError(row=idx, error=str(exc)))

    record(
        db,
        "asset.import",
        user_id=ctx.user.id,
        organization_id=ctx.organization_id,
        target_type="site",
        target_id=site.id,
        metadata={"processed": processed, "created": created, "updated": updated, "errors": len(errors)},
        ip_address=client_ip(request),
    )
    db.commit()
    evaluate_organization_risks(db, ctx.organization_id, site_id=site.id)
    return CsvImportResult(processed_rows=processed, created=created, updated=updated, errors=errors)
