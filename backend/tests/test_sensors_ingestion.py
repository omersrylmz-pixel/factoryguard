"""Aşama 2 testleri: Sensör kayıt, kimlik doğrulama, heartbeat, ingestion, dedup ve IP değişimi geçmişi."""
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import select

from app.models import Asset, AssetCommunication, AssetIdentifier, AssetObservation, AuditLog, DiscoveryRun, Sensor
from sensor.cli import run as run_sensor_normalizer
from sensor.exporter.http_exporter import SensorExporter

REAL_ZEEK_DIR = Path(__file__).resolve().parents[2] / "sample-data" / "zeek" / "real-modbus-testdata-part1"


@pytest.fixture
def enrolled_sensor(client, make_org, make_user, login):
    org = make_org("Fabrika A")
    make_user("admin@a.com", org, role="admin")
    headers = login("admin@a.com")
    site = client.post("/api/v1/sites", json={"name": "Ana Tesis"}, headers=headers).json()
    enroll = client.post(
        "/api/v1/sensors/enroll",
        json={"site_id": site["id"], "name": "sensor-hat-1", "version": "0.2.0"},
        headers=headers,
    )
    assert enroll.status_code == 201, enroll.text
    return {"org": org, "headers": headers, "site": site, "sensor": enroll.json()}


def test_sensor_enroll_stores_only_fingerprint_and_audits(enrolled_sensor, db):
    data = enrolled_sensor["sensor"]
    assert data["sensor_token"].startswith("fg_snr_")
    assert len(data["credential_fingerprint"]) == 64
    assert data["sensor_token"] != data["credential_fingerprint"]
    # Henüz veri/heartbeat göndermedi -> bağlantısı offline görünmeli
    assert data["connectivity_status"] == "offline" and data["is_connected"] is False

    s_db = db.get(Sensor, data["id"])
    assert s_db.credential_fingerprint == data["credential_fingerprint"]
    audit = db.scalar(select(AuditLog).where(AuditLog.action == "sensor.enroll"))
    assert audit is not None and audit.target_id == data["id"]


def test_sensor_heartbeat_and_offline_detection(client, enrolled_sensor, db):
    s = enrolled_sensor["sensor"]
    h = enrolled_sensor["headers"]
    sensor_headers = {"X-Sensor-Token": s["sensor_token"]}

    # 1. Sensör heartbeat gönderir -> active ve connected olur
    hb = client.post("/api/v1/sensors/heartbeat", json={"version": "0.2.1"}, headers=sensor_headers)
    assert hb.status_code == 200
    assert hb.json()["is_connected"] is True and hb.json()["version"] == "0.2.1"

    # 2. Kullanıcı sağlık durumunu sorgular -> connected
    uh = client.get(f"/api/v1/sensors/{s['id']}/health", headers=h)
    assert uh.status_code == 200 and uh.json()["connectivity_status"] == "active"

    # 3. Son görülme 10 dakika önceye çekilirse -> bağlantı kesilmiş (offline) görünmeli (Test standardı #4)
    s_db = db.get(Sensor, s["id"])
    s_db.last_seen_at = datetime.now(UTC) - timedelta(minutes=10)
    db.commit()

    uh2 = client.get(f"/api/v1/sensors/{s['id']}/health", headers=h)
    assert uh2.status_code == 200
    assert uh2.json()["connectivity_status"] == "offline" and uh2.json()["is_connected"] is False

    # 4. Sensör GET /sensors/{id}/health endpoint'ini kendi token'ıyla çağırırsa tekrar online olur
    sh = client.get(f"/api/v1/sensors/{s['id']}/health", headers=sensor_headers)
    assert sh.status_code == 200 and sh.json()["is_connected"] is True


