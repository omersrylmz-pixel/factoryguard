from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select

from app.core.deps import AdminTenant, DbSession
from app.models import AuditLog

router = APIRouter(prefix="/audit-logs", tags=["audit"])


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID | None
    action: str
    target_type: str | None
    target_id: str | None
    metadata: dict[str, Any] = Field(validation_alias="meta")
    ip_address: str | None
    created_at: datetime


class AuditLogPage(BaseModel):
    items: list[AuditLogOut]
    total: int


@router.get("", response_model=AuditLogPage)
def list_audit_logs(
    db: DbSession,
    ctx: AdminTenant,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    action: str | None = None,
):
    q = select(AuditLog).where(AuditLog.organization_id == ctx.organization_id)
    if action:
        q = q.where(AuditLog.action == action)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    items = db.scalars(q.order_by(AuditLog.created_at.desc()).limit(limit).offset(offset)).all()
    return AuditLogPage(items=items, total=total or 0)
