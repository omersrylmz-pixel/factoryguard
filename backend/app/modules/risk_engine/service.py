"""Açıklanabilir ve kural tabanlı risk değerlendirme motoru (Bölüm 4.5 & Bölüm 8).

Kurallar:
1. NEW_ASSET (FG-RULE-001): İlk defa görülen ve henüz doğrulanmamış cihaz.
2. UNKNOWN_OT_ASSET (FG-RULE-002): Doğrulanmış endüstriyel protokol trafiği olan ancak türü/üreticisi doğrulanmamış cihaz.
3. UNEXPECTED_COMMUNICATION (FG-RULE-003): Endüstriyel porta doğrulanmamış bir cihazdan, farklı bir ağ bölgesinden gelen onaylanmamış iletişim veya Modbus yazma komutu.
4. UNAPPROVED_REMOTE_PATH (FG-RULE-004): Genel (global/public) IP ile veya uzaktan yönetim portları (SSH/Telnet/RDP/VNC) üzerinden iletişim.
5. KNOWN_VULNERABILITY (FG-RULE-005): Üretici + model + firmware sürümü kanıtıyla kesin eşleşen bilinen güvenlik açığı.
6. ASSET_NOT_SEEN (FG-RULE-006): Tesis ağındaki güncel trafiğe kıyasla tanımlı süre (7 gün) boyunca gözlemlenmeyen cihaz.

Temel ilkeler:
- Hiçbir bulgu "doğrulanmış saldırı" olarak sunulmaz; gözlem (`observation`), olası güvenlik endişesi
  (`potential_concern`) ve doğrulanmış sürüm zafiyet eşleşmesi (`verified_vulnerability_match`) açıkça ayrılır.
- Yalnızca port ipucu (`port_hint`) olan trafik, protokol kanıtı olarak kabul edilmez.
- Tetiklenme koşulu ortadan kalkan `open`/`investigating` bulgular otomatik olarak `resolved` durumuna geçer;
  ancak analistin `accepted` veya `false_positive` olarak işaretlediği kararlar korunur.
"""
from __future__ import annotations

import ipaddress
import uuid
from datetime import UTC, datetime, timedelta
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
MODBUS_WRITE_FUNCTIONS = {
    "WRITE_SINGLE_COIL",
    "WRITE_SINGLE_REGISTER",
    "WRITE_MULTIPLE_COILS",
    "WRITE_MULTIPLE_REGISTERS",
    "READ_WRITE_MULTIPLE_REGISTERS",
    "MASK_WRITE_REGISTER",
    "WRITE_FILE_RECORD",
}
STALE_ASSET_DAYS = 7

