"""Sensör gözlem ve iletişim verilerini işleme (ingestion) servisi.

Temel kurallar:
1. Aynı cihaz tekrar görüldüğünde mükerrer `Asset` kaydı oluşmaz.
2. DHCP veya tekil MAC kanıtıyla bir cihazın IP değiştirdiği tespit edilirse aynı `Asset`
   güncellenir ve hem eski hem yeni IP `asset_identifiers` tablosunda korunur.
3. Ancak birden fazla IP aynı MAC'i paylaşıyorsa (gateway/proxy durumu — D-009), yanlış
   birleştirme yapmamak için IP bazında ayrı `Asset` tutulur.
4. Bilinmeyen cihaza asla tahmini üretici (`vendor`) veya kesin tür atanmaz (`unknown_device`).
5. Aynı gözlem (`dedup_hash`) tekrar gönderildiğinde `asset_observations`'a mükerrer yazılmaz.
"""
from __future__ import annotations

import hashlib
import json
import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Asset, AssetCommunication, AssetIdentifier, AssetObservation, DiscoveryRun, Sensor
from app.modules.discovery.classifier import infer_from_evidence
from app.modules.ingestion.schemas import (
    CommunicationIn,
    CommunicationIngestStats,
    ObservationIn,
    ObservationIngestStats,
)


def _utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=UTC)


def _compute_observation_confidence(obs: ObservationIn) -> float:
    """Kanıt zenginliğine göre 0.0–1.0 arası gözlem güven puanı."""
    score = 0.4  # IP gözlemlendi
    if obs.device.mac:
        score += 0.2
    if obs.device.hostname:
        score += 0.15
    protos = obs.evidence.get("observed_protocols") or []
    if protos:
        score += 0.15
    logs = obs.evidence.get("source_logs") or []
    if "dhcp.log" in logs:
        score += 0.1
    return round(min(score, 0.95), 2)


def _observation_dedup_hash(obs: ObservationIn) -> str:
    canonical = {
        "observed_at": _utc(obs.observed_at).isoformat(),
        "source": obs.source,
        "ip": obs.device.ip,
        "mac": obs.device.mac,
        "hostname": obs.device.hostname,
        "evidence": obs.evidence,
    }
    raw = json.dumps(canonical, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode()).hexdigest()


def _upsert_identifier(
    db: Session,
    asset_id: uuid.UUID,
    id_type: str,
    id_value: str | None,
    first_seen: datetime,
    last_seen: datetime,
    confidence: float,
) -> None:
    if not id_value:
        return
    ident = db.scalar(
        select(AssetIdentifier).where(
            AssetIdentifier.asset_id == asset_id,
            AssetIdentifier.identifier_type == id_type,
            AssetIdentifier.identifier_value == id_value,
        )
    )
    if ident is None:
        db.add(
            AssetIdentifier(
                asset_id=asset_id,
                identifier_type=id_type,
                identifier_value=id_value,
                first_seen_at=first_seen,
                last_seen_at=last_seen,
                confidence=confidence,
            )
        )
    else:
        if first_seen < ident.first_seen_at:
            ident.first_seen_at = first_seen
        if last_seen > ident.last_seen_at:
            ident.last_seen_at = last_seen
        if confidence > ident.confidence:
            ident.confidence = confidence


