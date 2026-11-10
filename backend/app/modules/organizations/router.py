from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession, client_ip
from app.models import Membership, Organization, User
from app.modules.audit.service import changes, record
from app.schemas.common import Name

router = APIRouter(prefix="/organizations", tags=["organizations"])


class OrganizationCreate(BaseModel):
    name: Name


class OrganizationUpdate(BaseModel):
    name: Name | None = None


class OrganizationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    plan: str
    created_at: datetime


class OrganizationWithRole(OrganizationOut):
    role: str


class MemberOut(BaseModel):
    user_id: uuid.UUID
    email: str
    full_name: str
    role: str
    is_active: bool


def _membership_or_404(db, org_id: uuid.UUID, user: User) -> Membership:
    m = db.get(Membership, (org_id, user.id))
    if m is None:
        # Varlığı sızdırmamak için 403 yerine 404.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organizasyon bulunamadı")
    return m


@router.get("", response_model=list[OrganizationWithRole])
def list_organizations(db: DbSession, user: CurrentUser):
    rows = db.execute(
        select(Organization, Membership.role)
        .join(Membership, Membership.organization_id == Organization.id)
        .where(Membership.user_id == user.id)
        .order_by(Organization.name)
    ).all()
    return [OrganizationWithRole(**OrganizationOut.model_validate(o).model_dump(), role=r) for o, r in rows]


@router.post("", response_model=OrganizationWithRole, status_code=status.HTTP_201_CREATED)
def create_organization(body: OrganizationCreate, request: Request, db: DbSession, user: CurrentUser):
    org = Organization(name=body.name)
    db.add(org)
    db.flush()
    db.add(Membership(organization_id=org.id, user_id=user.id, role="owner"))
    record(db, "organization.create", user_id=user.id, organization_id=org.id, target_type="organization",
           target_id=org.id, metadata={"name": org.name}, ip_address=client_ip(request))
    db.commit()
    return OrganizationWithRole(**OrganizationOut.model_validate(org).model_dump(), role="owner")


@router.get("/{org_id}", response_model=OrganizationWithRole)
def get_organization(org_id: uuid.UUID, db: DbSession, user: CurrentUser):
    m = _membership_or_404(db, org_id, user)
    org = db.get(Organization, org_id)
    return OrganizationWithRole(**OrganizationOut.model_validate(org).model_dump(), role=m.role)


@router.patch("/{org_id}", response_model=OrganizationOut)
def update_organization(org_id: uuid.UUID, body: OrganizationUpdate, request: Request, db: DbSession,
                        user: CurrentUser):
    m = _membership_or_404(db, org_id, user)
    if m.role not in ("owner", "admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Bu işlem için yetkiniz yok")
    org = db.get(Organization, org_id)
    updates = body.model_dump(exclude_unset=True, exclude_none=True)
    diff = changes(org, updates)
    for k, v in updates.items():
        setattr(org, k, v)
    if diff:
        record(db, "organization.update", user_id=user.id, organization_id=org.id, target_type="organization",
               target_id=org.id, metadata={"changes": diff}, ip_address=client_ip(request))
    db.commit()
    return org


@router.get("/{org_id}/members", response_model=list[MemberOut])
def list_members(org_id: uuid.UUID, db: DbSession, user: CurrentUser):
    m = _membership_or_404(db, org_id, user)
    if m.role not in ("owner", "admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Bu işlem için yetkiniz yok")
    rows = db.execute(
        select(User, Membership.role)
        .join(Membership, Membership.user_id == User.id)
        .where(Membership.organization_id == org_id)
        .order_by(User.email)
    ).all()
    return [MemberOut(user_id=u.id, email=u.email, full_name=u.full_name, role=r, is_active=u.is_active)
            for u, r in rows]
