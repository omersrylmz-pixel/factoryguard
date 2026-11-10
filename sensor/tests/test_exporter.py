from pathlib import Path
import pytest

from sensor.cli import run
from sensor.exporter.http_exporter import SensorExporter, SensorExportError

REAL = Path(__file__).resolve().parents[2] / "sample-data" / "zeek" / "real-modbus-testdata-part1"


def test_exporter_rejects_invalid_token():
    with pytest.raises(ValueError):
        SensorExporter("http://127.0.0.1:8000", "gecersiz-token")


def test_exporter_posts_observations_and_communications():
    calls = []

    def fake_transport(url, payload, headers, timeout):
        calls.append((url, payload, headers))
        return {"ok": True}

    exp = SensorExporter("http://127.0.0.1:8000/", "fg_snr_testtoken123456", transport=fake_transport)
    bundle = run(REAL, "lab-001")
    res = exp.export_normalized_bundle(bundle)

    assert res["observations"] == {"ok": True}
    assert res["communications"] == {"ok": True}
    assert len(calls) == 2
    assert calls[0][0] == "http://127.0.0.1:8000/api/v1/ingest/observations"
    assert calls[0][2]["X-Sensor-Token"] == "fg_snr_testtoken123456"
    assert len(calls[0][1]["observations"]) == 4
    assert calls[1][0] == "http://127.0.0.1:8000/api/v1/ingest/communications"
    assert len(calls[1][1]["communications"]) == 4


def test_exporter_wraps_connection_error():
    def broken_transport(url, payload, headers, timeout):
        raise OSError("connection refused")

    exp = SensorExporter("http://127.0.0.1:8000", "fg_snr_testtoken123456", transport=broken_transport)
    with pytest.raises(SensorExportError):
        exp.send_heartbeat()