RULE_CATALOG: dict[str, dict[str, str]] = {
    "NEW_ASSET": {
        "rule_id": "FG-RULE-001",
        "rule_key": "NEW_ASSET",
        "name": "Yeni Keşfedilen Doğrulanmamış Cihaz",
        "finding_category": "observation",
        "triggering_condition": "asset.is_verified == False",
        "description": "Pasif trafikte görülen ancak teknik ekip tarafından henüz doğrulanmamış cihaz.",
    },
    "UNKNOWN_OT_ASSET": {
        "rule_id": "FG-RULE-002",
        "rule_key": "UNKNOWN_OT_ASSET",
        "name": "Türü veya Üreticisi Doğrulanmamış Endüstriyel Cihaz",
        "finding_category": "potential_concern",
        "triggering_condition": "observed_ot_protocols != [] AND (asset_type == 'unknown_device' OR vendor is None OR not is_verified)",
        "description": "Uygulama katmanında doğrulanmış endüstriyel protokol konuşan fakat kimliği eksik cihaz.",
    },
    "UNEXPECTED_COMMUNICATION": {
        "rule_id": "FG-RULE-003",
        "rule_key": "UNEXPECTED_COMMUNICATION",
        "name": "Beklenmeyen Endüstriyel İletişim veya Yazma Komutu",
        "finding_category": "potential_concern",
        "triggering_condition": "not is_baseline_approved AND ((ot_flow AND (not src.is_verified OR cross_zone)) OR modbus_write_on_unverified)",
        "description": "Baseline onayı olmayan bölgeler arası / doğrulanmamış kaynaklı OT iletişimi veya Modbus yazma komutu.",
    },
    "UNAPPROVED_REMOTE_PATH": {
        "rule_id": "FG-RULE-004",
        "rule_key": "UNAPPROVED_REMOTE_PATH",
        "name": "Onaylanmamış Uzaktan Yönetim veya Dış Ağ Bağlantısı",
        "finding_category": "potential_concern",
        "triggering_condition": "target_port IN {22, 23, 3389, 5900} OR peer_ip.is_global_unicast",
        "description": "Üretim ağında SSH/Telnet/RDP/VNC kullanımı veya genel (public) IP adresiyle doğrudan iletişim.",
    },
    "KNOWN_VULNERABILITY": {
        "rule_id": "FG-RULE-005",
        "rule_key": "KNOWN_VULNERABILITY",
        "name": "Doğrulanmış Ürün ve Sürüm Kanıtıyla Bilinen Güvenlik Açığı",
        "finding_category": "verified_vulnerability_match",
        "triggering_condition": "lower(asset.vendor, asset.model, asset.firmware_version) == lower(catalog.vendor, catalog.product, catalog.version_exact)",
        "description": "Cihazın üretici, model ve tam firmware sürümü güvenlik açığı kataloğundaki CVE kaydıyla birebir eşleşti.",
    },
    "ASSET_NOT_SEEN": {
        "rule_id": "FG-RULE-006",
        "rule_key": "ASSET_NOT_SEEN",
        "name": "Belirli Süredir Ağda Gözlemlenmeyen Cihaz",
        "finding_category": "observation",
        "triggering_condition": f"(site_latest_seen_at - asset.last_seen_at) >= {STALE_ASSET_DAYS} days",
        "description": "Tesis ağında aktif trafik devam ederken tanımlı eşik süreden uzun süredir gözlemlenmeyen cihaz.",
    },
}


def _utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=UTC)


def _is_global_unicast_ip(ip_str: str | None) -> bool:
    """Yalnızca gerçek genel (public) unicast IP adresleri için True döner.
    RFC1918 özel ağlar, multicast, broadcast, link-local ve loopback için False döner."""
    if not ip_str:
        return False
    try:
        addr = ipaddress.ip_address(ip_str)
    except ValueError:
        return False
    if (
        addr.is_private
        or addr.is_multicast
        or addr.is_unspecified
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_reserved
    ):
        return False
    if addr.version == 4 and (str(addr) == "255.255.255.255" or str(addr).endswith(".255")):
        return False
    return addr.is_global


def _has_inventory_gap(asset: Asset) -> bool:
    return (not asset.is_verified) or (not asset.vendor) or (asset.zone_id is None)


def _enrich_evidence(
    rule_key: str,
    evaluated_at: datetime,
    evidence: dict[str, Any],
    triggering_condition: str | None = None,
) -> dict[str, Any]:
    meta = RULE_CATALOG.get(rule_key, {})
    return {
        "rule_id": meta.get("rule_id", rule_key),
        "rule_name": meta.get("name", rule_key),
        "finding_category": meta.get("finding_category", "potential_concern"),
        "triggering_condition": triggering_condition or meta.get("triggering_condition", ""),
        "evaluated_at": evaluated_at.isoformat(),
        **evidence,
    }


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
    evaluated_at: datetime,
    triggering_condition: str | None = None,
) -> tuple[RiskFinding, bool]:
    """Bulguyu oluşturur veya mevcutsa (mükerrer kayıt açmadan) günceller.

    - Analist bulguyu `false_positive` veya `accepted` olarak işaretlediyse durum korunur.
    - Daha önce otomatik olarak `resolved` olmuş bir bulgu koşul tekrar oluştuğunda yeniden `open` yapılır.
    """
    full_evidence = _enrich_evidence(rule_key, evaluated_at, evidence, triggering_condition)
    obs_utc = _utc(observed_at)
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
            evidence=full_evidence,
            recommendation=recommendation,
            status="open",
            first_seen_at=obs_utc,
            last_seen_at=obs_utc,
        )
        db.add(finding)
        db.flush()
        return finding, True

    if obs_utc > _utc(existing.last_seen_at):
        existing.last_seen_at = obs_utc
    existing.title = title
    existing.description = description
    existing.recommendation = recommendation
    existing.score = score
    existing.severity = severity
    existing.confidence = confidence
    existing.evidence = full_evidence
    if existing.status == "resolved":
        existing.status = "open"
        existing.resolved_at = None
    return existing, False


