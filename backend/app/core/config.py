"""Uygulama ayarları. Tüm değerler FG_ önekli ortam değişkenlerinden okunur."""
from __future__ import annotations

from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEV_SECRET = "dev-only-insecure-secret-change-me-0123456789"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="FG_", env_file=".env", extra="ignore")

    env: str = "development"  # development | test | production
    database_url: str = "postgresql+psycopg://factoryguard:dev-only-change-me@127.0.0.1:5432/factoryguard"
    jwt_secret: str = _DEV_SECRET
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 15
    refresh_token_days: int = 7
    cookie_secure: bool = False  # production'da HTTPS arkasında True olmalı
    cors_origins: list[str] = []
    login_max_failures: int = 5
    login_lockout_seconds: int = 300

    @model_validator(mode="after")
    def _check_production(self):
        if self.env == "production":
            if self.jwt_secret == _DEV_SECRET or len(self.jwt_secret) < 32:
                raise ValueError("Production ortamında FG_JWT_SECRET en az 32 karakterlik gizli bir değer olmalı")
            if not self.cookie_secure:
                raise ValueError("Production ortamında FG_COOKIE_SECURE=true olmalı (HTTPS)")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
