"""risk findings and vulnerabilities

Revision ID: c41e77d29a04
Revises: 8f4c19a0b312
Create Date: 2026-11-11 00:42:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c41e77d29a04"
down_revision: str | None = "8f4c19a0b312"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "vulnerability_catalog",
        sa.Column("cve_id", sa.String(length=32), nullable=False),
        sa.Column("cpe", sa.String(length=255), nullable=True),
        sa.Column("vendor", sa.String(length=100), nullable=False),
        sa.Column("product", sa.String(length=100), nullable=False),
        sa.Column("version_exact", sa.String(length=100), nullable=False),
        sa.Column("cvss", sa.Float(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("recommendation", sa.Text(), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_vulnerability_catalog")),
    )
    op.create_index(op.f("ix_vulnerability_catalog_cve_id"), "vulnerability_catalog", ["cve_id"], unique=True)
    op.create_index(op.f("ix_vulnerability_catalog_product"), "vulnerability_catalog", ["product"], unique=False)
    op.create_index(op.f("ix_vulnerability_catalog_vendor"), "vulnerability_catalog", ["vendor"], unique=False)

    op.create_table(
        "asset_vulnerabilities",
        sa.Column("asset_id", sa.Uuid(), nullable=False),
        sa.Column("vulnerability_id", sa.Uuid(), nullable=False),
        sa.Column("match_status", sa.String(length=24), server_default="verified_match", nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint(
            "match_status IN ('verified_match', 'dismissed')",
            name=op.f("ck_asset_vulnerabilities_match_status_valid"),
        ),
        sa.ForeignKeyConstraint(
            ["asset_id"],
            ["assets.id"],
            name=op.f("fk_asset_vulnerabilities_asset_id_assets"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["vulnerability_id"],
            ["vulnerability_catalog.id"],
            name=op.f("fk_asset_vulnerabilities_vulnerability_id_vulnerability_catalog"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_asset_vulnerabilities")),
        sa.UniqueConstraint("asset_id", "vulnerability_id", name="uq_asset_vuln"),
    )
    op.create_index(op.f("ix_asset_vulnerabilities_asset_id"), "asset_vulnerabilities", ["asset_id"], unique=False)
    op.create_index(
        op.f("ix_asset_vulnerabilities_vulnerability_id"),
        "asset_vulnerabilities",
        ["vulnerability_id"],
        unique=False,
    )

    op.create_table(
        "risk_findings",
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("asset_id", sa.Uuid(), nullable=False),
        sa.Column("rule_key", sa.String(length=64), nullable=False),
        sa.Column("dedup_key", sa.String(length=128), server_default="default", nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("evidence", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("recommendation", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=24), server_default="open", nullable=False),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint(
            "rule_key IN ('NEW_ASSET', 'UNKNOWN_OT_ASSET', 'UNEXPECTED_COMMUNICATION', 'UNAPPROVED_REMOTE_PATH', 'KNOWN_VULNERABILITY')",
            name=op.f("ck_risk_findings_rule_key_valid"),
        ),
        sa.CheckConstraint(
            "severity IN ('low', 'medium', 'high', 'critical')",
            name=op.f("ck_risk_findings_severity_valid"),
        ),
        sa.CheckConstraint(
            "status IN ('open', 'investigating', 'accepted', 'resolved', 'false_positive')",
            name=op.f("ck_risk_findings_status_valid"),
        ),
        sa.CheckConstraint("score >= 0 AND score <= 100", name=op.f("ck_risk_findings_score_range")),
        sa.CheckConstraint("confidence >= 0.0 AND confidence <= 1.0", name=op.f("ck_risk_findings_confidence_range")),
        sa.ForeignKeyConstraint(
            ["asset_id", "organization_id"],
            ["assets.id", "assets.organization_id"],
            name="fk_risk_asset_org",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_risk_findings_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_risk_findings")),
        sa.UniqueConstraint(
            "organization_id",
            "asset_id",
            "rule_key",
            "dedup_key",
            name="uq_risk_findings_org_asset_rule_dedup",
        ),
    )
    op.create_index(op.f("ix_risk_findings_asset_id"), "risk_findings", ["asset_id"], unique=False)
    op.create_index("ix_risk_findings_org_status_sev", "risk_findings", ["organization_id", "status", "severity"], unique=False)
    op.create_index(op.f("ix_risk_findings_organization_id"), "risk_findings", ["organization_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_risk_findings_organization_id"), table_name="risk_findings")
    op.drop_index("ix_risk_findings_org_status_sev", table_name="risk_findings")
    op.drop_index(op.f("ix_risk_findings_asset_id"), table_name="risk_findings")
    op.drop_table("risk_findings")

    op.drop_index(op.f("ix_asset_vulnerabilities_vulnerability_id"), table_name="asset_vulnerabilities")
    op.drop_index(op.f("ix_asset_vulnerabilities_asset_id"), table_name="asset_vulnerabilities")
    op.drop_table("asset_vulnerabilities")

    op.drop_index(op.f("ix_vulnerability_catalog_vendor"), table_name="vulnerability_catalog")
    op.drop_index(op.f("ix_vulnerability_catalog_product"), table_name="vulnerability_catalog")
    op.drop_index(op.f("ix_vulnerability_catalog_cve_id"), table_name="vulnerability_catalog")
    op.drop_table("vulnerability_catalog")
