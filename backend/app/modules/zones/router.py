"""Bölge (zone) yönetimi: üretim hattı veya ağ bölgesi."""
from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, StringConstraints
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from typing import Annotated

from app.core.deps import AdminTenant, DbSession, Tenant, TenantContext, client_ip
from app.models import Zone
from app.modules.audit.service import changes, record
from app.modules.sites.router import get_site_or_404
from app.schemas.common import Criticality, Name

router = APIRouter(prefix="/zones", tags=["zones"])

Description = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]


class ZoneCreate(BaseModel):
    site_id: uuid.UUID
    name: Name
    description: Description | None = None
    criticality: Criticality = "medium"


class ZoneUpdate(BaseModel):
    name: Name | None = None
    description: Description | None = None
    criticality: Criticality | None = None


class ZoneOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    organization_id: uuid.UUID
    site_id: uuid.UUID
    name: str
    description: str | None
    criticality: str
    created_at: datetime


def _get_zone_or_404(db, ctx: TenantContext, zone_id: uuid.UUID) -> Zone:
    zone = db.scalar(select(Zone).where(Zone.id == zone_id, Zone.organization_id == ctx.organization_id))
    if zone is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bölge bulunamadı")
    return zone


def _duplicate() -> HTTPException:
    return HTTPException(status.HTTP_409_CONFLICT, "Bu fabrikada aynı isimde bir bölge zaten var")


@router.get("", response_model=list[ZoneOut])
def list_zones(db: DbSession, ctx: Tenant, site_id: uuid.UUID | None = None):
    q = select(Zone).where(Zone.organization_id == ctx.organization_id)
    if site_id:
        q = q.where(Zone.site_id == site_id)
    return db.scalars(q.order_by(Zone.name)).all()


@router.post("", response_model=ZoneOut, status_code=status.HTTP_201_CREATED)
def create_zone(body: ZoneCreate, request: Request, db: DbSession, ctx: AdminTenant):
    get_site_or_404(db, ctx, body.site_id)  # site bu tenant'a ait olmalı
    zone = Zone(organization_id=ctx.organization_id, **body.model_dump())
    db.add(zone)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise _duplicate() from None
    record(db, "zone.create", user_id=ctx.user.id, organization_id=ctx.organization_id, target_type="zone",
           target_id=zone.id, metadata=body.model_dump(mode="json"), ip_address=client_ip(request))
    db.commit()
    return zone


@router.get("/{zone_id}", response_model=ZoneOut)
def get_zone(zone_id: uuid.UUID, db: DbSession, ctx: Tenant):
    return _get_zone_or_404(db, ctx, zone_id)


@router.patch("/{zone_id}", response_model=ZoneOut)
def update_zone(zone_id: uuid.UUID, body: ZoneUpdate, request: Request, db: DbSession, ctx: AdminTenant):
    zone = _get_zone_or_404(db, ctx, zone_id)
    updates = body.model_dump(exclude_unset=True)
    for k in ("name", "criticality"):
        if k in updates and updates[k] is None:
            updates.pop(k)
    diff = changes(zone, updates)
    for k, v in updates.items():
        setattr(zone, k, v)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise _duplicate() from None
    if diff:
        record(db, "zone.update", user_id=ctx.user.id, organization_id=ctx.organization_id, target_type="zone",
               target_id=zone.id, metadata={"changes": diff}, ip_address=client_ip(request))
    db.commit()
    return zone


@router.delete("/{zone_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_zone(zone_id: uuid.UUID, request: Request, db: DbSession, ctx: AdminTenant):
    zone = _get_zone_or_404(db, ctx, zone_id)
    record(db, "zone.delete", user_id=ctx.user.id, organization_id=ctx.organization_id, target_type="zone",
           target_id=zone.id, metadata={"name": zone.name}, ip_address=client_ip(request))
    db.delete(zone)
    db.commit()
