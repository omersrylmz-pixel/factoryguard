"""FactoryGuard Lite API — modüler monolith giriş noktası."""
from __future__ import annotations

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import get_settings
from app.core.db import get_engine
from app.modules.assets.router import router as assets_router
from app.modules.audit.router import router as audit_router
from app.modules.auth.router import router as auth_router
from app.modules.ingestion.router import router as ingestion_router
from app.modules.organizations.router import router as org_router
from app.modules.sensors.router import router as sensors_router
from app.modules.sites.router import router as site_router
from app.modules.zones.router import router as zone_router

VERSION = "0.1.0"


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="FactoryGuard Lite API",
        version=VERSION,
        # Production'da şema keşfini kapat.
        docs_url=None if settings.env == "production" else "/api/docs",
        openapi_url=None if settings.env == "production" else "/api/openapi.json",
    )
    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["GET", "POST", "PATCH", "DELETE"],
            allow_headers=["Authorization", "Content-Type", "X-Organization-ID"],
        )

    api = APIRouter(prefix="/api/v1")
    for r in (auth_router, org_router, site_router, zone_router, sensors_router, ingestion_router, assets_router, audit_router):
        api.include_router(r)

    @api.get("/health", tags=["system"])
    def health():
        try:
            with get_engine().connect() as conn:
                conn.execute(text("SELECT 1"))
            db = "ok"
        except Exception:  # noqa: BLE001 — sağlık kontrolü hatayı yutup durum bildirir
            db = "unavailable"
        return {"status": "ok" if db == "ok" else "degraded", "database": db, "version": VERSION}

    app.include_router(api)
    return app


app = create_app()
