"""Raporlama uç noktaları (`/api/v1/reports`).

- `GET /api/v1/reports/summary`: Yönetici özeti ve önizleme istatistikleri (JSON)
- `GET /api/v1/reports/inventory`: Cihaz envanteri raporu (`format=csv|pdf`)
- `GET /api/v1/reports/risks`: Yönetici ve teknik risk bulguları raporu (`format=csv|pdf`)
"""
from __future__ import annotations

import csv
import io
import uuid
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select

from app.core.deps import DbSession, Tenant, client_ip
from app.models import Asset, AssetCommunication, Organization, RiskFinding, Sensor, Site, Zone
from app.modules.audit.service import record
from app.modules.discovery.classifier import infer_from_evidence
from app.modules.reports.pdf_writer import build_pdf_document
from app.modules.sensors.router import compute_connectivity

router = APIRouter(prefix="/reports", tags=["reports"])

_CRIT_LABEL_TR = {
    "critical": "Kritik",
    "high": "Yüksek",
    "medium": "Orta",
    "low": "Düşük",
}

_STATUS_LABEL_TR = {
    "open": "Açık",
    "investigating": "İnceleniyor",
    "accepted": "Kabul Edildi",
    "resolved": "Çözüldü",
    "false_positive": "Yanlış Pozitif",
}

_TYPE_LABEL_TR = {
    "plc": "PLC",
    "hmi": "HMI",
    "scada_server": "SCADA Sunucusu",
    "industrial_pc": "Endüstriyel PC",
    "network_device": "Ağ Cihazı",
    "engineering_workstation": "Mühendislik İş İstasyonu",
    "server": "Sunucu",
    "computer": "Bilgisayar",
    "unknown_device": "Bilinmeyen Cihaz",
}


class AssetSummaryStats(BaseModel):
    total: int
    verified: int
    unverified: int
    by_criticality: dict[str, int]
    by_type: dict[str, int]


class RiskSummaryStats(BaseModel):
    total: int
    open_total: int
    max_score: int
    avg_open_score: float
    by_severity: dict[str, int]
    by_status: dict[str, int]
    by_rule: dict[str, int]


class CommunicationSummaryStats(BaseModel):
    total_flows: int
    cross_zone_flows: int
    protocols: dict[str, int]


class SensorSummaryStats(BaseModel):
    total: int
    active: int
    offline: int
    revoked: int


class ReportSummaryResponse(BaseModel):
    generated_at: datetime
    organization_id: uuid.UUID
    organization_name: str
    site_id: uuid.UUID | None
    site_name: str | None
    assets: AssetSummaryStats
    risks: RiskSummaryStats
    communications: CommunicationSummaryStats
    sensors: SensorSummaryStats


def _org_name(db: DbSession, org_id: uuid.UUID) -> str:
    org = db.get(Organization, org_id)
    return org.name if org else str(org_id)


def _observed_protocols_map(
    db: DbSession,
    org_id: uuid.UUID,
    asset_ids: list[uuid.UUID],
) -> dict[uuid.UUID, list[str]]:
    if not asset_ids:
        return {}
    comms = db.scalars(
        select(AssetCommunication).where(
            AssetCommunication.organization_id == org_id,
            (AssetCommunication.source_asset_id.in_(asset_ids))
            | (AssetCommunication.target_asset_id.in_(asset_ids)),
        )
    ).all()
    proto_map: dict[uuid.UUID, set[str]] = {}
    for c in comms:
        if not c.protocol or c.protocol.endswith("?"):
            continue
        proto_map.setdefault(c.source_asset_id, set()).add(c.protocol)
        proto_map.setdefault(c.target_asset_id, set()).add(c.protocol)
    return {aid: sorted(protos) for aid, protos in proto_map.items()}