def test_sensor_auth_rejects_missing_wrong_or_revoked_token(client, enrolled_sensor, db):
    obs_payload = {
        "observations": [
            {"observed_at": "2026-11-10T10:00:00Z", "device": {"ip": "192.168.1.10"}}
        ]
    }
    assert client.post("/api/v1/ingest/observations", json=obs_payload).status_code == 401
    assert (
        client.post(
            "/api/v1/ingest/observations",
            json=obs_payload,
            headers={"X-Sensor-Token": "fg_snr_yanlis"},
        ).status_code
        == 401
    )

    s_db = db.get(Sensor, enrolled_sensor["sensor"]["id"])
    s_db.status = "revoked"
    db.commit()
    assert (
        client.post(
            "/api/v1/ingest/observations",
            json=obs_payload,
            headers={"X-Sensor-Token": enrolled_sensor["sensor"]["sensor_token"]},
        ).status_code
        == 401
    )


def test_ingest_deduplication_and_no_vendor_guessing(client, enrolled_sensor, db):
    """Test standardı #1 (mükerrer cihaz/gözlem oluşmaması) ve #3 (tahmini üretici atanmaması)."""
    token = enrolled_sensor["sensor"]["sensor_token"]
    sh = {"X-Sensor-Token": token}
    payload = {
        "observations": [
            {
                "observed_at": "2026-11-10T10:00:00Z",
                "first_seen_at": "2026-11-10T09:55:00Z",
                "source": "zeek",
                "device": {"ip": "192.168.10.20", "mac": "00:11:22:33:44:55", "hostname": None},
                "evidence": {"source_logs": ["conn.log"], "observed_protocols": ["modbus"]},
            }
        ]
    }
    r1 = client.post("/api/v1/ingest/observations", json=payload, headers=sh)
    assert r1.status_code == 200
    assert r1.json()["assets_created"] == 1 and r1.json()["observations_stored"] == 1

    # Birebir aynı gözlem tekrar gönderildiğinde atlanmalı
    r2 = client.post("/api/v1/ingest/observations", json=payload, headers=sh)
    assert r2.status_code == 200
    assert r2.json()["duplicates_skipped"] == 1 and r2.json()["observations_stored"] == 0

    # Aynı cihaz daha yeni bir zamanda tekrar görüldüğünde yeni Asset oluşmamalı, mevcut güncellenmeli
    payload["observations"][0]["observed_at"] = "2026-11-10T10:05:00Z"
    r3 = client.post("/api/v1/ingest/observations", json=payload, headers=sh)
    assert r3.status_code == 200
    assert r3.json()["assets_created"] == 0 and r3.json()["assets_updated"] == 1

    assets = db.scalars(select(Asset)).all()
    assert len(assets) == 1
    assert assets[0].asset_type == "unknown_device"
    assert assets[0].vendor is None and assets[0].model is None
    assert len(db.scalars(select(AssetObservation)).all()) == 2


def test_ip_change_preserves_device_history(client, enrolled_sensor, db):
    """Test standardı #2: Cihazın IP adresinin değişmesi durumunda geçmişin korunması."""
    sh = {"X-Sensor-Token": enrolled_sensor["sensor"]["sensor_token"]}
    p1 = {
        "observations": [
            {
                "observed_at": "2026-11-10T10:00:00Z",
                "device": {"ip": "192.168.10.30", "mac": "aa:bb:cc:dd:ee:01", "hostname": "hmi-01"},
                "evidence": {"source_logs": ["conn.log", "dhcp.log"]},
            }
        ]
    }
    p2 = {
        "observations": [
            {
                "observed_at": "2026-11-10T11:00:00Z",
                "device": {"ip": "192.168.10.31", "mac": "aa:bb:cc:dd:ee:01", "hostname": "hmi-01"},
                "evidence": {"source_logs": ["conn.log", "dhcp.log"]},
            }
        ]
    }
    assert client.post("/api/v1/ingest/observations", json=p1, headers=sh).status_code == 200
    r2 = client.post("/api/v1/ingest/observations", json=p2, headers=sh)
    assert r2.status_code == 200
    assert r2.json()["assets_created"] == 0 and r2.json()["assets_updated"] == 1

    assets = db.scalars(select(Asset)).all()
    assert len(assets) == 1
    assert assets[0].ip_address == "192.168.10.31"

    ip_history = db.scalars(
        select(AssetIdentifier.identifier_value).where(
            AssetIdentifier.asset_id == assets[0].id,
            AssetIdentifier.identifier_type == "ip",
        )
    ).all()
    assert set(ip_history) == {"192.168.10.30", "192.168.10.31"}


