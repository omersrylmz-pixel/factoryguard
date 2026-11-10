"""Varlık (asset), kimlik geçmişi (asset_identifiers), gözlem (asset_observations) ve iletişim (asset_communications) modelleri."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import CRITICALITY_LEVELS, Base, CreatedAt, UUIDPk

ASSET_TYPES = (
    "plc",
    "hmi",
    "scada_server",
    "industrial_pc",
    "network_device",
    "engineering_workstation",
    "server",
    "computer",
    "unknown_device",
)
IDENTIFIER_TYPES = ("ip", "mac", "hostname")


class Asset(UUIDPk, CreatedAt, Base):
    __tablename__ = "assets"
    __table_args__ = (
        ForeignKeyConstraint(
            ["site_id", "organization_id"],
            ["sites.id", "sites.organization_id"],
            ondelete="RESTRICT",
            name="fk_assets_site_org",
        ),
        UniqueConstraint("id", "organization_id"),
        CheckConstraint(f"asset_type IN {ASSET_TYPES}", name="asset_type_valid"),
        CheckConstraint(f"criticality IN {CRITICALITY_LEVELS}", name="criticality_valid"),
        CheckConstraint("confidence >= 0.0 AND confidence <= 1.0", name="confidence_range"),
        Index("ix_assets_site_ip", "site_id", "ip_address"),
        Index("ix_assets_site_mac", "site_id", "mac_address"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    site_id: Mapped[uuid.UUID] = mapped_column(index=True)
    zone_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("zones.id", ondelete="SET NULL"), index=True
    )
    name: Mapped[str | None] = mapped_column(String(200))
    ip_address: Mapped[str | None] = mapped_column(String(45))
    mac_address: Mapped[str | None] = mapped_column(String(17))
    hostname: Mapped[str | None] = mapped_column(String(255))
    asset_type: Mapped[str] = mapped_column(
        String(32), default="unknown_device", server_default="unknown_device"
    )
    vendor: Mapped[str | None] = mapped_column(String(200))
    model: Mapped[str | None] = mapped_column(String(200))
    serial_number: Mapped[str | None] = mapped_column(String(200))
    firmware_version: Mapped[str | None] = mapped_column(String(200))
    criticality: Mapped[str] = mapped_column(String(16), default="medium", server_default="medium")
    confidence: Mapped[float] = mapped_column(Float, default=0.3, server_default="0.3")
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")


class AssetIdentifier(UUIDPk, Base):
    """Aynı cihazın zaman içinde kullandığı IP, MAC ve hostname geçmişi."""

    __tablename__ = "asset_identifiers"
    __table_args__ = (
        UniqueConstraint("asset_id", "identifier_type", "identifier_value"),
        CheckConstraint(f"identifier_type IN {IDENTIFIER_TYPES}", name="identifier_type_valid"),
    )

    asset_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("assets.id", ondelete="CASCADE"), index=True
    )
    identifier_type: Mapped[str] = mapped_column(String(16))
    identifier_value: Mapped[str] = mapped_column(String(255))
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    confidence: Mapped[float] = mapped_column(Float, default=0.5, server_default="0.5")


class AssetObservation(UUIDPk, Base):
    """Sensörden gelen normalize cihaz gözlemlerinin geçmişi.

    `dedup_hash` ile aynı sensörün aynı gözlemi tekrar göndermesi (idempotency) engellenir.
    """

    __tablename__ = "asset_observations"
    __table_args__ = (
        ForeignKeyConstraint(
            ["asset_id", "organization_id"],
            ["assets.id", "assets.organization_id"],
            ondelete="CASCADE",
            name="fk_obs_asset_org",
        ),
        ForeignKeyConstraint(
            ["sensor_id", "organization_id"],
            ["sensors.id", "sensors.organization_id"],
            ondelete="CASCADE",
            name="fk_obs_sensor_org",
        ),
        UniqueConstraint("sensor_id", "dedup_hash", name="uq_asset_observations_sensor_dedup"),
        Index("ix_asset_observations_org_observed", "organization_id", "observed_at"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    asset_id: Mapped[uuid.UUID] = mapped_column(index=True)
    sensor_id: Mapped[uuid.UUID] = mapped_column(index=True)
    source: Mapped[str] = mapped_column(String(64), default="zeek", server_default="zeek")
    evidence: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    confidence: Mapped[float] = mapped_column(Float, default=0.5, server_default="0.5")
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    dedup_hash: Mapped[str] = mapped_column(String(64))


class AssetCommunication(UUIDPk, Base):
    """Gözlemlenen cihazlar arası iletişim ilişkileri."""

    __tablename__ = "asset_communications"
    __table_args__ = (
        ForeignKeyConstraint(
            ["site_id", "organization_id"],
            ["sites.id", "sites.organization_id"],
            ondelete="RESTRICT",
            name="fk_comm_site_org",
        ),
        ForeignKeyConstraint(
            ["source_asset_id", "organization_id"],
            ["assets.id", "assets.organization_id"],
            ondelete="CASCADE",
            name="fk_comm_src_asset_org",
        ),
        ForeignKeyConstraint(
            ["target_asset_id", "organization_id"],
            ["assets.id", "assets.organization_id"],
            ondelete="CASCADE",
            name="fk_comm_dst_asset_org",
        ),
        UniqueConstraint(
            "site_id",
            "source_asset_id",
            "target_asset_id",
            "protocol",
            "target_port",
            name="uq_asset_comm_flow",
        ),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    site_id: Mapped[uuid.UUID] = mapped_column(index=True)
    source_asset_id: Mapped[uuid.UUID] = mapped_column(index=True)
    target_asset_id: Mapped[uuid.UUID] = mapped_column(index=True)
    protocol: Mapped[str] = mapped_column(String(64), default="unknown", server_default="unknown")
    source_port: Mapped[int | None] = mapped_column(Integer)
    target_port: Mapped[int | None] = mapped_column(Integer)
    connection_count: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
