"""Sensör ve keşif çalışması (discovery_runs) modelleri.

Sensör kimlik doğrulaması:
- Kayıt (`POST /api/v1/sensors/enroll`) sırasında tek seferlik rastgele bir sensör anahtarı (`fg_snr_...`) üretilir.
- Veritabanında yalnızca SHA-256 özeti (`credential_fingerprint`) saklanır; ham anahtar asla saklanmaz.
- Bileşik FK `(site_id, organization_id)` ile bir sensörün başka tenant'ın fabrikasına bağlanması DB seviyesinde engellenir.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedAt, UUIDPk

SENSOR_STATUSES = ("active", "offline", "revoked")
DISCOVERY_RUN_STATUSES = ("running", "completed", "failed")


class Sensor(UUIDPk, CreatedAt, Base):
    __tablename__ = "sensors"
    __table_args__ = (
        ForeignKeyConstraint(
            ["site_id", "organization_id"],
            ["sites.id", "sites.organization_id"],
            ondelete="RESTRICT",
            name="fk_sensors_site_org",
        ),
        UniqueConstraint("site_id", "name"),
        UniqueConstraint("id", "organization_id"),
        CheckConstraint(f"status IN {SENSOR_STATUSES}", name="status_valid"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    site_id: Mapped[uuid.UUID] = mapped_column(index=True)
    name: Mapped[str] = mapped_column(String(200))
    version: Mapped[str] = mapped_column(String(64), default="0.1.0", server_default="0.1.0")
    status: Mapped[str] = mapped_column(String(16), default="active", server_default="active")
    credential_fingerprint: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class DiscoveryRun(UUIDPk, Base):
    __tablename__ = "discovery_runs"
    __table_args__ = (
        CheckConstraint(f"status IN {DISCOVERY_RUN_STATUSES}", name="status_valid"),
    )

    sensor_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("sensors.id", ondelete="CASCADE"), index=True
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(16), default="completed", server_default="completed")
    devices_seen: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
