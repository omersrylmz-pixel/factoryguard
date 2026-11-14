"""Gözlemlenen cihazlar arası ağ iletişim ilişkileri ve topoloji grafiği (`/api/v1/communications`).

İlke (Bölüm 4.4): Bu ilişkiler yalnızca gözlemlenen trafik kanıtına dayanır;
ağda görülmeyen bir iletişim asla varmış gibi gösterilmez.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import or_, select

from app.core.deps import DbSession, Tenant, TenantContext, client_ip, require_role
from app.models import Asset, AssetCommunication, RiskFinding
from app.modules.audit.service import record
from app.modules.discovery.classifier import infer_from_evidence

router = APIRouter(prefix="/communications", tags=["communications"])

AnalystTenant = Annotated[TenantContext, Depends(require_role("analyst"))]


class CommunicationEdgeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    site_id: uuid.UUID
    source_asset_id: uuid.UUID
    source_ip: str | None
    source_label: str
    source_type: str
    target_asset_id: uuid.UUID
    target_ip: str | None
    target_label: str
    target_type: str
    protocol: str
    source_port: int | None
    target_port: int | None
    connection_count: int
    first_seen_at: datetime
    last_seen_at: datetime
    cross_zone: bool = False
    is_baseline_approved: bool = False


class BaselineApproveResult(BaseModel):
    approved_flows: int
    risks_accepted: int



class GraphNodeOut(BaseModel):
    id: uuid.UUID
    site_id: uuid.UUID
    zone_id: uuid.UUID | None
    label: str
    ip_address: str | None
    asset_type: str
    classification_label: str
    criticality: str
    is_verified: bool


class CommunicationGraphOut(BaseModel):
    nodes: list[GraphNodeOut]
    edges: list[CommunicationEdgeOut]


def _asset_label(asset: Asset | None, fallback_id: uuid.UUID) -> str:
    if asset is None:
        return str(fallback_id)[:8]
    return asset.name or asset.hostname or asset.ip_address or str(asset.id)[:8]


@router.get("", response_model=list[CommunicationEdgeOut])
def list_communications(
    db: DbSession,
    ctx: Tenant,
    site_id: uuid.UUID | None = None,
    protocol: str | None = None,
    asset_id: uuid.UUID | None = None,
):
    stmt = select(AssetCommunication).where(AssetCommunication.organization_id == ctx.organization_id)
    if site_id is not None:
        stmt = stmt.where(AssetCommunication.site_id == site_id)
    if protocol:
        stmt = stmt.where(AssetCommunication.protocol == protocol.strip().lower())
    if asset_id is not None:
        stmt = stmt.where(
            or_(
                AssetCommunication.source_asset_id == asset_id,
                AssetCommunication.target_asset_id == asset_id,
            )
        )

    comms = db.scalars(stmt.order_by(AssetCommunication.last_seen_at.desc())).all()
    if not comms:
        return []

    asset_ids = {c.source_asset_id for c in comms} | {c.target_asset_id for c in comms}
    assets_by_id = {
        a.id: a
        for a in db.scalars(
            select(Asset).where(Asset.organization_id == ctx.organization_id, Asset.id.in_(asset_ids))
        ).all()
    }

    accepted_dedups = set(
        db.scalars(
            select(RiskFinding.dedup_key).where(
                RiskFinding.organization_id == ctx.organization_id,
                RiskFinding.rule_key == "UNEXPECTED_COMMUNICATION",
                RiskFinding.status.in_(("accepted", "resolved", "false_positive")),
            )
        ).all()
    )
    open_unexp_dedups = set(
        db.scalars(
            select(RiskFinding.dedup_key).where(
                RiskFinding.organization_id == ctx.organization_id,
                RiskFinding.rule_key == "UNEXPECTED_COMMUNICATION",
                RiskFinding.status.in_(("open", "investigating")),
            )
        ).all()
    )

    out: list[CommunicationEdgeOut] = []
    for c in comms:
        src = assets_by_id.get(c.source_asset_id)
        dst = assets_by_id.get(c.target_asset_id)
        cross_zone = bool(src and dst and src.zone_id and dst.zone_id and src.zone_id != dst.zone_id)
        proto_low = (c.protocol or "unknown").lower()
        dedup = f"{c.source_asset_id}->{c.target_asset_id}:{proto_low}:{c.target_port}"
        is_approved = (dedup in accepted_dedups) or (
            dedup not in open_unexp_dedups and bool(src and dst and src.is_verified and dst.is_verified and not cross_zone)
        )
        out.append(
            CommunicationEdgeOut(
                id=c.id,
                site_id=c.site_id,
                source_asset_id=c.source_asset_id,
                source_ip=src.ip_address if src else None,
                source_label=_asset_label(src, c.source_asset_id),
                source_type=src.asset_type if src else "unknown_device",
                target_asset_id=c.target_asset_id,
                target_ip=dst.ip_address if dst else None,
                target_label=_asset_label(dst, c.target_asset_id),
                target_type=dst.asset_type if dst else "unknown_device",
                protocol=c.protocol,
                source_port=c.source_port,
                target_port=c.target_port,
                connection_count=c.connection_count,
                first_seen_at=c.first_seen_at,
                last_seen_at=c.last_seen_at,
                cross_zone=cross_zone,
                is_baseline_approved=is_approved,
            )
        )
    return out



@router.get("/graph", response_model=CommunicationGraphOut)
def get_communications_graph(
    db: DbSession,
    ctx: Tenant,
    site_id: uuid.UUID | None = None,
):
    edges = list_communications(db=db, ctx=ctx, site_id=site_id)
    node_ids = {e.source_asset_id for e in edges} | {e.target_asset_id for e in edges}
    if not node_ids:
        return CommunicationGraphOut(nodes=[], edges=[])

    assets = db.scalars(
        select(Asset)
        .where(Asset.organization_id == ctx.organization_id, Asset.id.in_(node_ids))
        .order_by(Asset.ip_address)
    ).all()

    nodes: list[GraphNodeOut] = []
    for a in assets:
        hint = infer_from_evidence(
            current_type=a.asset_type,
            is_verified=a.is_verified,
            vendor=a.vendor,
            hostname=a.hostname,
            observed_protocols=[],
            base_confidence=a.confidence,
        )
        nodes.append(
            GraphNodeOut(
                id=a.id,
                site_id=a.site_id,
                zone_id=a.zone_id,
                label=_asset_label(a, a.id),
                ip_address=a.ip_address,
                asset_type=a.asset_type,
                classification_label=hint.classification_label,
                criticality=a.criticality,
                is_verified=a.is_verified,
            )
        )
    return CommunicationGraphOut(nodes=nodes, edges=edges)


def _accept_flow_baseline(db: DbSession, org_id: uuid.UUID, comm: AssetCommunication) -> int:
    proto_low = (comm.protocol or "unknown").lower()
    dedup = f"{comm.source_asset_id}->{comm.target_asset_id}:{proto_low}:{comm.target_port}"
    existing = db.scalar(
        select(RiskFinding).where(
            RiskFinding.organization_id == org_id,
            RiskFinding.rule_key == "UNEXPECTED_COMMUNICATION",
            RiskFinding.dedup_key == dedup,
        )
    )
    now = datetime.now(UTC)
    if existing is not None:
        if existing.status != "accepted":
            existing.status = "accepted"
            return 1
        return 0

    db.add(
        RiskFinding(
            organization_id=org_id,
            asset_id=comm.target_asset_id,
            rule_key="UNEXPECTED_COMMUNICATION",
            dedup_key=dedup,
            title=f"Onaylı Baseline Akışı ({proto_low.upper()})",
            description="Bu iletişim akışı yönetici/analist tarafından onaylı fabrika baseline'ına eklendi.",
            severity="low",
            score=10,
            confidence=1.0,
            evidence={"what_observed": "Baseline olarak onaylandı"},
            recommendation="Onaylı iletişim akışı.",
            status="accepted",
            first_seen_at=comm.first_seen_at or now,
            last_seen_at=comm.last_seen_at or now,
        )
    )
    return 1


@router.post("/{comm_id}/approve-baseline", response_model=BaselineApproveResult)
def approve_single_communication_baseline(
    comm_id: uuid.UUID,
    request: Request,
    db: DbSession,
    ctx: AnalystTenant,
) -> BaselineApproveResult:
    """Belirli bir iletişim akışını onaylı baseline (whitelist) olarak işaretler."""
    comm = db.scalar(
        select(AssetCommunication).where(
            AssetCommunication.id == comm_id,
            AssetCommunication.organization_id == ctx.organization_id,
        )
    )
    if comm is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "İletişim kaydı bulunamadı")

    changed = _accept_flow_baseline(db, ctx.organization_id, comm)
    record(
        db,
        "communication.approve_baseline",
        user_id=ctx.user.id,
        organization_id=ctx.organization_id,
        target_type="communication",
        target_id=comm.id,
        metadata={"protocol": comm.protocol, "target_port": comm.target_port},
        ip_address=client_ip(request),
    )
    db.commit()
    return BaselineApproveResult(approved_flows=1, risks_accepted=changed)


@router.post("/approve-all-baseline", response_model=BaselineApproveResult)
def approve_all_communications_baseline(
    request: Request,
    db: DbSession,
    ctx: AnalystTenant,
    site_id: uuid.UUID | None = None,
) -> BaselineApproveResult:
    """Mevcut tüm ağ iletişimlerini onaylı fabrika baseline'ı (whitelist) olarak kaydeder."""
    stmt = select(AssetCommunication).where(AssetCommunication.organization_id == ctx.organization_id)
    if site_id is not None:
        stmt = stmt.where(AssetCommunication.site_id == site_id)
    comms = list(db.scalars(stmt).all())

    accepted_count = 0
    for c in comms:
        accepted_count += _accept_flow_baseline(db, ctx.organization_id, c)

    record(
        db,
        "communication.approve_all_baseline",
        user_id=ctx.user.id,
        organization_id=ctx.organization_id,
        target_type="communication",
        target_id=str(site_id) if site_id else "all",
        metadata={"approved_flows": len(comms), "risks_accepted": accepted_count},
        ip_address=client_ip(request),
    )
    db.commit()
    return BaselineApproveResult(approved_flows=len(comms), risks_accepted=accepted_count)

