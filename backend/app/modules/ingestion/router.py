"""Sensör veri gönderim (ingestion) API uç noktaları."""
from __future__ import annotations

from fastapi import APIRouter

from app.core.deps import AuthenticatedSensor, DbSession
from app.modules.ingestion import service
from app.modules.ingestion.schemas import (
    CommunicationIngestStats,
    CommunicationsIngestRequest,
    ObservationIngestStats,
    ObservationsIngestRequest,
)

router = APIRouter(prefix="/ingest", tags=["ingestion"])


@router.post("/observations", response_model=ObservationIngestStats)
def post_observations(
    body: ObservationsIngestRequest,
    sensor: AuthenticatedSensor,
    db: DbSession,
):
    return service.ingest_observations(db, sensor, body.observations)


@router.post("/communications", response_model=CommunicationIngestStats)
def post_communications(
    body: CommunicationsIngestRequest,
    sensor: AuthenticatedSensor,
    db: DbSession,
):
    return service.ingest_communications(db, sensor, body.communications)
