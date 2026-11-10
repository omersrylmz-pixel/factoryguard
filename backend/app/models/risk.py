"""Risk bulguları (risk_findings) ve güvenlik açığı kataloğu (vulnerability_catalog, asset_vulnerabilities) modelleri."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import CRITICALITY_LEVELS, Base, UUIDPk

RISK_RULES = (
    "NEW_ASSET",
    "UNKNOWN_OT_ASSET",
    "UNEXPECTED_COMMUNICATION",
    "UNAPPROVED_REMOTE_PATH",
    "KNOWN_VULNERABILITY",
)

RISK_STATUSES = (
    "open",
    "investigating",
    "accepted",
    "resolved",
    "false_positive",
)

VULN_MATCH_STATUSES = ("verified_match", "dismissed")


class RiskFinding(UUIDPk, Base):
    """Açıklanabilir, kural tabanlı risk bulgusu.

    `(organization_id, asset_id, rule_key, dedup_key)` benzersiz kısıtı sayesinde aynı risk olayı
    mükerrer kayıt üretmez (Test standardı #5); yalnızca `last_seen_at` ve kanıt güncellenir.
    """

    __tablename__ = "risk_findings"
    __table_args__ = (
        ForeignKeyConstraint(
            ["asset_id", "organization_id"],
            ["assets.id", "assets.organization_id"],
            ondelete="CASCADE",
            name="fk_risk_asset_org",
        ),
        UniqueConstraint(
            "organization_id",
            "asset_id",
            "rule_key",
            "dedup_key",
            name="uq_risk_findings_org_asset_rule_dedup",
        ),
        CheckConstraint(f"rule_key IN {RISK_RULES}", name="rule_key_valid"),
        CheckConstraint(f"severity IN {CRITICALITY_LEVELS}", name="severity_valid"),
        CheckConstraint(f"status IN {RISK_STATUSES}", name="status_valid"),
        CheckConstraint("score >= 0 AND score <= 100", name="score_range"),
        CheckConstraint("confidence >= 0.0 AND confidence <= 1.0", name="confidence_range"),
        Index("ix_risk_findings_org_status_sev", "organization_id", "status", "severity"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    asset_id: Mapped[uuid.UUID] = mapped_column(index=True)
    rule_key: Mapped[str] = mapped_column(String(64))
    dedup_key: Mapped[str] = mapped_column(String(128), default="default", server_default="default")
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(16))
    score: Mapped[int] = mapped_column(Integer)
    confidence: Mapped[float] = mapped_column(Float)
    evidence: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    recommendation: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(24), default="open", server_default="open")
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class VulnerabilityCatalog(UUIDPk, Base):
    """Bilinen güvenlik açığı kataloğu.

    Bir cihazla eşleşmesi için üretici (`vendor`), model (`product`) ve firmware sürümü
    (`version_exact`) kanıtının tam eşleşmesi gerekir.
    """

    __tablename__ = "vulnerability_catalog"

    cve_id: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    cpe: Mapped[str | None] = mapped_column(String(255))
    vendor: Mapped[str] = mapped_column(String(100), index=True)
    product: Mapped[str] = mapped_column(String(100), index=True)
    version_exact: Mapped[str] = mapped_column(String(100))
    cvss: Mapped[float] = mapped_column(Float)
    description: Mapped[str] = mapped_column(Text)
    recommendation: Mapped[str | None] = mapped_column(Text)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AssetVulnerability(UUIDPk, Base):
    __tablename__ = "asset_vulnerabilities"
    __table_args__ = (
        UniqueConstraint("asset_id", "vulnerability_id", name="uq_asset_vuln"),
        CheckConstraint(f"match_status IN {VULN_MATCH_STATUSES}", name="match_status_valid"),
    )

    asset_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("assets.id", ondelete="CASCADE"), index=True
    )
    vulnerability_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("vulnerability_catalog.id", ondelete="CASCADE"), index=True
    )
    match_status: Mapped[str] = mapped_column(
        String(24), default="verified_match", server_default="verified_match"
    )
