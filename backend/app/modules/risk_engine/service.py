"""Açıklanabilir ve kural tabanlı risk değerlendirme motoru (Bölüm 4.5).

Kurallar:
1. NEW_ASSET: İlk defa görülen ve henüz doğrulanmamış cihaz.
2. UNKNOWN_OT_ASSET: Endüstriyel protokol trafiği olan ancak türü/üreticisi doğrulanmamış cihaz.
3. UNEXPECTED_COMMUNICATION: Endüstriyel porta doğrulanmamış bir cihazdan veya farklı bir ağ bölgesinden gelen iletişim.
4. UNAPPROVED_REMOTE_PATH: Özel ağ dışı (public) IP ile veya uzaktan yönetim portları (SSH/Telnet/RDP/VNC) üzerinden iletişim.
5. KNOWN_VULNERABILITY: Üretici + model + firmware sürümü kanıtıyla kesin eşleşen bilinen güvenlik açığı.
"""
from __future__ import annotations

import ipaddress
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Asset,
    AssetCommunication,
    AssetObservation,
    AssetVulnerability,
    RiskFinding,
    VulnerabilityCatalog,
)
from app.modules.discovery.classifier import INDUSTRIAL_PROTOCOLS
from app.modules.risk_engine.scoring import calculate_risk_score

OT_CRITICAL_PORTS = {502: "Modbus TCP", 102: "Siemens S7", 44818: "EtherNet/IP", 4840: "OPC UA", 20000: "DNP3"}
REMOTE_ADMIN_PORTS = {22: "SSH", 23: "Telnet", 3389: "RDP", 5900: "VNC"}


def _is_private_ip(ip_str: str | None) -> bool:
    if not ip_str:
        return True
    try:
        return ipaddress.ip_address(ip_str).is_private
    except ValueError:
        return True


def _has_inventory_gap(asset: Asset) -> bool:
    return (not asset.is_verified) or (not asset.vendor) or (asset.zone_id is None)


def _upsert_finding(
    db: Session,
    *,
    organization_id: uuid.UUID,
    asset_id: uuid.UUID,
    rule_key: str,
    dedup_key: str,
    title: str,
    description: str,
    severity: str,
    score: int,
    confidence: float,
    evidence: dict[str, Any],
    recommendation: str,
    observed_at: datetime,
) -> tuple[RiskFinding, bool]:
    """Bulguyu oluşturur veya mevcutsa (mükerrer kayıt açmadan) günceller.

    Kullanıcı bulguyu `false_positive` veya `accepted` olarak işaretlediyse durum korunur.
    """
    existing = db.scalar(
        select(RiskFinding).where(
            RiskFinding.organization_id == organization_id,
            RiskFinding.asset_id == asset_id,
            RiskFinding.rule_key == rule_key,
            RiskFinding.dedup_key == dedup_key,
        )
    )
    if existing is None:
        finding = RiskFinding(
            organization_id=organization_id,
            asset_id=asset_id,
            rule_key=rule_key,
            dedup_key=dedup_key,
            title=title,
            description=description,
            severity=severity,
            score=score,
            confidence=confidence,
            evidence=evidence,
            recommendation=recommendation,
            status="open",
            first_seen_at=observed_at,
            last_seen_at=observed_at,
        )
        db.add(finding)
        db.flush()
        return finding, True

    if observed_at > existing.last_seen_at:
        existing.last_seen_at = observed_at
    existing.score = score
    existing.severity = severity
    existing.confidence = confidence
    existing.evidence = evidence
    return existing, False


def _auto_resolve_if_open(
    db: Session,
    organization_id: uuid.UUID,
    asset_id: uuid.UUID,
    rule_key: str,
) -> None:
    now = datetime.now(UTC)
    open_findings = db.scalars(
        select(RiskFinding).where(
            RiskFinding.organization_id == organization_id,
            RiskFinding.asset_id == asset_id,
            RiskFinding.rule_key == rule_key,
            RiskFinding.status.in_(("open", "investigating")),
        )
    ).all()
    for f in open_findings:
        f.status = "resolved"
        f.resolved_at = now