def _resolve_or_create_asset(
    db: Session,
    sensor: Sensor,
    ip: str,
    mac: str | None,
    hostname: str | None,
    first_seen: datetime,
    last_seen: datetime,
    confidence: float,
    source_logs: list[str],
    batch_seen_ips_by_mac: dict[str, set[str]],
) -> tuple[Asset, bool]:
    """Fabrika içinde mevcut varlığı bulur veya yeni oluşturur. (asset, created) döndürür."""
    # 1. Aynı IP ile kayıtlı aktif varlık var mı?
    by_ip = db.scalar(
        select(Asset).where(
            Asset.organization_id == sensor.organization_id,
            Asset.site_id == sensor.site_id,
            Asset.ip_address == ip,
        )
    )
    if by_ip is not None:
        if first_seen < by_ip.first_seen_at:
            by_ip.first_seen_at = first_seen
        if last_seen >= by_ip.last_seen_at:
            by_ip.last_seen_at = last_seen
            if mac:
                by_ip.mac_address = mac
            if hostname:
                by_ip.hostname = hostname
        else:
            if mac and not by_ip.mac_address:
                by_ip.mac_address = mac
            if hostname and not by_ip.hostname:
                by_ip.hostname = hostname
        if confidence > by_ip.confidence:
            by_ip.confidence = confidence
        return by_ip, False

    # 2. IP değişmiş olabilir mi?
    # Koşul: MAC var VE (DHCP kanıtı var VEYA bu MAC aynı batch'te birden fazla IP'de görülmedi
    # ve veritabanında bu sitede tam olarak 1 varlığa ait).
    if mac:
        shared_in_batch = len(batch_seen_ips_by_mac.get(mac, set())) > 1
        is_dhcp = "dhcp.log" in source_logs
        if is_dhcp or not shared_in_batch:
            mac_matches = db.scalars(
                select(Asset).where(
                    Asset.organization_id == sensor.organization_id,
                    Asset.site_id == sensor.site_id,
                    Asset.mac_address == mac,
                )
            ).all()
            if len(mac_matches) == 1:
                asset = mac_matches[0]
                if last_seen >= asset.last_seen_at:
                    asset.ip_address = ip
                    asset.last_seen_at = last_seen
                    if hostname:
                        asset.hostname = hostname
                if first_seen < asset.first_seen_at:
                    asset.first_seen_at = first_seen
                if confidence > asset.confidence:
                    asset.confidence = confidence
                return asset, False

    # 3. Yeni varlık oluştur (tahmin yok -> unknown_device, vendor/model None).
    asset = Asset(
        organization_id=sensor.organization_id,
        site_id=sensor.site_id,
        ip_address=ip,
        mac_address=mac,
        hostname=hostname,
        asset_type="unknown_device",
        vendor=None,
        model=None,
        confidence=confidence,
        first_seen_at=first_seen,
        last_seen_at=last_seen,
    )
    db.add(asset)
    db.flush()
    return asset, True


def ingest_observations(
    db: Session,
    sensor: Sensor,
    items: list[ObservationIn],
) -> ObservationIngestStats:
    now = datetime.now(UTC)
    run = DiscoveryRun(sensor_id=sensor.id, started_at=now, status="running", devices_seen=0)
    db.add(run)
    db.flush()

    # Aynı batch içinde aynı MAC'i paylaşan birden fazla IP var mı? (Gateway tespiti — D-009)
    batch_ips_by_mac: dict[str, set[str]] = {}
    for obs in items:
        if obs.device.mac:
            batch_ips_by_mac.setdefault(obs.device.mac, set()).add(obs.device.ip)

    stored = 0
    skipped = 0
    created_count = 0
    updated_assets: set[uuid.UUID] = set()
    seen_assets: set[uuid.UUID] = set()

    for obs in items:
        observed_at = _utc(obs.observed_at)
        first_seen = _utc(obs.first_seen_at) if obs.first_seen_at else observed_at
        if first_seen > observed_at:
            first_seen = observed_at
        conf = _compute_observation_confidence(obs)
        dedup = _observation_dedup_hash(obs)

        existing_obs = db.scalar(
            select(AssetObservation.id).where(
                AssetObservation.sensor_id == sensor.id,
                AssetObservation.dedup_hash == dedup,
            )
        )
        if existing_obs is not None:
            skipped += 1
            continue

        source_logs = obs.evidence.get("source_logs") if isinstance(obs.evidence.get("source_logs"), list) else []
        obs_protos = (
            obs.evidence.get("observed_protocols")
            if isinstance(obs.evidence.get("observed_protocols"), list)
            else []
        )
        asset, created = _resolve_or_create_asset(
            db,
            sensor,
            ip=obs.device.ip,
            mac=obs.device.mac,
            hostname=obs.device.hostname,
            first_seen=first_seen,
            last_seen=observed_at,
            confidence=conf,
            source_logs=source_logs,
            batch_seen_ips_by_mac=batch_ips_by_mac,
        )
        if not asset.is_verified:
            hint = infer_from_evidence(
                current_type=asset.asset_type,
                is_verified=asset.is_verified,
                vendor=asset.vendor,
                hostname=asset.hostname,
                observed_protocols=obs_protos,
                base_confidence=asset.confidence,
            )
            asset.asset_type = hint.inferred_type
            asset.confidence = max(asset.confidence, hint.confidence)
        if created:
            created_count += 1
        else:
            updated_assets.add(asset.id)
        seen_assets.add(asset.id)

        _upsert_identifier(db, asset.id, "ip", obs.device.ip, first_seen, observed_at, conf)
        _upsert_identifier(db, asset.id, "mac", obs.device.mac, first_seen, observed_at, conf)
        _upsert_identifier(db, asset.id, "hostname", obs.device.hostname, first_seen, observed_at, conf)

        db.add(
            AssetObservation(
                organization_id=sensor.organization_id,
                asset_id=asset.id,
                sensor_id=sensor.id,
                source=obs.source,
                evidence=obs.evidence,
                confidence=conf,
                observed_at=observed_at,
                dedup_hash=dedup,
            )
        )
        db.flush()
        stored += 1

    run.ended_at = datetime.now(UTC)
    run.status = "completed"
    run.devices_seen = len(seen_assets)
    sensor.last_seen_at = run.ended_at
    sensor.status = "active"
    db.commit()

    return ObservationIngestStats(
        discovery_run_id=run.id,
        received=len(items),
        observations_stored=stored,
        duplicates_skipped=skipped,
        assets_created=created_count,
        assets_updated=len(updated_assets),
    )


