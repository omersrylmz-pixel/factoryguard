from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from sqlalchemy import func, select

from app.core.deps import CurrentUser, DbSession, client_ip
from app.core.security import hash_password
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


_ALLOWED_ASSIGNABLE_ROLES = ("admin", "analyst", "viewer")


class MemberCreateRequest(BaseModel):
    email: EmailStr
    full_name: Name
    password: str = Field(min_length=8, max_length=128)
    role: str = "analyst"

    @field_validator("role")
    @classmethod
    def _validate_role(cls, v: str) -> str:
        val = v.strip().lower()
        if val not in _ALLOWED_ASSIGNABLE_ROLES:
            raise ValueError(f"Rol şunlardan biri olmalı: {', '.join(_ALLOWED_ASSIGNABLE_ROLES)}")
        return val


class MemberUpdateRequest(BaseModel):
    role: str | None = None
    is_active: bool | None = None

    @field_validator("role")
    @classmethod
    def _validate_role(cls, v: str | None) -> str | None:
        if v is None:
            return None
        val = v.strip().lower()
        if val not in _ALLOWED_ASSIGNABLE_ROLES:
            raise ValueError(f"Rol şunlardan biri olmalı: {', '.join(_ALLOWED_ASSIGNABLE_ROLES)}")
        return val


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


@router.post("/{org_id}/members", response_model=MemberOut, status_code=status.HTTP_201_CREATED)
def add_member(
    org_id: uuid.UUID,
    body: MemberCreateRequest,
    request: Request,
    db: DbSession,
    user: CurrentUser,
):
    m = _membership_or_404(db, org_id, user)
    if m.role not in ("owner", "admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Bu işlem için yetkiniz yok")

    email_norm = str(body.email).strip().lower()
    target_user = db.scalar(select(User).where(func.lower(User.email) == email_norm))
    if target_user is None:
        target_user = User(
            email=email_norm,
            full_name=body.full_name,
            password_hash=hash_password(body.password),
            is_active=True,
        )
        db.add(target_user)
        db.flush()

    existing = db.get(Membership, (org_id, target_user.id))
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Bu kullanıcı zaten organizasyon üyesi")

    db.add(Membership(organization_id=org_id, user_id=target_user.id, role=body.role))
    record(
        db,
        "member.add",
        user_id=user.id,
        organization_id=org_id,
        target_type="user",
        target_id=target_user.id,
        metadata={"email": target_user.email, "role": body.role},
        ip_address=client_ip(request),
    )
    db.commit()
    return MemberOut(
        user_id=target_user.id,
        email=target_user.email,
        full_name=target_user.full_name,
        role=body.role,
        is_active=target_user.is_active,
    )


@router.patch("/{org_id}/members/{member_user_id}", response_model=MemberOut)
def update_member(
    org_id: uuid.UUID,
    member_user_id: uuid.UUID,
    body: MemberUpdateRequest,
    request: Request,
    db: DbSession,
    user: CurrentUser,
):
    caller_m = _membership_or_404(db, org_id, user)
    if caller_m.role not in ("owner", "admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Bu işlem için yetkiniz yok")

    target_m = db.get(Membership, (org_id, member_user_id))
    target_u = db.get(User, member_user_id)
    if target_m is None or target_u is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Üye bulunamadı")

    if target_m.role == "owner":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Organizasyon sahibinin rolü veya durumu değiştirilemez")

    meta: dict[str, object] = {"email": target_u.email}
    if body.role is not None and body.role != target_m.role:
        meta["old_role"] = target_m.role
        meta["new_role"] = body.role
        target_m.role = body.role

    if body.is_active is not None and body.is_active != target_u.is_active:
        meta["is_active"] = body.is_active
        target_u.is_active = body.is_active

    record(
        db,
        "member.update",
        user_id=user.id,
        organization_id=org_id,
        target_type="user",
        target_id=target_u.id,
        metadata=meta,
        ip_address=client_ip(request),
    )
    db.commit()
    return MemberOut(
        user_id=target_u.id,
        email=target_u.email,
        full_name=target_u.full_name,
        role=target_m.role,
        is_active=target_u.is_active,
    )
