"""Bilinen güvenlik açığı kataloğu yönetimi (`/api/v1/vulnerabilities`).

Katalog kayıtları `KNOWN_VULNERABILITY` kuralı tarafından yalnızca üretici (`vendor`), model (`product`)
ve tam firmware sürümü (`version_exact`) eşleştiğinde kullanılır.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.deps import AdminTenant, DbSession, Tenant, client_ip
from app.models import VulnerabilityCatalog
from app.modules.audit.service import record
from app.modules.risk_engine.service import evaluate_organization_risks

router = APIRouter(prefix="/vulnerabilities", tags=["vulnerabilities"])

NonEmptyStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class VulnerabilityCreate(BaseModel):
    cve_id: Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=32)]
    cpe: str | None = Field(default=None, max_length=255)
    vendor: NonEmptyStr
    product: NonEmptyStr
    version_exact: NonEmptyStr
    cvss: float = Field(ge=0.0, le=10.0)
    description: str = Field(min_length=5, max_length=4000)
    recommendation: str | None = Field(default=None, max_length=4000)
    published_at: datetime | None = None


class VulnerabilityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    cve_id: str
    cpe: str | None
    vendor: str
    product: str
    version_exact: str
    cvss: float
    description: str
    recommendation: str | None
    published_at: datetime | None


@router.get("/catalog", response_model=list[VulnerabilityOut])
def list_vulnerability_catalog(db: DbSession, _ctx: Tenant):
    return db.scalars(select(VulnerabilityCatalog).order_by(VulnerabilityCatalog.cve_id)).all()


@router.post("/catalog", response_model=VulnerabilityOut, status_code=status.HTTP_201_CREATED)
def add_vulnerability_to_catalog(
    body: VulnerabilityCreate,
    request: Request,
    db: DbSession,
    ctx: AdminTenant,
):
    vuln = VulnerabilityCatalog(
        cve_id=body.cve_id.upper(),
        cpe=body.cpe,
        vendor=body.vendor,
        product=body.product,
        version_exact=body.version_exact,
        cvss=body.cvss,
        description=body.description,
        recommendation=body.recommendation,
        published_at=body.published_at,
    )
    db.add(vuln)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Bu CVE kimliği katalogda zaten mevcut") from None

    record(
        db,
        "vulnerability_catalog.create",
        user_id=ctx.user.id,
        organization_id=ctx.organization_id,
        target_type="vulnerability_catalog",
        target_id=vuln.id,
        metadata={"cve_id": vuln.cve_id, "vendor": vuln.vendor, "product": vuln.product, "version": vuln.version_exact},
        ip_address=client_ip(request),
    )
    db.commit()
    evaluate_organization_risks(db, ctx.organization_id)
    return vuln