def _get_or_create_endpoint_asset(
    db: Session,
    sensor: Sensor,
    ip: str,
    first_seen: datetime,
    last_seen: datetime,
) -> Asset:
    asset = db.scalar(
        select(Asset).where(
            Asset.organization_id == sensor.organization_id,
            Asset.site_id == sensor.site_id,
            Asset.ip_address == ip,
        )
    )
    if asset is None:
        asset = Asset(
            organization_id=sensor.organization_id,
            site_id=sensor.site_id,
            ip_address=ip,
            asset_type="unknown_device",
            confidence=0.3,
            first_seen_at=first_seen,
            last_seen_at=last_seen,
        )
        db.add(asset)
        db.flush()
        _upsert_identifier(db, asset.id, "ip", ip, first_seen, last_seen, 0.3)
    return asset


def ingest_communications(
    db: Session,
    sensor: Sensor,
    items: list[CommunicationIn],
) -> CommunicationIngestStats:
    created = 0
    updated = 0
    skipped = 0

    for item in items:
        last_seen = _utc(item.last_seen_at)
        first_seen = _utc(item.first_seen_at) if item.first_seen_at else last_seen
        if first_seen > last_seen:
            first_seen = last_seen

        src_asset = _get_or_create_endpoint_asset(db, sensor, item.source_ip, first_seen, last_seen)
        dst_asset = _get_or_create_endpoint_asset(db, sensor, item.destination_ip, first_seen, last_seen)

        proto = (item.protocol or item.transport or "unknown").lower()
        existing = db.scalar(
            select(AssetCommunication).where(
                AssetCommunication.organization_id == sensor.organization_id,
                AssetCommunication.site_id == sensor.site_id,
                AssetCommunication.source_asset_id == src_asset.id,
                AssetCommunication.target_asset_id == dst_asset.id,
                AssetCommunication.protocol == proto,
                AssetCommunication.target_port.is_(item.destination_port)
                if item.destination_port is None
                else AssetCommunication.target_port == item.destination_port,
            )
        )
        if existing is None:
            db.add(
                AssetCommunication(
                    organization_id=sensor.organization_id,
                    site_id=sensor.site_id,
                    source_asset_id=src_asset.id,
                    target_asset_id=dst_asset.id,
                    protocol=proto,
                    source_port=item.source_port,
                    target_port=item.destination_port,
                    connection_count=item.connection_count,
                    first_seen_at=first_seen,
                    last_seen_at=last_seen,
                )
            )
            db.flush()
            created += 1
        else:
            # Aynı zaman aralığı ve aynı sayı tekrar gönderildiyse mükerrer sayma (idempotency).
            if existing.last_seen_at == last_seen and existing.first_seen_at == first_seen:
                skipped += 1
                continue
            if first_seen < existing.first_seen_at:
                existing.first_seen_at = first_seen
            if last_seen > existing.last_seen_at:
                existing.last_seen_at = last_seen
                existing.connection_count += item.connection_count
            updated += 1

    sensor.last_seen_at = datetime.now(UTC)
    sensor.status = "active"
    db.commit()

    return CommunicationIngestStats(
        received=len(items),
        communications_created=created,
        communications_updated=updated,
        duplicates_skipped=skipped,
    )