def evaluate_organization_risks(
    db: Session,
    organization_id: uuid.UUID,
    site_id: uuid.UUID | None = None,
) -> dict[str, int]:
    """Organizasyondaki (veya belirli bir fabrikadaki) tüm varlık ve iletişimleri 5 kurala göre değerlendirir."""
    stmt = select(Asset).where(Asset.organization_id == organization_id, Asset.is_active.is_(True))
    if site_id is not None:
        stmt = stmt.where(Asset.site_id == site_id)
    assets = db.scalars(stmt).all()
    assets_by_id = {a.id: a for a in assets}

    now = datetime.now(UTC)
    created_count = 0
    updated_count = 0

    # Varlık bazlı gözlemlenen protokolleri topla
    obs_rows = db.scalars(
        select(AssetObservation).where(AssetObservation.organization_id == organization_id)
    ).all()
    protocols_by_asset: dict[uuid.UUID, set[str]] = {}
    logs_by_asset: dict[uuid.UUID, set[str]] = {}
    for o in obs_rows:
        for p in o.evidence.get("observed_protocols") or []:
            if isinstance(p, str):
                protocols_by_asset.setdefault(o.asset_id, set()).add(p.lower())
        for lg in o.evidence.get("source_logs") or []:
            if isinstance(lg, str):
                logs_by_asset.setdefault(o.asset_id, set()).add(lg)

    # İletişim kayıtlarını topla
    comm_stmt = select(AssetCommunication).where(AssetCommunication.organization_id == organization_id)
    if site_id is not None:
        comm_stmt = comm_stmt.where(AssetCommunication.site_id == site_id)
    comms = db.scalars(comm_stmt).all()
    for c in comms:
        if c.protocol and c.protocol != "unknown":
            protocols_by_asset.setdefault(c.source_asset_id, set()).add(c.protocol.lower())
            protocols_by_asset.setdefault(c.target_asset_id, set()).add(c.protocol.lower())

    # Güvenlik açığı kataloğunu belleğe al
    catalog = db.scalars(select(VulnerabilityCatalog)).all()

    for asset in assets:
        inv_gap = _has_inventory_gap(asset)
        asset_protos = protocols_by_asset.get(asset.id, set())
        ot_protos = sorted(asset_protos & INDUSTRIAL_PROTOCOLS)

        # --- KURAL 1: NEW_ASSET ---
        if not asset.is_verified:
            score_res = calculate_risk_score(
                asset_criticality=asset.criticality,
                network_exposure_ratio=0.2,
                has_unexpected_behavior=False,
                has_inventory_gap=True,
            )
            _, created = _upsert_finding(
                db,
                organization_id=organization_id,
                asset_id=asset.id,
                rule_key="NEW_ASSET",
                dedup_key="unverified_asset",
                title=f"Yeni keşfedilen doğrulanmamış cihaz ({asset.ip_address or asset.name or 'Bilinmeyen'})",
                description=(
                    "Üretim ağında pasif trafik analiziyle keşfedilen bu cihaz henüz teknik ekip tarafından "
                    "doğrulanmadı ve envanter sahipliği atanmadı."
                ),
                severity=score_res.severity,
                score=score_res.score,
                confidence=round(max(asset.confidence, 0.8), 2),
                evidence={
                    "what_observed": f"Ağda {asset.ip_address or 'IP belirsiz'} ({asset.mac_address or 'MAC belirsiz'}) adresli doğrulanmamış cihaz trafiği gözlendi.",
                    "why_important": "Doğrulanmamış cihazlar izinsiz bağlanmış bir sistem veya envanter dışı bırakılmış kritik bir ekipman olabilir.",
                    "supporting_data": {
                        "ip_address": asset.ip_address,
                        "mac_address": asset.mac_address,
                        "hostname": asset.hostname,
                        "source_logs": sorted(logs_by_asset.get(asset.id, set())),
                        "first_seen_at": asset.first_seen_at.isoformat(),
                    },
                    "score_breakdown": score_res.breakdown,
                },
                recommendation=(
                    "Cihazın fiziksel ve ağ bağlantısını kontrol edin; bilinen bir üretim ekipmanıysa Cihaz Detay "
                    "ekranından türünü, üreticisini ve bölgesini girip 'Doğrulandı' olarak işaretleyin."
                ),
                observed_at=asset.last_seen_at or now,
            )
            created_count += int(created)
            updated_count += int(not created)
        else:
            _auto_resolve_if_open(db, organization_id, asset.id, "NEW_ASSET")

        # --- KURAL 2: UNKNOWN_OT_ASSET ---
        is_unidentified_ot = bool(ot_protos) and (
            asset.asset_type == "unknown_device" or not asset.vendor or not asset.is_verified
        )
        if is_unidentified_ot:
            score_res = calculate_risk_score(
                asset_criticality=asset.criticality if asset.criticality != "medium" else "high",
                network_exposure_ratio=0.4,
                has_unexpected_behavior=False,
                has_inventory_gap=True,
            )
            _, created = _upsert_finding(
                db,
                organization_id=organization_id,
                asset_id=asset.id,
                rule_key="UNKNOWN_OT_ASSET",
                dedup_key="unknown_ot_device",
                title=f"Türü/üreticisi doğrulanmamış endüstriyel cihaz ({', '.join(p.upper() for p in ot_protos)})",
                description=(
                    f"Cihaz üzerinde endüstriyel protokol ({', '.join(ot_protos)}) trafiği gözlemlendi ancak "
                    "cihazın kesin türü, üreticisi veya model bilgisi henüz doğrulanmadı."
                ),
                severity=score_res.severity,
                score=score_res.score,
                confidence=0.85,
                evidence={
                    "what_observed": f"{asset.ip_address} adresli cihazda {', '.join(ot_protos)} protokolü gözlendi fakat envanter kimliği eksik.",
                    "why_important": "Endüstriyel haberleşme yapan cihazların model ve firmware bilgisi bilinmeden güvenlik açığı ve etki analizi yapılamaz.",
                    "supporting_data": {
                        "ip_address": asset.ip_address,
                        "mac_address": asset.mac_address,
                        "observed_protocols": ot_protos,
                        "current_asset_type": asset.asset_type,
                        "vendor": asset.vendor,
                    },
                    "score_breakdown": score_res.breakdown,
                },
                recommendation=(
                    "Otomasyon ekibiyle birlikte bu IP adresine sahip PLC/HMI/SCADA cihazını tespit edin; "
                    "üretici, model ve firmware bilgilerini envantere işleyip doğrulayın."
                ),
                observed_at=asset.last_seen_at or now,
            )
            created_count += int(created)
            updated_count += int(not created)
        elif asset.is_verified and asset.asset_type != "unknown_device" and asset.vendor:
            _auto_resolve_if_open(db, organization_id, asset.id, "UNKNOWN_OT_ASSET")

        # --- KURAL 5: KNOWN_VULNERABILITY (yalnızca yeterli ürün + sürüm kanıtıyla) ---
        if asset.vendor and asset.model and asset.firmware_version:
            v_norm = asset.vendor.strip().lower()
            m_norm = asset.model.strip().lower()
            fw_norm = asset.firmware_version.strip().lower()
            for vuln in catalog:
                if (
                    vuln.vendor.strip().lower() == v_norm
                    and vuln.product.strip().lower() == m_norm
                    and vuln.version_exact.strip().lower() == fw_norm
                ):
                    av = db.scalar(
                        select(AssetVulnerability).where(
                            AssetVulnerability.asset_id == asset.id,
                            AssetVulnerability.vulnerability_id == vuln.id,
                        )
                    )
                    if av is None:
                        av = AssetVulnerability(
                            asset_id=asset.id,
                            vulnerability_id=vuln.id,
                            match_status="verified_match",
                        )
                        db.add(av)
                        db.flush()
                    if av.match_status == "dismissed":
                        continue

                    score_res = calculate_risk_score(
                        asset_criticality=asset.criticality,
                        network_exposure_ratio=0.5,
                        verified_vuln_cvss=vuln.cvss,
                        has_unexpected_behavior=False,
                        has_inventory_gap=inv_gap,
                    )
                    conf = 0.95 if asset.is_verified else 0.75
                    _, created = _upsert_finding(
                        db,
                        organization_id=organization_id,
                        asset_id=asset.id,
                        rule_key="KNOWN_VULNERABILITY",
                        dedup_key=vuln.cve_id,
                        title=f"Bilinen güvenlik açığı eşleşmesi: {vuln.cve_id} ({asset.vendor} {asset.model})",
                        description=vuln.description,
                        severity=score_res.severity,
                        score=score_res.score,
                        confidence=conf,
                        evidence={
                            "what_observed": f"Cihazın ürün ve sürüm bilgileri ({asset.vendor} {asset.model} {asset.firmware_version}), {vuln.cve_id} kaydıyla tam eşleşti.",
                            "why_important": f"{vuln.cve_id} (CVSS {vuln.cvss}) üretim sürekliliğini veya cihaz bütünlüğünü tehlikeye atabilir.",
                            "supporting_data": {
                                "cve_id": vuln.cve_id,
                                "cpe": vuln.cpe,
                                "cvss": vuln.cvss,
                                "matched_vendor": asset.vendor,
                                "matched_model": asset.model,
                                "matched_firmware": asset.firmware_version,
                                "asset_verified": asset.is_verified,
                            },
                            "score_breakdown": score_res.breakdown,
                        },
                        recommendation=vuln.recommendation
                        or (
                            f"Üreticinin {vuln.cve_id} için yayımladığı güvenlik bültenini inceleyin; "
                            "planlı bakım penceresinde firmware güncellemesi veya ağ segmentasyonu uygulayın."
                        ),
                        observed_at=asset.last_seen_at or now,
                    )
                    created_count += int(created)
                    updated_count += int(not created)

    # --- İLETİŞİM TABANLI KURALLAR (KURAL 3 & KURAL 4) ---
    for comm in comms:
        src = assets_by_id.get(comm.source_asset_id) or db.get(Asset, comm.source_asset_id)
        dst = assets_by_id.get(comm.target_asset_id) or db.get(Asset, comm.target_asset_id)
        if not src or not dst:
            continue

        port = comm.target_port
        proto = (comm.protocol or "unknown").lower()

        # --- KURAL 3: UNEXPECTED_COMMUNICATION ---
        # Endüstriyel bir porta/protokole doğrulanmamış bir kaynak cihazdan veya farklı bir zone'dan erişim
        is_ot_comm = (port in OT_CRITICAL_PORTS) or (proto in INDUSTRIAL_PROTOCOLS)
        cross_zone = bool(src.zone_id and dst.zone_id and src.zone_id != dst.zone_id)
        unverified_initiator = not src.is_verified
        if is_ot_comm and (unverified_initiator or cross_zone):
            reason_str = (
                "farklı ağ bölgeleri arasında"
                if cross_zone
                else "henüz doğrulanmamış bir kaynak cihazdan"
            )
            score_res = calculate_risk_score(
                asset_criticality=dst.criticality,
                network_exposure_ratio=0.5 if cross_zone else 0.4,
                has_unexpected_behavior=True,
                has_inventory_gap=_has_inventory_gap(dst) or _has_inventory_gap(src),
            )
            dedup = f"{src.id}->{dst.id}:{proto}:{port}"
            _, created = _upsert_finding(
                db,
                organization_id=organization_id,
                asset_id=dst.id,
                rule_key="UNEXPECTED_COMMUNICATION",
                dedup_key=dedup,
                title=f"Beklenmeyen endüstriyel iletişim: {src.ip_address} → {dst.ip_address}:{port or proto}",
                description=(
                    f"{dst.ip_address} cihazına {src.ip_address} adresinden ({reason_str}) "
                    f"{proto.upper()} (port {port}) üzerinden {comm.connection_count} bağlantı gözlemlendi."
                ),
                severity=score_res.severity,
                score=score_res.score,
                confidence=0.85,
                evidence={
                    "what_observed": f"{src.ip_address} → {dst.ip_address} arasında {proto.upper()} (hedef port: {port}) trafiği ({comm.connection_count} bağlantı) gözlendi.",
                    "why_important": f"Endüstriyel kontrol portlarına {reason_str} yapılan erişimler yetkisiz komut veya yapılandırma okuma/yazma riski taşır.",
                    "supporting_data": {
                        "source_asset_id": str(src.id),
                        "source_ip": src.ip_address,
                        "source_verified": src.is_verified,
                        "target_asset_id": str(dst.id),
                        "target_ip": dst.ip_address,
                        "protocol": proto,
                        "target_port": port,
                        "connection_count": comm.connection_count,
                        "cross_zone": cross_zone,
                    },
                    "score_breakdown": score_res.breakdown,
                },
                recommendation=(
                    f"{src.ip_address} cihazının {dst.ip_address} ile endüstriyel haberleşme yapmasının "
                    "operasyonel olarak gerekli olup olmadığını doğrulayın; gereksizse güvenlik duvarı/VLAN "
                    "kurallarıyla sınırlandırın, beklenen bir trafikse kaynak cihazı doğrulayın."
                ),
                observed_at=comm.last_seen_at,
            )
            created_count += int(created)
            updated_count += int(not created)

        # --- KURAL 4: UNAPPROVED_REMOTE_PATH ---
        # Public (özel ağ dışı) IP ile haberleşme VEYA uzaktan yönetim portları (SSH/Telnet/RDP/VNC)
        external_peer = (not _is_private_ip(src.ip_address)) or (not _is_private_ip(dst.ip_address))
        is_remote_admin_port = port in REMOTE_ADMIN_PORTS
        if external_peer or is_remote_admin_port:
            target_asset = dst if _is_private_ip(dst.ip_address) else src
            path_desc = (
                f"Özel ağ dışı (public) IP bağlantısı ({src.ip_address} → {dst.ip_address})"
                if external_peer
                else f"Uzaktan yönetim portu ({REMOTE_ADMIN_PORTS.get(port, str(port))} / TCP {port}) kullanımı ({src.ip_address} → {dst.ip_address})"
            )
            score_res = calculate_risk_score(
                asset_criticality=target_asset.criticality,
                network_exposure_ratio=1.0 if external_peer else 0.75,
                has_unexpected_behavior=True,
                has_inventory_gap=_has_inventory_gap(target_asset),
            )
            dedup = f"remote:{src.id}->{dst.id}:{port}"
            _, created = _upsert_finding(
                db,
                organization_id=organization_id,
                asset_id=target_asset.id,
                rule_key="UNAPPROVED_REMOTE_PATH",
                dedup_key=dedup,
                title=f"Onaylanmamış uzaktan bağlantı yolu: {src.ip_address} → {dst.ip_address}:{port or proto}",
                description=(
                    f"Üretim ağında {path_desc} tespit edildi. Endüstriyel ağlara doğrudan dış ağ erişimi "
                    "veya denetimsiz uzaktan yönetim protokolleri yüksek risk oluşturur."
                ),
                severity=score_res.severity,
                score=score_res.score,
                confidence=0.9,
                evidence={
                    "what_observed": path_desc,
                    "why_important": "Onaylanmamış uzaktan erişim yolları, üretim ağına yetkisiz giriş ve fidye yazılımı yayılımı için birincil giriş noktasıdır.",
                    "supporting_data": {
                        "source_ip": src.ip_address,
                        "target_ip": dst.ip_address,
                        "protocol": proto,
                        "target_port": port,
                        "external_ip_involved": external_peer,
                        "remote_admin_service": REMOTE_ADMIN_PORTS.get(port) if port else None,
                        "connection_count": comm.connection_count,
                    },
                    "score_breakdown": score_res.breakdown,
                },
                recommendation=(
                    "Bu bağlantının yetkili bir bakım/uzaktan erişim kanalından (ör. endüstriyel DMZ / jump host) "
                    "gelip gelmediğini kontrol edin. Doğrudan internet veya düz metin (Telnet/VNC) erişimlerini kapatın."
                ),
                observed_at=comm.last_seen_at,
            )
            created_count += int(created)
            updated_count += int(not created)

    db.commit()
    total_open = (
        db.scalar(
            select(func.count()).where(
                RiskFinding.organization_id == organization_id,
                RiskFinding.status == "open",
            )
        )
        or 0
    )
    return {
        "created": created_count,
        "updated": updated_count,
        "total_open": total_open,
    }
