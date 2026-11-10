"""Tenant yapısı: organizations -> sites -> zones.

Tenant bütünlüğü veritabanı seviyesinde de korunur: zones, (site_id, organization_id) bileşik
foreign key'i ile sites'a bağlanır. Böylece bir bölge başka organizasyonun fabrikasına bağlanamaz.
"""
from __future__ import annotations

import uuid

from sqlalchemy import CheckConstraint, ForeignKey, ForeignKeyConstraint, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import CRITICALITY_LEVELS, Base, CreatedAt, UUIDPk

PLANS = ("starter", "growth", "partner", "enterprise")


class Organization(UUIDPk, CreatedAt, Base):
    __tablename__ = "organizations"
    __table_args__ = (CheckConstraint(f"plan IN {PLANS}", name="plan_valid"),)

    name: Mapped[str] = mapped_column(String(200))
    plan: Mapped[str] = mapped_column(String(32), default="starter", server_default="starter")


class Site(UUIDPk, CreatedAt, Base):
    __tablename__ = "sites"
    __table_args__ = (
        UniqueConstraint("organization_id", "name"),
        UniqueConstraint("id", "organization_id"),  # zones bileşik FK hedefi
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    industry: Mapped[str | None] = mapped_column(String(100))
    timezone: Mapped[str] = mapped_column(String(64), default="Europe/Istanbul", server_default="Europe/Istanbul")


class Zone(UUIDPk, CreatedAt, Base):
    __tablename__ = "zones"
    __table_args__ = (
        ForeignKeyConstraint(
            ["site_id", "organization_id"],
            ["sites.id", "sites.organization_id"],
            ondelete="RESTRICT",
            name="fk_zones_site_org",
        ),
        UniqueConstraint("site_id", "name"),
        CheckConstraint(f"criticality IN {CRITICALITY_LEVELS}", name="criticality_valid"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    site_id: Mapped[uuid.UUID] = mapped_column(index=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    criticality: Mapped[str] = mapped_column(String(16), default="medium", server_default="medium")
