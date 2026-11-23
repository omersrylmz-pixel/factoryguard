"""Risk merkezi API uç noktaları (`/api/v1/risks`).

Desteklenen uç noktalar:
- `GET /api/v1/risks`: Severity, status, asset_id, rule_key, site_id ve tarih filtreleriyle listeleme.
- `GET /api/v1/risks/{id}`: Bulguların açıklanabilir detayları (ne gözlendi, neden önemli, kanıt, puan kırılımı, güven seviyesi, önerilen aksiyon).
- `PATCH /api/v1/risks/{id}`: Durum güncelleme (`open`, `investigating`, `accepted`, `resolved`, `false_positive`) + `audit_logs` kaydı (Test standardı #9).
- `POST /api/v1/risks/evaluate`: Kural motorunu manuel olarak yeniden çalıştırma.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import DbSession, Tenant, TenantContext, client_ip, require_role
from app.models import Asset, RiskFinding
from app.models.risk import RISK_STATUSES
from app.modules.audit.service import record
from app.modules.risk_engine.scoring import DEFAULT_WEIGHTS
from app.modules.risk_engine.service import RULE_CATALOG, evaluate_organization_risks

router = APIRouter(prefix="/risks", tags=["risks"])

AnalystTenant = Annotated[TenantContext, Depends(require_role("analyst"))]


class RiskFindingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    asset_id: uuid.UUID
    asset_ip: str | None = None
    asset_name: str | None = None
    site_id: uuid.UUID | None = None
    rule_key: str
    title: str
    description: str
    severity: str
    score: int
    confidence: float
    evidence: dict[str, Any]
    recommendation: str
    status: str
    first_seen_at: datetime
    last_seen_at: datetime
    resolved_at: datetime | None


class RiskPage(BaseModel):
    items: list[RiskFindingOut]
    total: int


class RiskStatusUpdate(BaseModel):
    status: str
    resolution_note: str | None = None

    @field_validator("status")
    @classmethod
    def _validate_status(cls, v: str) -> str:
        val = v.strip().lower().replace(" ", "_")
        if val not in RISK_STATUSES:
            raise ValueError(f"Durum şunlardan biri olmalı: {', '.join(RISK_STATUSES)}")
        return val


class RiskEvaluateOut(BaseModel):
    created: int
    updated: int
    total_open: int


class RiskBulkStatusUpdate(BaseModel):
    finding_ids: list[uuid.UUID] | None = None
    filter_status: str = "open"
    new_status: str | None = None
    status: str | None = None
    resolution_note: str | None = None

    def effective_status(self) -> str:
        raw = self.new_status or self.status or ""
        val = raw.strip().lower().replace(" ", "_")
        if val not in RISK_STATUSES:
            raise ValueError(f"Durum şunlardan biri olmalı: {', '.join(RISK_STATUSES)}")
        return val


class RiskBulkStatusOut(BaseModel):
    updated_count: int
    new_status: str


class RiskPostureOut(BaseModel):
    health_score: int
    grade: str
    status_label: str
    open_critical: int
    open_high: int
    open_medium: int
    open_low: int
    total_open: int
    verified_asset_ratio: float
    formula_explanation: str = (
        "100 - (critical*18 + high*9 + medium*4 + low*1 + round((1 - verified_asset_ratio)*15))"
    )
    penalty_breakdown: dict[str, int] = {}


class RiskRuleDefinitionOut(BaseModel):
    rule_id: str
    rule_key: str
    name: str
    finding_category: str
    triggering_condition: str
    description: str


class RiskRulesCatalogOut(BaseModel):
    scoring_weights: dict[str, int]
    rules: list[RiskRuleDefinitionOut]


def _to_risk_out(finding: RiskFinding, asset: Asset | None) -> RiskFindingOut:
    return RiskFindingOut(
        id=finding.id,
        organization_id=finding.organization_id,
        asset_id=finding.asset_id,
        asset_ip=asset.ip_address if asset else None,
        asset_name=(asset.name or asset.hostname) if asset else None,
        site_id=asset.site_id if asset else None,
        rule_key=finding.rule_key,
        title=finding.title,
        description=finding.description,
        severity=finding.severity,
        score=finding.score,
        confidence=finding.confidence,
        evidence=finding.evidence,
        recommendation=finding.recommendation,
        status=finding.status,
        first_seen_at=finding.first_seen_at,
        last_seen_at=finding.last_seen_at,
        resolved_at=finding.resolved_at,
    )


def _get_finding_or_404(db: Session, ctx: TenantContext, finding_id: uuid.UUID) -> RiskFinding:
    finding = db.scalar(
        select(RiskFinding).where(
            RiskFinding.id == finding_id,
            RiskFinding.organization_id == ctx.organization_id,
        )
    )
    if finding is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Risk bulgusu bulunamadı")
    return finding


@router.get("", response_model=RiskPage)
def list_risks(
    db: DbSession,
    ctx: Tenant,
    site_id: uuid.UUID | None = None,
    asset_id: uuid.UUID | None = None,
    severity: str | None = None,
    status: str | None = None,
    rule_key: str | None = None,
    since: datetime | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    stmt = (
        select(RiskFinding, Asset)
        .join(Asset, Asset.id == RiskFinding.asset_id)
        .where(RiskFinding.organization_id == ctx.organization_id)
    )
    if site_id is not None:
        stmt = stmt.where(Asset.site_id == site_id)
    if asset_id is not None:
        stmt = stmt.where(RiskFinding.asset_id == asset_id)
    if severity:
        stmt = stmt.where(RiskFinding.severity == severity.strip().lower())
    if status:
        stmt = stmt.where(RiskFinding.status == status.strip().lower().replace(" ", "_"))
    if rule_key:
        stmt = stmt.where(RiskFinding.rule_key == rule_key.strip().upper())
    if since is not None:
        stmt = stmt.where(RiskFinding.last_seen_at >= since)

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.execute(
        stmt.order_by(RiskFinding.score.desc(), RiskFinding.last_seen_at.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return RiskPage(items=[_to_risk_out(f, a) for f, a in rows], total=total)


@router.get("/rules", response_model=RiskRulesCatalogOut)
def list_risk_rules(_ctx: Tenant) -> RiskRulesCatalogOut:
    """Açıklanabilir risk motorunun aktif kurallarını ve 100 puanlık ağırlık modelini döndürür."""
    return RiskRulesCatalogOut(
        scoring_weights={
            "production_criticality_max": DEFAULT_WEIGHTS.production_criticality_max,
            "network_exposure_max": DEFAULT_WEIGHTS.network_exposure_max,
            "verified_vulnerability_max": DEFAULT_WEIGHTS.verified_vulnerability_max,
            "unexpected_behavior_max": DEFAULT_WEIGHTS.unexpected_behavior_max,
            "inventory_gap_max": DEFAULT_WEIGHTS.inventory_gap_max,
        },
        rules=[RiskRuleDefinitionOut(**meta) for meta in RULE_CATALOG.values()],
    )


@router.get("/posture", response_model=RiskPostureOut)
def get_risk_posture(
    db: DbSession,
    ctx: Tenant,
    site_id: uuid.UUID | None = None,
):
    """Fabrika siber güvenlik duruş puanını (0-100) ve harf notunu (A-F) hesaplar."""
    stmt = (
        select(RiskFinding)
        .join(Asset, Asset.id == RiskFinding.asset_id)
        .where(
            RiskFinding.organization_id == ctx.organization_id,
            RiskFinding.status.in_(("open", "investigating")),
        )
    )
    if site_id is not None:
        stmt = stmt.where(Asset.site_id == site_id)
    open_findings = list(db.scalars(stmt).all())

    asset_stmt = select(Asset).where(Asset.organization_id == ctx.organization_id)
    if site_id is not None:
        asset_stmt = asset_stmt.where(Asset.site_id == site_id)
    assets = list(db.scalars(asset_stmt).all())

    c_crit = sum(1 for f in open_findings if f.severity == "critical")
    c_high = sum(1 for f in open_findings if f.severity == "high")
    c_med = sum(1 for f in open_findings if f.severity == "medium")
    c_low = sum(1 for f in open_findings if f.severity == "low")

    penalty = (c_crit * 18) + (c_high * 9) + (c_med * 4) + (c_low * 1)
    verified_ratio = (
        round(sum(1 for a in assets if a.is_verified) / len(assets), 2)
        if assets
        else 1.0
    )
    unverified_penalty = int((1.0 - verified_ratio) * 15) if assets else 0
    health_score = max(0, min(100, 100 - penalty - unverified_penalty))

    if health_score >= 90:
        grade, label = "A", "Güçlü OT Güvenlik Duruşu"
    elif health_score >= 75:
        grade, label = "B", "İyi Duruş · Sınırlı Açık Bulgular"
    elif health_score >= 60:
        grade, label = "C", "Orta Risk · İnceleme Gerekiyor"
    elif health_score >= 40:
        grade, label = "D", "Yüksek Risk · Acil Müdahale Önerilir"
    else:
        grade, label = "F", "Kritik Risk · Üretim Ağı Maruziyeti"

    return RiskPostureOut(
        health_score=health_score,
        grade=grade,
        status_label=label,
        open_critical=c_crit,
        open_high=c_high,
        open_medium=c_med,
        open_low=c_low,
        total_open=len(open_findings),
        verified_asset_ratio=verified_ratio,
        penalty_breakdown={
            "critical_findings_penalty": c_crit * 18,
            "high_findings_penalty": c_high * 9,
            "medium_findings_penalty": c_med * 4,
            "low_findings_penalty": c_low * 1,
            "unverified_inventory_penalty": unverified_penalty,
        },
    )


@router.post("/bulk-status", response_model=RiskBulkStatusOut)
def bulk_update_risk_status(
    body: RiskBulkStatusUpdate,
    request: Request,
    db: DbSession,
    ctx: AnalystTenant,
):
    """Birden fazla risk bulgusunun durumunu tek işlemde günceller ve denetim kaydına yazar."""
    try:
        target_status = body.effective_status()
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    stmt = select(RiskFinding).where(RiskFinding.organization_id == ctx.organization_id)
    if body.finding_ids:
        stmt = stmt.where(RiskFinding.id.in_(body.finding_ids))
    else:
        stmt = stmt.where(RiskFinding.status == body.filter_status.strip().lower())

    findings = list(db.scalars(stmt).all())
    now = datetime.now(UTC)
    updated = 0
    for f in findings:
        if f.status != target_status:
            f.status = target_status
            f.resolved_at = now if target_status in ("resolved", "false_positive", "accepted") else None
            if body.resolution_note:
                ev = dict(f.evidence or {})
                ev["resolution_note"] = body.resolution_note
                f.evidence = ev
            updated += 1

    if updated > 0:
        record(
            db,
            "risk.bulk_status",
            user_id=ctx.user.id,
            organization_id=ctx.organization_id,
            target_type="risk_finding",
            target_id=None,
            metadata={
                "updated_count": updated,
                "new_status": target_status,
                "filter_status": body.filter_status,
            },
            ip_address=client_ip(request),
        )
        db.commit()

    return RiskBulkStatusOut(updated_count=updated, new_status=target_status)


@router.get("/{finding_id}", response_model=RiskFindingOut)
def get_risk(finding_id: uuid.UUID, db: DbSession, ctx: Tenant):
    finding = _get_finding_or_404(db, ctx, finding_id)
    asset = db.get(Asset, finding.asset_id)
    return _to_risk_out(finding, asset)


@router.patch("/{finding_id}", response_model=RiskFindingOut)
@router.patch("/{finding_id}/status", response_model=RiskFindingOut)
def update_risk_status(
    finding_id: uuid.UUID,
    body: RiskStatusUpdate,
    request: Request,
    db: DbSession,
    ctx: AnalystTenant,
):
    finding = _get_finding_or_404(db, ctx, finding_id)
    old_status = finding.status
    new_status = body.status

    if old_status != new_status or body.resolution_note:
        finding.status = new_status
        if new_status in ("resolved", "false_positive", "accepted"):
            finding.resolved_at = datetime.now(UTC)
        else:
            finding.resolved_at = None
        if body.resolution_note:
            ev = dict(finding.evidence or {})
            ev["resolution_note"] = body.resolution_note
            finding.evidence = ev

        record(
            db,
            "risk.status_change",
            user_id=ctx.user.id,
            organization_id=ctx.organization_id,
            target_type="risk_finding",
            target_id=finding.id,
            metadata={
                "rule_key": finding.rule_key,
                "asset_id": str(finding.asset_id),
                "old_status": old_status,
                "new_status": new_status,
            },
            ip_address=client_ip(request),
        )
        db.commit()

    asset = db.get(Asset, finding.asset_id)
    return _to_risk_out(finding, asset)


@router.post("/evaluate", response_model=RiskEvaluateOut)
def trigger_risk_evaluation(
    db: DbSession,
    ctx: AnalystTenant,
    site_id: uuid.UUID | None = None,
):
    stats = evaluate_organization_risks(db, ctx.organization_id, site_id=site_id)
    return RiskEvaluateOut(**stats)
