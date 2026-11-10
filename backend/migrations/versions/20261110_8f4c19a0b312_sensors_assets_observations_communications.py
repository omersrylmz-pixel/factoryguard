"""sensors assets observations communications

Revision ID: 8f4c19a0b312
Revises: 238a86522076
Create Date: 2026-11-10 23:25:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "8f4c19a0b312"
down_revision: str | None = "238a86522076"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "sensors",
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("site_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("version", sa.String(length=64), server_default="0.1.0", nullable=False),
        sa.Column("status", sa.String(length=16), server_default="active", nullable=False),
        sa.Column("credential_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("status IN ('active', 'offline', 'revoked')", name=op.f("ck_sensors_status_valid")),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_sensors_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["site_id", "organization_id"],
            ["sites.id", "sites.organization_id"],
            name="fk_sensors_site_org",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sensors")),
        sa.UniqueConstraint("id", "organization_id", name=op.f("uq_sensors_id_organization_id")),
        sa.UniqueConstraint("site_id", "name", name=op.f("uq_sensors_site_id_name")),
    )
    op.create_index(op.f("ix_sensors_credential_fingerprint"), "sensors", ["credential_fingerprint"], unique=True)
    op.create_index(op.f("ix_sensors_organization_id"), "sensors", ["organization_id"], unique=False)
    op.create_index(op.f("ix_sensors_site_id"), "sensors", ["site_id"], unique=False)

    op.create_table(
        "discovery_runs",
        sa.Column("sensor_id", sa.Uuid(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=16), server_default="completed", nullable=False),
        sa.Column("devices_seen", sa.Integer(), server_default="0", nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint(
            "status IN ('running', 'completed', 'failed')", name=op.f("ck_discovery_runs_status_valid")
        ),
        sa.ForeignKeyConstraint(
            ["sensor_id"],
            ["sensors.id"],
            name=op.f("fk_discovery_runs_sensor_id_sensors"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_discovery_runs")),
    )
    op.create_index(op.f("ix_discovery_runs_sensor_id"), "discovery_runs", ["sensor_id"], unique=False)

    op.create_table(
        "assets",
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("site_id", sa.Uuid(), nullable=False),
        sa.Column("zone_id", sa.Uuid(), nullable=True),
        sa.Column("name", sa.String(length=200), nullable=True),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("mac_address", sa.String(length=17), nullable=True),
        sa.Column("hostname", sa.String(length=255), nullable=True),
        sa.Column("asset_type", sa.String(length=32), server_default="unknown_device", nullable=False),
        sa.Column("vendor", sa.String(length=200), nullable=True),
        sa.Column("model", sa.String(length=200), nullable=True),
        sa.Column("serial_number", sa.String(length=200), nullable=True),
        sa.Column("firmware_version", sa.String(length=200), nullable=True),
        sa.Column("criticality", sa.String(length=16), server_default="medium", nullable=False),
        sa.Column("confidence", sa.Float(), server_default="0.3", nullable=False),
        sa.Column("is_verified", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "asset_type IN ('plc', 'hmi', 'scada_server', 'industrial_pc', 'network_device', 'engineering_workstation', 'server', 'computer', 'unknown_device')",
            name=op.f("ck_assets_asset_type_valid"),
        ),
        sa.CheckConstraint(
            "criticality IN ('low', 'medium', 'high', 'critical')", name=op.f("ck_assets_criticality_valid")
        ),
        sa.CheckConstraint("confidence >= 0.0 AND confidence <= 1.0", name=op.f("ck_assets_confidence_range")),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_assets_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["site_id", "organization_id"],
            ["sites.id", "sites.organization_id"],
            name="fk_assets_site_org",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["zone_id"],
            ["zones.id"],
            name=op.f("fk_assets_zone_id_zones"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_assets")),
        sa.UniqueConstraint("id", "organization_id", name=op.f("uq_assets_id_organization_id")),
    )
    op.create_index(op.f("ix_assets_organization_id"), "assets", ["organization_id"], unique=False)
    op.create_index(op.f("ix_assets_site_id"), "assets", ["site_id"], unique=False)
    op.create_index("ix_assets_site_ip", "assets", ["site_id", "ip_address"], unique=False)
    op.create_index("ix_assets_site_mac", "assets", ["site_id", "mac_address"], unique=False)
    op.create_index(op.f("ix_assets_zone_id"), "assets", ["zone_id"], unique=False)

    op.create_table(
        "asset_identifiers",
        sa.Column("asset_id", sa.Uuid(), nullable=False),
        sa.Column("identifier_type", sa.String(length=16), nullable=False),
        sa.Column("identifier_value", sa.String(length=255), nullable=False),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("confidence", sa.Float(), server_default="0.5", nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint(
            "identifier_type IN ('ip', 'mac', 'hostname')",
            name=op.f("ck_asset_identifiers_identifier_type_valid"),
        ),
        sa.ForeignKeyConstraint(
            ["asset_id"],
            ["assets.id"],
            name=op.f("fk_asset_identifiers_asset_id_assets"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_asset_identifiers")),
        sa.UniqueConstraint(
            "asset_id",
            "identifier_type",
            "identifier_value",
            name=op.f("uq_asset_identifiers_asset_id_identifier_type_identifier_value"),
        ),
    )
    op.create_index(op.f("ix_asset_identifiers_asset_id"), "asset_identifiers", ["asset_id"], unique=False)

    op.create_table(
        "asset_observations",
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("asset_id", sa.Uuid(), nullable=False),
        sa.Column("sensor_id", sa.Uuid(), nullable=False),
        sa.Column("source", sa.String(length=64), server_default="zeek", nullable=False),
        sa.Column("evidence", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("confidence", sa.Float(), server_default="0.5", nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("dedup_hash", sa.String(length=64), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["asset_id", "organization_id"],
            ["assets.id", "assets.organization_id"],
            name="fk_obs_asset_org",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_asset_observations_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["sensor_id", "organization_id"],
            ["sensors.id", "sensors.organization_id"],
            name="fk_obs_sensor_org",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_asset_observations")),
        sa.UniqueConstraint("sensor_id", "dedup_hash", name="uq_asset_observations_sensor_dedup"),
    )
    op.create_index(op.f("ix_asset_observations_asset_id"), "asset_observations", ["asset_id"], unique=False)
    op.create_index("ix_asset_observations_org_observed", "asset_observations", ["organization_id", "observed_at"], unique=False)
    op.create_index(op.f("ix_asset_observations_organization_id"), "asset_observations", ["organization_id"], unique=False)
    op.create_index(op.f("ix_asset_observations_sensor_id"), "asset_observations", ["sensor_id"], unique=False)

    op.create_table(
        "asset_communications",
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("site_id", sa.Uuid(), nullable=False),
        sa.Column("source_asset_id", sa.Uuid(), nullable=False),
        sa.Column("target_asset_id", sa.Uuid(), nullable=False),
        sa.Column("protocol", sa.String(length=64), server_default="unknown", nullable=False),
        sa.Column("source_port", sa.Integer(), nullable=True),
        sa.Column("target_port", sa.Integer(), nullable=True),
        sa.Column("connection_count", sa.Integer(), server_default="1", nullable=False),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_asset_communications_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["site_id", "organization_id"],
            ["sites.id", "sites.organization_id"],
            name="fk_comm_site_org",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["source_asset_id", "organization_id"],
            ["assets.id", "assets.organization_id"],
            name="fk_comm_src_asset_org",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["target_asset_id", "organization_id"],
            ["assets.id", "assets.organization_id"],
            name="fk_comm_dst_asset_org",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_asset_communications")),
        sa.UniqueConstraint(
            "site_id",
            "source_asset_id",
            "target_asset_id",
            "protocol",
            "target_port",
            name="uq_asset_comm_flow",
        ),
    )
    op.create_index(op.f("ix_asset_communications_organization_id"), "asset_communications", ["organization_id"], unique=False)
    op.create_index(op.f("ix_asset_communications_site_id"), "asset_communications", ["site_id"], unique=False)
    op.create_index(op.f("ix_asset_communications_source_asset_id"), "asset_communications", ["source_asset_id"], unique=False)
    op.create_index(op.f("ix_asset_communications_target_asset_id"), "asset_communications", ["target_asset_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_asset_communications_target_asset_id"), table_name="asset_communications")
    op.drop_index(op.f("ix_asset_communications_source_asset_id"), table_name="asset_communications")
    op.drop_index(op.f("ix_asset_communications_site_id"), table_name="asset_communications")
    op.drop_index(op.f("ix_asset_communications_organization_id"), table_name="asset_communications")
    op.drop_table("asset_communications")

    op.drop_index(op.f("ix_asset_observations_sensor_id"), table_name="asset_observations")
    op.drop_index(op.f("ix_asset_observations_organization_id"), table_name="asset_observations")
    op.drop_index("ix_asset_observations_org_observed", table_name="asset_observations")
    op.drop_index(op.f("ix_asset_observations_asset_id"), table_name="asset_observations")
    op.drop_table("asset_observations")

    op.drop_index(op.f("ix_asset_identifiers_asset_id"), table_name="asset_identifiers")
    op.drop_table("asset_identifiers")

    op.drop_index(op.f("ix_assets_zone_id"), table_name="assets")
    op.drop_index("ix_assets_site_mac", table_name="assets")
    op.drop_index("ix_assets_site_ip", table_name="assets")
    op.drop_index(op.f("ix_assets_site_id"), table_name="assets")
    op.drop_index(op.f("ix_assets_organization_id"), table_name="assets")
    op.drop_table("assets")

    op.drop_index(op.f("ix_discovery_runs_sensor_id"), table_name="discovery_runs")
    op.drop_table("discovery_runs")

    op.drop_index(op.f("ix_sensors_site_id"), table_name="sensors")
    op.drop_index(op.f("ix_sensors_organization_id"), table_name="sensors")
    op.drop_index(op.f("ix_sensors_credential_fingerprint"), table_name="sensors")
    op.drop_table("sensors")
