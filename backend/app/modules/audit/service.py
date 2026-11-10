"""Audit log servisi.

Kayıt, ana işlemle aynı transaction'a eklenir: işlem geri alınırsa audit kaydı da oluşmaz,
işlem başarılıysa audit kaydı kesin oluşur.
"""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditLog


def record(
    db: Session,
    action: str,
    *,
    user_id: uuid.UUID | None = None,
    organization_id: uuid.UUID | None = None,
    target_type: str | None = None,
    target_id: uuid.UUID | str | None = None,
    metadata: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> AuditLog:
    entry = AuditLog(
        action=action,
        user_id=user_id,
        organization_id=organization_id,
        target_type=target_type,
        target_id=str(target_id) if target_id is not None else None,
        meta=metadata or {},
        ip_address=ip_address,
    )
    db.add(entry)
    return entry


def changes(obj: Any, updates: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Uygulanacak değişikliklerin eski/yeni değerlerini döndürür (audit metadata için)."""
    out = {}
    for k, v in updates.items():
        old = getattr(obj, k)
        if old != v:
            out[k] = {"old": old, "new": v}
    return out
