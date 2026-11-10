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
from app.modules.risk_engine.service import evaluate_organization_risks

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


@router.get("/{finding_id}", response_model=RiskFindingOut)
def get_risk(finding_id: uuid.UUID, db: DbSession, ctx: Tenant):
    finding = _get_finding_or_404(db, ctx, finding_id)
    asset = db.get(Asset, finding.asset_id)
    return _to_risk_out(finding, asset)


@router.patch("/{finding_id}", response_model=RiskFindingOut)
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

    if old_status != new_status:
        finding.status = new_status
        if new_status in ("resolved", "false_positive", "accepted"):
            finding.resolved_at = datetime.now(UTC)
        else:
            finding.resolved_at = None

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
