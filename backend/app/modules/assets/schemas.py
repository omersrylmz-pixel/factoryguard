"""Varlık envanteri (assets) Pydantic şemaları."""
from __future__ import annotations

import ipaddress
import uuid
from datetime import datetime
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from app.models.asset import ASSET_TYPES
from app.schemas.common import Criticality

OptionalText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]


def _validate_optional_ip(v: str | None) -> str | None:
    if v is None or v.strip() == "":
        return None
    try:
        return str(ipaddress.ip_address(v.strip()))
    except ValueError as exc:
        raise ValueError(f"Geçersiz IP adresi: {v}") from exc


def _validate_optional_mac(v: str | None) -> str | None:
    if v is None or v.strip() == "":
        return None
    h = v.strip().replace(":", "").replace("-", "").replace(".", "").lower()
    if len(h) != 12 or any(c not in "0123456789abcdef" for c in h):
        raise ValueError(f"Geçersiz MAC adresi: {v}")
    if h in ("000000000000", "ffffffffffff"):
        return None
    return ":".join(h[i : i + 2] for i in range(0, 12, 2))


def _validate_asset_type(v: str) -> str:
    val = v.strip().lower()
    if val not in ASSET_TYPES:
        raise ValueError(f"Cihaz türü şunlardan biri olmalı: {', '.join(ASSET_TYPES)}")
    return val


class AssetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    site_id: uuid.UUID
    zone_id: uuid.UUID | None
    name: str | None
    ip_address: str | None
    mac_address: str | None
    hostname: str | None
    asset_type: str
    vendor: str | None
    model: str | None
    serial_number: str | None
    firmware_version: str | None
    criticality: str
    confidence: float
    is_verified: bool
    is_active: bool
    first_seen_at: datetime
    last_seen_at: datetime
    created_at: datetime
    classification_label: str
    vendor_status_label: str


class AssetPage(BaseModel):
    items: list[AssetOut]
    total: int


class AssetIdentifierOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    identifier_type: str
    identifier_value: str
    first_seen_at: datetime
    last_seen_at: datetime
    confidence: float


class AssetObservationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    sensor_id: uuid.UUID
    source: str
    evidence: dict[str, Any]
    confidence: float
    observed_at: datetime


class AssetCommunicationOut(BaseModel):
    id: uuid.UUID
    direction: str  # outbound | inbound
    peer_asset_id: uuid.UUID
    peer_ip: str | None
    peer_name: str | None
    protocol: str
    source_port: int | None
    target_port: int | None
    connection_count: int
    first_seen_at: datetime
    last_seen_at: datetime


class AssetDetailOut(AssetOut):
    classification_reasons: list[str]
    identifiers: list[AssetIdentifierOut]
    observations: list[AssetObservationOut]
    communications: list[AssetCommunicationOut]


class AssetUpdate(BaseModel):
    name: OptionalText | None = None
    ip_address: str | None = None
    mac_address: str | None = None
    hostname: OptionalText | None = None
    asset_type: str | None = None
    vendor: OptionalText | None = None
    model: OptionalText | None = None
    serial_number: OptionalText | None = None
    firmware_version: OptionalText | None = None
    zone_id: uuid.UUID | None = None
    criticality: Criticality | None = None
    is_verified: bool | None = None
    is_active: bool | None = None

    @field_validator("ip_address")
    @classmethod
    def _ip(cls, v: str | None) -> str | None:
        return _validate_optional_ip(v)

    @field_validator("mac_address")
    @classmethod
    def _mac(cls, v: str | None) -> str | None:
        return _validate_optional_mac(v)

    @field_validator("asset_type")
    @classmethod
    def _type(cls, v: str | None) -> str | None:
        return _validate_asset_type(v) if v is not None else None


class CsvImportRequest(BaseModel):
    site_id: uuid.UUID
    csv_content: str = Field(min_length=1, max_length=2_000_000)


class CsvRowError(BaseModel):
    row: int
    error: str


class CsvImportResult(BaseModel):
    processed_rows: int
    created: int
    updated: int
    errors: list[CsvRowError]
