"""Sensör HTTP veri aktarıcısı (exporter) — dış bağımlılıksız (stdlib urllib).

Görevleri:
1. Normalize edilmiş gözlemleri (`POST /api/v1/ingest/observations`) ve iletişimleri
   (`POST /api/v1/ingest/communications`) `X-Sensor-Token` başlığıyla backend'e göndermek.
2. Periyodik veya tek seferlik heartbeat (`POST /api/v1/sensors/heartbeat`) göndermek.
3. Ağ ve HTTP hatalarını yakalayıp anlaşılır şekilde loglamak.
"""
from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from typing import Any, Callable

log = logging.getLogger(__name__)

TransportFn = Callable[[str, dict[str, Any] | None, dict[str, str], float], dict[str, Any]]


def _default_transport(
    url: str,
    payload: dict[str, Any] | None,
    headers: dict[str, str],
    timeout: float,
) -> dict[str, Any]:
    data = json.dumps(payload).encode("utf-8") if payload is not None else b"{}"
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", **headers},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read().decode("utf-8")
        return json.loads(body) if body else {}


class SensorExportError(RuntimeError):
    """Backend'e veri aktarımı sırasında oluşan hata."""


class SensorExporter:
    def __init__(
        self,
        api_base_url: str,
        sensor_token: str,
        timeout: float = 10.0,
        transport: TransportFn | None = None,
    ) -> None:
        if not sensor_token or not sensor_token.startswith("fg_snr_"):
            raise ValueError("Geçerli bir sensör anahtarı (fg_snr_...) gerekli")
        self.api_base_url = api_base_url.rstrip("/")
        self.sensor_token = sensor_token
        self.timeout = timeout
        self._transport = transport or _default_transport

    def _headers(self) -> dict[str, str]:
        return {"X-Sensor-Token": self.sensor_token}

    def _post(self, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        url = f"{self.api_base_url}{path}"
        try:
            return self._transport(url, payload, self._headers(), self.timeout)
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            log.error("Sensör aktarım HTTP hatası (%s %s): %s", exc.code, path, detail)
            raise SensorExportError(f"HTTP {exc.code}: {detail}") from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            log.error("Sensör bağlantı hatası (%s): %s", path, exc)
            raise SensorExportError(f"Bağlantı hatası: {exc}") from exc

    def send_heartbeat(self, version: str = "0.1.0") -> dict[str, Any]:
        return self._post("/api/v1/sensors/heartbeat", {"version": version})

    def export_normalized_bundle(self, bundle: dict[str, Any]) -> dict[str, Any]:
        """`sensor.cli.run` çıktısını (observations + communications) backend'e aktarır."""
        obs = bundle.get("observations") or []
        comms = bundle.get("communications") or []
        obs_result: dict[str, Any] | None = None
        comm_result: dict[str, Any] | None = None

        if obs:
            obs_result = self._post("/api/v1/ingest/observations", {"observations": obs})
        if comms:
            comm_result = self._post("/api/v1/ingest/communications", {"communications": comms})
        if not obs and not comms:
            self.send_heartbeat()

        return {
            "observations": obs_result,
            "communications": comm_result,
        }