@router.get("/summary", response_model=ReportSummaryResponse)
def get_report_summary(
    db: DbSession,
    ctx: Tenant,
    site_id: uuid.UUID | None = None,
) -> ReportSummaryResponse:
    org_id = ctx.organization_id
    site_name: str | None = None
    if site_id is not None:
        site = db.scalar(select(Site).where(Site.id == site_id, Site.organization_id == org_id))
        if site:
            site_name = site.name

    asset_stmt = select(Asset).where(Asset.organization_id == org_id)
    if site_id is not None:
        asset_stmt = asset_stmt.where(Asset.site_id == site_id)
    assets = list(db.scalars(asset_stmt).all())

    by_crit: dict[str, int] = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    by_type: dict[str, int] = {}
    verified = 0
    for a in assets:
        if a.is_verified:
            verified += 1
        by_crit[a.criticality] = by_crit.get(a.criticality, 0) + 1
        by_type[a.asset_type] = by_type.get(a.asset_type, 0) + 1

    risk_stmt = (
        select(RiskFinding)
        .join(Asset, Asset.id == RiskFinding.asset_id)
        .where(RiskFinding.organization_id == org_id)
    )
    if site_id is not None:
        risk_stmt = risk_stmt.where(Asset.site_id == site_id)
    risks = list(db.scalars(risk_stmt).all())

    by_sev: dict[str, int] = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    by_status: dict[str, int] = {
        "open": 0,
        "investigating": 0,
        "accepted": 0,
        "resolved": 0,
        "false_positive": 0,
    }
    by_rule: dict[str, int] = {}
    open_scores: list[int] = []
    max_score = 0
    for r in risks:
        by_status[r.status] = by_status.get(r.status, 0) + 1
        by_rule[r.rule_key] = by_rule.get(r.rule_key, 0) + 1
        if r.status in ("open", "investigating"):
            by_sev[r.severity] = by_sev.get(r.severity, 0) + 1
            open_scores.append(r.score)
            if r.score > max_score:
                max_score = r.score

    comm_stmt = select(AssetCommunication).where(AssetCommunication.organization_id == org_id)
    if site_id is not None:
        comm_stmt = comm_stmt.where(AssetCommunication.site_id == site_id)
    comms = list(db.scalars(comm_stmt).all())

    asset_zone_map = {a.id: a.zone_id for a in assets}
    cross_zone_flows = 0
    protocols: dict[str, int] = {}
    for c in comms:
        protocols[c.protocol] = protocols.get(c.protocol, 0) + 1
        sz = asset_zone_map.get(c.source_asset_id)
        tz = asset_zone_map.get(c.target_asset_id)
        if sz is not None and tz is not None and sz != tz:
            cross_zone_flows += 1

    sensor_stmt = select(Sensor).where(Sensor.organization_id == org_id)
    if site_id is not None:
        sensor_stmt = sensor_stmt.where(Sensor.site_id == site_id)
    sensors = list(db.scalars(sensor_stmt).all())
    s_active = s_offline = s_revoked = 0
    now = datetime.now(UTC)
    for s in sensors:
        conn_status, _ = compute_connectivity(s, now=now)
        if conn_status == "active":
            s_active += 1
        elif conn_status == "revoked":
            s_revoked += 1
        else:
            s_offline += 1

    return ReportSummaryResponse(
        generated_at=now,
        organization_id=org_id,
        organization_name=_org_name(db, org_id),
        site_id=site_id,
        site_name=site_name,
        assets=AssetSummaryStats(
            total=len(assets),
            verified=verified,
            unverified=len(assets) - verified,
            by_criticality=by_crit,
            by_type=by_type,
        ),
        risks=RiskSummaryStats(
            total=len(risks),
            open_total=len(open_scores),
            max_score=max_score,
            avg_open_score=round(sum(open_scores) / len(open_scores), 1) if open_scores else 0.0,
            by_severity=by_sev,
            by_status=by_status,
            by_rule=by_rule,
        ),
        communications=CommunicationSummaryStats(
            total_flows=len(comms),
            cross_zone_flows=cross_zone_flows,
            protocols=protocols,
        ),
        sensors=SensorSummaryStats(
            total=len(sensors),
            active=s_active,
            offline=s_offline,
            revoked=s_revoked,
        ),
    )


