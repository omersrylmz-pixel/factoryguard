"""Fabrika (site) yönetimi. Tüm sorgular tenant (organization_id) ile filtrelenir."""
from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import exists, select
from sqlalchemy.exc import IntegrityError

from app.core.deps import AdminTenant, DbSession, Tenant, TenantContext, client_ip
from app.models import Site, Zone
from app.modules.audit.service import changes, record
from app.schemas.common import Name, ShortText, TimezoneName

router = APIRouter(prefix="/sites", tags=["sites"])


class SiteCreate(BaseModel):
    name: Name
    industry: ShortText | None = None
    timezone: TimezoneName = "Europe/Istanbul"


class SiteUpdate(BaseModel):
    name: Name | None = None
    industry: ShortText | None = None
    timezone: TimezoneName | None = None


class SiteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    industry: str | None
    timezone: str
    created_at: datetime


def get_site_or_404(db, ctx: TenantContext, site_id: uuid.UUID) -> Site:
    site = db.scalar(select(Site).where(Site.id == site_id, Site.organization_id == ctx.organization_id))
    if site is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fabrika bulunamadı")
    return site


def _duplicate() -> HTTPException:
    return HTTPException(status.HTTP_409_CONFLICT, "Bu isimde bir fabrika zaten var")


@router.get("", response_model=list[SiteOut])
def list_sites(db: DbSession, ctx: Tenant):
    return db.scalars(select(Site).where(Site.organization_id == ctx.organization_id).order_by(Site.name)).all()


@router.post("", response_model=SiteOut, status_code=status.HTTP_201_CREATED)
def create_site(body: SiteCreate, request: Request, db: DbSession, ctx: AdminTenant):
    site = Site(organization_id=ctx.organization_id, **body.model_dump())
    db.add(site)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise _duplicate() from None
    record(db, "site.create", user_id=ctx.user.id, organization_id=ctx.organization_id, target_type="site",
           target_id=site.id, metadata=body.model_dump(), ip_address=client_ip(request))
    db.commit()
    return site


@router.get("/{site_id}", response_model=SiteOut)
def get_site(site_id: uuid.UUID, db: DbSession, ctx: Tenant):
    return get_site_or_404(db, ctx, site_id)


@router.patch("/{site_id}", response_model=SiteOut)
def update_site(site_id: uuid.UUID, body: SiteUpdate, request: Request, db: DbSession, ctx: AdminTenant):
    site = get_site_or_404(db, ctx, site_id)
    updates = body.model_dump(exclude_unset=True)
    if updates.get("name") is None:
        updates.pop("name", None)
    if "timezone" in updates and updates["timezone"] is None:
        updates.pop("timezone")
    diff = changes(site, updates)
    for k, v in updates.items():
        setattr(site, k, v)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise _duplicate() from None
    if diff:
        record(db, "site.update", user_id=ctx.user.id, organization_id=ctx.organization_id, target_type="site",
               target_id=site.id, metadata={"changes": diff}, ip_address=client_ip(request))
    db.commit()
    return site


@router.delete("/{site_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_site(site_id: uuid.UUID, request: Request, db: DbSession, ctx: AdminTenant):
    site = get_site_or_404(db, ctx, site_id)
    if db.scalar(select(exists().where(Zone.site_id == site.id))):
        raise HTTPException(status.HTTP_409_CONFLICT, "Fabrikaya bağlı bölgeler var; önce bölgeleri silin")
    record(db, "site.delete", user_id=ctx.user.id, organization_id=ctx.organization_id, target_type="site",
           target_id=site.id, metadata={"name": site.name}, ip_address=client_ip(request))
    db.delete(site)
    db.commit()
