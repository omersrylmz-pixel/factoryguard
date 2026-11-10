from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedAt, UUIDPk


class AuditLog(UUIDPk, CreatedAt, Base):
    """Kullanıcı işlemlerinin değiştirilemez kaydı.

    Organizasyon/kullanıcı silinse bile kayıt korunur (FK SET NULL).
    """

    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_logs_org_created", "organization_id", "created_at"),)

    organization_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("organizations.id", ondelete="SET NULL"))
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    action: Mapped[str] = mapped_column(String(100))
    target_type: Mapped[str | None] = mapped_column(String(50))
    target_id: Mapped[str | None] = mapped_column(String(64))
    # 'metadata' SQLAlchemy'de ayrılmış isim; kolon adı metadata, attribute adı meta.
    meta: Mapped[dict] = mapped_column("metadata", JSONB, default=dict, server_default="{}")
    ip_address: Mapped[str | None] = mapped_column(String(45))