@router.get("/inventory")
def export_inventory_report(
    request: Request,
    db: DbSession,
    ctx: Tenant,
    format: Literal["csv", "pdf"] = Query("csv"),
    site_id: uuid.UUID | None = None,
    zone_id: uuid.UUID | None = None,
    criticality: str | None = None,
    is_verified: bool | None = None,
) -> Response:
    org_id = ctx.organization_id
    stmt = select(Asset).where(Asset.organization_id == org_id)
    if site_id is not None:
        stmt = stmt.where(Asset.site_id == site_id)
    if zone_id is not None:
        stmt = stmt.where(Asset.zone_id == zone_id)
    if criticality:
        stmt = stmt.where(Asset.criticality == criticality)
    if is_verified is not None:
        stmt = stmt.where(Asset.is_verified == is_verified)
    stmt = stmt.order_by(Asset.last_seen_at.desc(), Asset.created_at.desc())
    assets = list(db.scalars(stmt).all())

    sites_map = {
        s.id: s.name
        for s in db.scalars(select(Site).where(Site.organization_id == org_id)).all()
    }
    zones_map = {
        z.id: z.name
        for z in db.scalars(select(Zone).where(Zone.organization_id == org_id)).all()
    }
    proto_map = _observed_protocols_map(db, org_id, [a.id for a in assets])

    record(
        db,
        action="report.export_inventory",
        organization_id=org_id,
        user_id=ctx.user.id,
        target_type="report",
        target_id="inventory",
        metadata={
            "format": format,
            "count": len(assets),
            "site_id": str(site_id) if site_id else None,
        },
        ip_address=client_ip(request),
    )
    db.commit()

    date_tag = datetime.now(UTC).strftime("%Y%m%d")

    if format == "csv":
        buf = io.StringIO()
        # Excel'de Türkçe karakterlerin doğru açılması için UTF-8 BOM
        buf.write("\ufeff")
        writer = csv.writer(buf)
        writer.writerow(
            [
                "ip_address",
                "mac_address",
                "hostname",
                "name",
                "asset_type",
                "classification_label",
                "vendor",
                "vendor_status",
                "model",
                "firmware_version",
                "serial_number",
                "criticality",
                "confidence",
                "is_verified",
                "site_name",
                "zone_name",
                "observed_protocols",
                "first_seen_at",
                "last_seen_at",
            ]
        )
        for a in assets:
            protos = proto_map.get(a.id, [])
            hint = infer_from_evidence(
                current_type=a.asset_type,
                is_verified=a.is_verified,
                vendor=a.vendor,
                hostname=a.hostname,
                observed_protocols=protos,
                base_confidence=a.confidence,
            )
            writer.writerow(
                [
                    a.ip_address or "",
                    a.mac_address or "",
                    a.hostname or "",
                    a.name or "",
                    a.asset_type,
                    hint.classification_label,
                    a.vendor or "",
                    hint.vendor_status_label,
                    a.model or "",
                    a.firmware_version or "",
                    a.serial_number or "",
                    a.criticality,
                    f"{a.confidence:.2f}",
                    "true" if a.is_verified else "false",
                    sites_map.get(a.site_id, ""),
                    zones_map.get(a.zone_id, "") if a.zone_id else "",
                    ",".join(protos),
                    a.first_seen_at.isoformat(),
                    a.last_seen_at.isoformat(),
                ]
            )
        return Response(
            content=buf.getvalue().encode("utf-8"),
            media_type="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="factoryguard-envanter-{date_tag}.csv"'
            },
        )

    # PDF üretimi
    org_name = _org_name(db, org_id)
    verified_count = sum(1 for a in assets if a.is_verified)
    crit_count = sum(1 for a in assets if a.criticality in ("critical", "high"))
    summary_lines = [
        f"Organizasyon: {org_name}",
        f"Rapor Tarihi (UTC): {datetime.now(UTC).strftime('%Y-%m-%d %H:%M')}",
        f"Toplam Cihaz: {len(assets)} (Dogrulanmis: {verified_count}, Dogrulanmamis: {len(assets) - verified_count})",
        f"Yuksek / Kritik Cihaz Sayisi: {crit_count}",
        "Not: Bu rapor pasif ag gozlemlerine dayanir. Dogrulanmamis cihazlarda uretici/model tahmini yapilmaz.",
    ]

    asset_rows: list[str] = []
    for idx, a in enumerate(assets, start=1):
        protos = proto_map.get(a.id, [])
        hint = infer_from_evidence(
            current_type=a.asset_type,
            is_verified=a.is_verified,
            vendor=a.vendor,
            hostname=a.hostname,
            observed_protocols=protos,
            base_confidence=a.confidence,
        )
        site_label = sites_map.get(a.site_id, "-")
        zone_label = zones_map.get(a.zone_id, "Bolgesiz") if a.zone_id else "Bolgesiz"
        vendor_display = a.vendor if a.vendor else hint.vendor_status_label
        asset_rows.append(
            f"[{idx}] {a.name or a.hostname or a.ip_address or 'Isimsiz Cihaz'} "
            f"({ _TYPE_LABEL_TR.get(a.asset_type, a.asset_type) })\n"
            f"    IP: {a.ip_address or '-'} | MAC: {a.mac_address or '-'} | Hostname: {a.hostname or '-'}\n"
            f"    Siniflandirma: {hint.classification_label} | Guven: %{int(round(a.confidence * 100))} "
            f"| Durum: {'Dogrulandi' if a.is_verified else 'Dogrulanmadi'}\n"
            f"    Uretici / Model / FW: {vendor_display} / {a.model or '-'} / {a.firmware_version or '-'}\n"
            f"    Fabrika / Bolge: {site_label} / {zone_label} | Kritiklik: {_CRIT_LABEL_TR.get(a.criticality, a.criticality)}\n"
            f"    Gozlenen Protokoller: {', '.join(protos) if protos else '-'}"
        )

    pdf_bytes = build_pdf_document(
        title="FactoryGuard Lite - OT Cihaz Envanteri Raporu",
        subtitle=f"{org_name} | Pasif Varlik Gorunurlugu",
        summary_lines=summary_lines,
        sections=[("Cihaz Envanteri Listesi", asset_rows)],
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="factoryguard-envanter-{date_tag}.pdf"'
        },
    )