def evaluate_organization_risks(
    db: Session,
    organization_id: uuid.UUID,
    site_id: uuid.UUID | None = None,
) -> dict[str, int]:
    """Organizasyondaki (veya belirli bir fabrikadaki) tüm varlık ve iletişimleri 6 kurala göre değerlendirir."""
    stmt = select(Asset).where(Asset.organization_id == organization_id, Asset.is_active.is_(True))
    if site_id is not None:
        stmt = stmt.where(Asset.site_id == site_id)
    assets = list(db.scalars(stmt).all())
    assets_by_id = {a.id: a for a in assets}

    now = datetime.now(UTC)
    created_count = 0
    updated_count = 0
    active_keys: set[tuple[uuid.UUID, str, str]] = set()

    # Fabrika bazında en güncel ağ gözlem zamanı (ASSET_NOT_SEEN referans saati)
    site_latest_seen: dict[uuid.UUID, datetime] = {}
    for a in assets:
        if a.last_seen_at:
            ts = _utc(a.last_seen_at)
            prev = site_latest_seen.get(a.site_id)
            if prev is None or ts > prev:
                site_latest_seen[a.site_id] = ts

    # Varlık bazlı doğrulanmış protokolleri ve Modbus yazma kanıtlarını topla
    obs_rows = db.scalars(
        select(AssetObservation).where(AssetObservation.organization_id == organization_id)
    ).all()
    protocols_by_asset: dict[uuid.UUID, set[str]] = {}
    logs_by_asset: dict[uuid.UUID, set[str]] = {}
    write_funcs_by_asset: dict[uuid.UUID, set[str]] = {}
    write_sources_by_asset: dict[uuid.UUID, set[str]] = {}
    for o in obs_rows:
        for p in o.evidence.get("observed_protocols") or []:
            if isinstance(p, str) and p and not p.endswith("?"):
                protocols_by_asset.setdefault(o.asset_id, set()).add(p.lower())
        for lg in o.evidence.get("source_logs") or []:
            if isinstance(lg, str):
                logs_by_asset.setdefault(o.asset_id, set()).add(lg)
        for fn in o.evidence.get("modbus_functions") or []:
            if isinstance(fn, str) and fn.upper() in MODBUS_WRITE_FUNCTIONS:
                write_funcs_by_asset.setdefault(o.asset_id, set()).add(fn.upper())
        for src_ip in o.evidence.get("modbus_write_sources") or []:
            if isinstance(src_ip, str):
                write_sources_by_asset.setdefault(o.asset_id, set()).add(src_ip)

    # İletişim kayıtlarını topla (yalnızca protocol_confidence == 'observed' olanlar cihaz protokol kanıtıdır)
    comm_stmt = select(AssetCommunication).where(AssetCommunication.organization_id == organization_id)
    if site_id is not None:
        comm_stmt = comm_stmt.where(AssetCommunication.site_id == site_id)
    comms = list(db.scalars(comm_stmt).all())
    for c in comms:
        if (
            c.protocol
            and c.protocol != "unknown"
            and not c.protocol.endswith("?")
            and c.protocol_confidence == "observed"
        ):
            protocols_by_asset.setdefault(c.source_asset_id, set()).add(c.protocol.lower())
            protocols_by_asset.setdefault(c.target_asset_id, set()).add(c.protocol.lower())

    catalog = list(db.scalars(select(VulnerabilityCatalog)).all())

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
            dedup = "unverified_asset"
            active_keys.add((asset.id, "NEW_ASSET", dedup))
            _, created = _upsert_finding(
                db,
                organization_id=organization_id,
                asset_id=asset.id,
                rule_key="NEW_ASSET",
                dedup_key=dedup,
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
                evaluated_at=now,
            )
            created_count += int(created)
            updated_count += int(not created)

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
            dedup = "unknown_ot_device"
            active_keys.add((asset.id, "UNKNOWN_OT_ASSET", dedup))
            _, created = _upsert_finding(
                db,
                organization_id=organization_id,
                asset_id=asset.id,
                rule_key="UNKNOWN_OT_ASSET",
                dedup_key=dedup,
                title=f"Türü/üreticisi doğrulanmamış endüstriyel cihaz ({', '.join(p.upper() for p in ot_protos)})",
                description=(
                    f"Cihaz üzerinde doğrulanmış endüstriyel protokol ({', '.join(ot_protos)}) trafiği gözlemlendi ancak "
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
                evaluated_at=now,
            )
            created_count += int(created)
            updated_count += int(not created)

        # --- KURAL 3B (Faz 2): Endüstriyel Yazma / Kontrol Komutu Tespiti (MODBUS WRITE) ---
        write_funcs = sorted(write_funcs_by_asset.get(asset.id, set()))
        write_sources = sorted(write_sources_by_asset.get(asset.id, set()))
        if write_funcs and not asset.is_verified:
            score_res = calculate_risk_score(
                asset_criticality="critical",
                network_exposure_ratio=0.6,
                has_unexpected_behavior=True,
                has_inventory_gap=inv_gap,
            )
            dedup = "ot_write_command_detected"
            active_keys.add((asset.id, "UNEXPECTED_COMMUNICATION", dedup))
            _, created = _upsert_finding(
                db,
                organization_id=organization_id,
                asset_id=asset.id,
                rule_key="UNEXPECTED_COMMUNICATION",
                dedup_key=dedup,
                title=f"Endüstriyel yazma/kontrol komutu tespit edildi ({', '.join(write_funcs)})",
                description=(
                    f"Doğrulanmamış cihaz ({asset.ip_address}) üzerinde fiziksel prosesi değiştirebilecek "
                    f"Modbus yazma fonksiyonları ({', '.join(write_funcs)}) gözlemlendi."
                ),
                severity=score_res.severity,
                score=score_res.score,
                confidence=0.95,
                evidence={
                    "what_observed": f"{asset.ip_address} adresli cihaz trafiğinde {', '.join(write_funcs)} komutları gözlendi.",
                    "why_important": "Modbus yazma fonksiyonları PLC bobin (coil) ve register değerlerini doğrudan değiştirerek üretimi durdurabilir veya fiziksel hasara yol açabilir.",
                    "supporting_data": {
                        "ip_address": asset.ip_address,
                        "mac_address": asset.mac_address,
                        "modbus_write_functions": write_funcs,
                        "initiating_client_ips": write_sources,
                    },
                    "score_breakdown": score_res.breakdown,
                },
                recommendation=(
                    "Bu yazma komutlarını gönderen mühendislik istasyonu veya HMI'ın yetkili olup olmadığını "
                    "derhal doğrulayın; yetkisizse anahtarlayıcı (switch) ACL veya endüstriyel güvenlik duvarı ile "
                    "salt-okunur (read-only) kısıtlama uygulayın."
                ),
                observed_at=asset.last_seen_at or now,
                evaluated_at=now,
                triggering_condition="modbus_write_functions != [] AND not asset.is_verified",
            )
            created_count += int(created)
            updated_count += int(not created)

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
                    active_keys.add((asset.id, "KNOWN_VULNERABILITY", vuln.cve_id))
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
                        evaluated_at=now,
                    )
                    created_count += int(created)
                    updated_count += int(not created)

        # --- KURAL 6: ASSET_NOT_SEEN (Belirli süredir gözlemlenmeyen cihaz) ---
        ref_time = site_latest_seen.get(asset.site_id)
        if ref_time and asset.last_seen_at:
            silent_delta = ref_time - _utc(asset.last_seen_at)
            if silent_delta >= timedelta(days=STALE_ASSET_DAYS):
                days_unseen = int(silent_delta.total_seconds() // 86400)
                score_res = calculate_risk_score(
                    asset_criticality=asset.criticality,
                    network_exposure_ratio=0.1,
                    has_unexpected_behavior=True,
                    has_inventory_gap=inv_gap,
                )
                dedup = "stale_asset"
                active_keys.add((asset.id, "ASSET_NOT_SEEN", dedup))
                _, created = _upsert_finding(
                    db,
                    organization_id=organization_id,
                    asset_id=asset.id,
                    rule_key="ASSET_NOT_SEEN",
                    dedup_key=dedup,
                    title=f"Cihaz {days_unseen} gündür ağda gözlemlenmedi ({asset.ip_address or asset.name or 'Bilinmeyen'})",
                    description=(
                        f"Bu cihaz en son {_utc(asset.last_seen_at).strftime('%Y-%m-%d %H:%M UTC')} tarihinde gözlemlendi; "
                        f"tesis ağındaki en güncel gözlemden bu yana {days_unseen} gün geçti."
                    ),
                    severity=score_res.severity,
                    score=score_res.score,
                    confidence=0.9,
                    evidence={
                        "what_observed": f"{asset.ip_address or asset.name} cihazı {days_unseen} gündür pasif trafikte görülmedi.",
                        "why_important": "Uzun süre trafik üretmeyen bir OT cihazı arızalanmış, ağdan kopmuş, IP değiştirmiş veya devre dışı bırakılmış olabilir.",
                        "supporting_data": {
                            "ip_address": asset.ip_address,
                            "mac_address": asset.mac_address,
                            "last_seen_at": _utc(asset.last_seen_at).isoformat(),
                            "site_latest_seen_at": ref_time.isoformat(),
                            "days_unseen": days_unseen,
                            "threshold_days": STALE_ASSET_DAYS,
                        },
                        "score_breakdown": score_res.breakdown,
                    },
                    recommendation=(
                        "Cihazın sahada çalışır durumda olup olmadığını ve SPAN/port mirror kapsamını kontrol edin; "
                        "kalıcı olarak kaldırıldıysa envanterde pasif olarak işaretleyin."
                    ),
                    observed_at=ref_time,
                    evaluated_at=now,
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
        proto_clean = proto.rstrip("?")

        # --- KURAL 3: UNEXPECTED_COMMUNICATION ---
        # Baseline olarak onaylanmış akışlar beklenmeyen iletişim bulgusu üretmez
        is_ot_comm = (port in OT_CRITICAL_PORTS) or (
            proto_clean in INDUSTRIAL_PROTOCOLS and comm.protocol_confidence == "observed"
        )
        cross_zone = bool(src.zone_id and dst.zone_id and src.zone_id != dst.zone_id)
        unverified_initiator = not src.is_verified
        if (not comm.is_baseline_approved) and is_ot_comm and (unverified_initiator or cross_zone):
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
            active_keys.add((dst.id, "UNEXPECTED_COMMUNICATION", dedup))
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
                confidence=0.85 if comm.protocol_confidence == "observed" else 0.65,
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
                        "protocol_confidence": comm.protocol_confidence,
                        "target_port": port,
                        "connection_count": comm.connection_count,
                        "cross_zone": cross_zone,
                    },
                    "score_breakdown": score_res.breakdown,
                },
                recommendation=(
                    f"{src.ip_address} cihazının {dst.ip_address} ile endüstriyel haberleşme yapmasının "
                    "operasyonel olarak gerekli olup olmadığını doğrulayın; gereksizse güvenlik duvarı/VLAN "
                    "kurallarıyla sınırlandırın, beklenen bir trafikse kaynak cihazı veya baseline akışını onaylayın."
                ),
                observed_at=comm.last_seen_at,
                evaluated_at=now,
            )
            created_count += int(created)
            updated_count += int(not created)

        # --- KURAL 4: UNAPPROVED_REMOTE_PATH ---
        # Genel (global unicast) IP ile haberleşme VEYA uzaktan yönetim portları (SSH/Telnet/RDP/VNC)
        external_peer = _is_global_unicast_ip(src.ip_address) or _is_global_unicast_ip(dst.ip_address)
        is_remote_admin_port = port in REMOTE_ADMIN_PORTS
        if external_peer or is_remote_admin_port:
            target_asset = dst if not _is_global_unicast_ip(dst.ip_address) else src
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
            active_keys.add((target_asset.id, "UNAPPROVED_REMOTE_PATH", dedup))
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
                evaluated_at=now,
            )
            created_count += int(created)
            updated_count += int(not created)

    # Koşulu ortadan kalkan tüm açık/inceleniyor bulguları otomatik olarak 'resolved' durumuna geçir
    if assets_by_id:
        open_findings = db.scalars(
            select(RiskFinding).where(
                RiskFinding.organization_id == organization_id,
                RiskFinding.asset_id.in_(list(assets_by_id.keys())),
                RiskFinding.status.in_(("open", "investigating")),
            )
        ).all()
        for f in open_findings:
            if (f.asset_id, f.rule_key, f.dedup_key) not in active_keys:
                f.status = "resolved"
                f.resolved_at = now

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
