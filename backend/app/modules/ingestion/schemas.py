"""Sensör veri gönderimi (ingestion) Pydantic şemaları.

Hem tekil hem toplu (`items` listesi) gönderimi destekler; geçersiz IP, MAC veya port değerleri
Pydantic katmanında (422) reddedilir (Test standardı #8).
"""
from __future__ import annotations

import ipaddress
import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator


def _validate_ip(v: str) -> str:
    try:
        return str(ipaddress.ip_address(v.strip()))
    except ValueError as exc:
        raise ValueError(f"Geçersiz IP adresi: {v}") from exc


def _validate_mac(v: str | None) -> str | None:
    if v is None or v == "":
        return None
    h = v.strip().replace(":", "").replace("-", "").replace(".", "").lower()
    if len(h) != 12 or any(c not in "0123456789abcdef" for c in h):
        raise ValueError(f"Geçersiz MAC adresi: {v}")
    if h in ("000000000000", "ffffffffffff"):
        return None
    return ":".join(h[i : i + 2] for i in range(0, 12, 2))


class DeviceInfo(BaseModel):
    ip: str
    mac: str | None = None
    hostname: str | None = Field(default=None, max_length=255)

    @field_validator("ip")
    @classmethod
    def _ip(cls, v: str) -> str:
        return _validate_ip(v)

    @field_validator("mac")
    @classmethod
    def _mac(cls, v: str | None) -> str | None:
        return _validate_mac(v)


class ObservationIn(BaseModel):
    observed_at: datetime
    first_seen_at: datetime | None = None
    source: str = Field(default="zeek", min_length=1, max_length=64)
    device: DeviceInfo
    evidence: dict[str, Any] = Field(default_factory=dict)


class ObservationsIngestRequest(BaseModel):
    observations: list[ObservationIn] = Field(min_length=1, max_length=1000)


class ObservationIngestStats(BaseModel):
    discovery_run_id: uuid.UUID
    received: int
    observations_stored: int
    duplicates_skipped: int
    assets_created: int
    assets_updated: int


class CommunicationIn(BaseModel):
    source: str = Field(default="zeek", min_length=1, max_length=64)
    source_ip: str
    destination_ip: str
    transport: str | None = Field(default=None, max_length=16)
    protocol: str | None = Field(default=None, max_length=64)
    protocol_confidence: str = Field(default="none", max_length=16)
    source_port: int | None = Field(default=None, ge=0, le=65535)
    destination_port: int | None = Field(default=None, ge=0, le=65535)
    connection_count: int = Field(default=1, ge=1)
    first_seen_at: datetime | None = None
    last_seen_at: datetime
    evidence: dict[str, Any] = Field(default_factory=dict)

    @field_validator("source_ip", "destination_ip")
    @classmethod
    def _ips(cls, v: str) -> str:
        return _validate_ip(v)


class CommunicationsIngestRequest(BaseModel):
    communications: list[CommunicationIn] = Field(min_length=1, max_length=2000)


class CommunicationIngestStats(BaseModel):
    received: int
    communications_created: int
    communications_updated: int
    duplicates_skipped: int