@router.get("/risks")
def export_risks_report(
    request: Request,
    db: DbSession,
    ctx: Tenant,
    format: Literal["csv", "pdf"] = Query("csv"),
    site_id: uuid.UUID | None = None,
    status: str | None = None,
    severity: str | None = None,
    rule_key: str | None = None,
) -> Response:
    org_id = ctx.organization_id
    stmt = (
        select(RiskFinding)
        .join(Asset, Asset.id == RiskFinding.asset_id)
        .where(RiskFinding.organization_id == org_id)
    )
    if site_id is not None:
        stmt = stmt.where(Asset.site_id == site_id)
    if status:
        stmt = stmt.where(RiskFinding.status == status)
    if severity:
        stmt = stmt.where(RiskFinding.severity == severity)
    if rule_key:
        stmt = stmt.where(RiskFinding.rule_key == rule_key)
    stmt = stmt.order_by(RiskFinding.score.desc(), RiskFinding.last_seen_at.desc())
    findings = list(db.scalars(stmt).all())

    asset_ids = list({f.asset_id for f in findings})
    assets_map: dict[uuid.UUID, Asset] = {}
    if asset_ids:
        for a in db.scalars(
            select(Asset).where(Asset.organization_id == org_id, Asset.id.in_(asset_ids))
        ).all():
            assets_map[a.id] = a

    sites_map = {
        s.id: s.name
        for s in db.scalars(select(Site).where(Site.organization_id == org_id)).all()
    }

    record(
        db,
        action="report.export_risks",
        organization_id=org_id,
        user_id=ctx.user.id,
        target_type="report",
        target_id="risks",
        metadata={
            "format": format,
            "count": len(findings),
            "site_id": str(site_id) if site_id else None,
        },
        ip_address=client_ip(request),
    )
    db.commit()

    date_tag = datetime.now(UTC).strftime("%Y%m%d")

    if format == "csv":
        buf = io.StringIO()
        buf.write("\ufeff")
        writer = csv.writer(buf)
        writer.writerow(
            [
                "rule_key",
                "title",
                "severity",
                "score",
                "confidence",
                "status",
                "asset_ip",
                "asset_name",
                "site_name",
                "what_observed",
                "why_important",
                "recommendation",
                "first_seen_at",
                "last_seen_at",
            ]
        )
        for f in findings:
            asset = assets_map.get(f.asset_id)
            ev = f.evidence or {}
            writer.writerow(
                [
                    f.rule_key,
                    f.title,
                    f.severity,
                    str(f.score),
                    f"{f.confidence:.2f}",
                    f.status,
                    asset.ip_address if asset and asset.ip_address else "",
                    (asset.name or asset.hostname) if asset else "",
                    sites_map.get(asset.site_id, "") if asset else "",
                    str(ev.get("what_observed", f.description)),
                    str(ev.get("why_important", "")),
                    f.recommendation,
                    f.first_seen_at.isoformat(),
                    f.last_seen_at.isoformat(),
                ]
            )
        return Response(
            content=buf.getvalue().encode("utf-8"),
            media_type="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="factoryguard-risk-raporu-{date_tag}.csv"'
            },
        )

    # PDF üretimi (Yönetici Özeti + Teknik Bulgular)
    org_name = _org_name(db, org_id)
    open_findings = [f for f in findings if f.status in ("open", "investigating")]
    sev_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for f in open_findings:
        sev_counts[f.severity] = sev_counts.get(f.severity, 0) + 1
    max_score = max((f.score for f in open_findings), default=0)

    summary_lines = [
        f"Organizasyon: {org_name}",
        f"Rapor Tarihi (UTC): {datetime.now(UTC).strftime('%Y-%m-%d %H:%M')}",
        f"Toplam Bulgu: {len(findings)} | Aktif (Acik/Incelenen) Bulgu: {len(open_findings)}",
        f"En Yuksek Risk Puani: {max_score} / 100",
        (
            f"Aktif Ciddiyet Dagilimi: Kritik={sev_counts['critical']}, "
            f"Yuksek={sev_counts['high']}, Orta={sev_counts['medium']}, Dusuk={sev_counts['low']}"
        ),
        "Metodoloji: Risk puani (0-100) ile kanit guveni (0.0-1.0) birbirinden ayrilmistir. "
        "Dogrulanmamis surumlerde kesin CVE iddiasinda bulunulmaz.",
    ]

    finding_rows: list[str] = []
    for idx, f in enumerate(findings, start=1):
        asset = assets_map.get(f.asset_id)
        asset_str = (
            f"{asset.name or asset.hostname or asset.ip_address} ({asset.ip_address or '-'})"
            if asset
            else str(f.asset_id)
        )
        ev = f.evidence or {}
        what_obs = ev.get("what_observed") or f.description
        why_imp = ev.get("why_important") or "-"
        finding_rows.append(
            f"[{idx}] {f.title} [{f.rule_key}]\n"
            f"    Ciddiyet: {_CRIT_LABEL_TR.get(f.severity, f.severity)} | Risk Puani: {f.score}/100 "
            f"| Kanit Guveni: %{int(round(f.confidence * 100))} | Durum: {_STATUS_LABEL_TR.get(f.status, f.status)}\n"
            f"    Etkilenen Cihaz: {asset_str} | Fabrika: {sites_map.get(asset.site_id, '-') if asset else '-'}\n"
            f"    Ne Gozlendi: {what_obs}\n"
            f"    Neden Onemli: {why_imp}\n"
            f"    Onerilen Aksiyon: {f.recommendation}"
        )

    pdf_bytes = build_pdf_document(
        title="FactoryGuard Lite - Yonetici ve Teknik Risk Raporu",
        subtitle=f"{org_name} | Aciklanabilir OT Risk Bulgulari",
        summary_lines=summary_lines,
        sections=[("Detayli Teknik Bulgular ve Oneriler", finding_rows)],
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="factoryguard-risk-raporu-{date_tag}.pdf"'
        },
    )
