"""Ortak şema yardımcıları."""
from __future__ import annotations

from typing import Annotated
from zoneinfo import available_timezones

from pydantic import AfterValidator, StringConstraints

from app.models.base import CRITICALITY_LEVELS

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)]

_TIMEZONES = available_timezones()


def _check_tz(v: str) -> str:
    if v not in _TIMEZONES:
        raise ValueError("Geçersiz saat dilimi (ör. Europe/Istanbul)")
    return v


def _check_criticality(v: str) -> str:
    if v not in CRITICALITY_LEVELS:
        raise ValueError(f"Kritiklik şu değerlerden biri olmalı: {', '.join(CRITICALITY_LEVELS)}")
    return v


TimezoneName = Annotated[str, AfterValidator(_check_tz)]
Criticality = Annotated[str, AfterValidator(_check_criticality)]