def test_invalid_observations_and_communications_rejected(client, enrolled_sensor):
    """Test standardı #8: Geçersiz kayıtların reddedilmesi."""
    sh = {"X-Sensor-Token": enrolled_sensor["sensor"]["sensor_token"]}
    bad_ip = {"observations": [{"observed_at": "2026-11-10T10:00:00Z", "device": {"ip": "999.999.1.1"}}]}
    bad_mac = {
        "observations": [
            {"observed_at": "2026-11-10T10:00:00Z", "device": {"ip": "10.0.0.1", "mac": "not-a-mac"}}
        ]
    }
    bad_port = {
        "communications": [
            {
                "source_ip": "10.0.0.1",
                "destination_ip": "10.0.0.2",
                "destination_port": 70000,
                "last_seen_at": "2026-11-10T10:00:00Z",
            }
        ]
    }
    for payload in (bad_ip, bad_mac):
        assert client.post("/api/v1/ingest/observations", json=payload, headers=sh).status_code == 422
    assert client.post("/api/v1/ingest/communications", json=bad_port, headers=sh).status_code == 422


def test_sensor_tenant_isolation(client, enrolled_sensor, make_org, make_user, login):
    """Test standardı #6: Bir tenant diğer tenant'ın sensörünü göremez veya oraya sensör kaydedemez."""
    org_b = make_org("Fabrika B")
    make_user("b@b.com", org_b, role="owner")
    hb = login("b@b.com")

    s_id = enrolled_sensor["sensor"]["id"]
    site_a_id = enrolled_sensor["site"]["id"]

    assert client.get("/api/v1/sensors", headers=hb).json() == []
    assert client.get(f"/api/v1/sensors/{s_id}", headers=hb).status_code == 404
    assert client.get(f"/api/v1/sensors/{s_id}/health", headers=hb).status_code == 404
    assert (
        client.post(
            "/api/v1/sensors/enroll",
            json={"site_id": site_a_id, "name": "sızma"},
            headers=hb,
        ).status_code
        == 404
    )


def test_end_to_end_real_zeek_bundle_via_sensor_exporter(client, enrolled_sensor, db):
    """Aşama 2 başarı kriteri: Gerçek Zeek loglarından normalize edilen verinin
    SensorExporter üzerinden FastAPI'ye gönderilip PostgreSQL'e kaydedilmesi."""
    token = enrolled_sensor["sensor"]["sensor_token"]
    bundle = run_sensor_normalizer(REAL_ZEEK_DIR, "lab-001")

    def testclient_transport(url, payload, headers, timeout):
        path = url.split("http://testserver", 1)[1]
        resp = client.post(path, json=payload, headers=headers)
        assert resp.status_code == 200, resp.text
        return resp.json()

    exporter = SensorExporter("http://testserver", token, transport=testclient_transport)
    result = exporter.export_normalized_bundle(bundle)

    assert result["observations"]["assets_created"] == 4
    assert result["observations"]["observations_stored"] == 4
    assert result["communications"]["communications_created"] == 4

    # Gerçek PCAP'te 10.0.0.8 ve 10.0.0.9 aynı MAC'i paylaşıyordu -> birleştirilmemeli, 4 ayrı Asset olmalı
    assets = db.scalars(select(Asset).order_by(Asset.ip_address)).all()
    assert [a.ip_address for a in assets] == ["10.0.0.3", "10.0.0.57", "10.0.0.8", "10.0.0.9"]
    assert len(db.scalars(select(AssetCommunication)).all()) == 4
    assert len(db.scalars(select(DiscoveryRun)).all()) == 1

    # Sensör detayında discovery_run görünmeli
    detail = client.get(
        f"/api/v1/sensors/{enrolled_sensor['sensor']['id']}",
        headers=enrolled_sensor["headers"],
    ).json()
    assert detail["is_connected"] is True
    assert detail["recent_runs"][0]["devices_seen"] == 4
