"""comm confidence, baseline columns, sensor fk, and ASSET_NOT_SEEN rule

Revision ID: d92f31a84b01
Revises: c41e77d29a04
Create Date: 2026-11-16 19:18:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d92f31a84b01"
down_revision: str | None = "c41e77d29a04"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("asset_communications", sa.Column("sensor_id", sa.Uuid(), nullable=True))
    op.add_column(
        "asset_communications",
        sa.Column("protocol_confidence", sa.String(length=16), server_default="observed", nullable=False),
    )
    op.add_column(
        "asset_communications",
        sa.Column("is_baseline_approved", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column(
        "asset_communications",
        sa.Column("baseline_approved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(op.f("ix_asset_communications_sensor_id"), "asset_communications", ["sensor_id"], unique=False)
    op.create_foreign_key(
        op.f("fk_asset_communications_sensor_id_sensors"),
        "asset_communications",
        "sensors",
        ["sensor_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_check_constraint(
        op.f("ck_asset_communications_protocol_confidence_valid"),
        "asset_communications",
        "protocol_confidence IN ('none', 'port_hint', 'observed')",
    )

    op.drop_constraint(op.f("ck_risk_findings_rule_key_valid"), "risk_findings", type_="check")
    op.create_check_constraint(
        op.f("ck_risk_findings_rule_key_valid"),
        "risk_findings",
        "rule_key IN ('NEW_ASSET', 'UNKNOWN_OT_ASSET', 'UNEXPECTED_COMMUNICATION', 'UNAPPROVED_REMOTE_PATH', 'KNOWN_VULNERABILITY', 'ASSET_NOT_SEEN')",
    )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM risk_findings WHERE rule_key = 'ASSET_NOT_SEEN'"))
    op.drop_constraint(op.f("ck_risk_findings_rule_key_valid"), "risk_findings", type_="check")
    op.create_check_constraint(
        op.f("ck_risk_findings_rule_key_valid"),
        "risk_findings",
        "rule_key IN ('NEW_ASSET', 'UNKNOWN_OT_ASSET', 'UNEXPECTED_COMMUNICATION', 'UNAPPROVED_REMOTE_PATH', 'KNOWN_VULNERABILITY')",
    )

    op.drop_constraint(op.f("ck_asset_communications_protocol_confidence_valid"), "asset_communications", type_="check")
    op.drop_constraint(op.f("fk_asset_communications_sensor_id_sensors"), "asset_communications", type_="foreignkey")
    op.drop_index(op.f("ix_asset_communications_sensor_id"), table_name="asset_communications")
    op.drop_column("asset_communications", "baseline_approved_at")
    op.drop_column("asset_communications", "is_baseline_approved")
    op.drop_column("asset_communications", "protocol_confidence")
    op.drop_column("asset_communications", "sensor_id")
