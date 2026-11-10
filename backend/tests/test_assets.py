"""Aşama 3 testleri: Cihaz keşfi, kanıta dayalı sınıflandırma, merkezi envanter filtreleri,
manuel düzenleme ve CSV içe aktarma."""
import pytest
from sqlalchemy import select

from app.models import AuditLog


@pytest.fixture
def inventory_env(client, make_org, make_user, login):
    org = make_org("Örnek Otomotiv A.Ş.")
    make_user("admin@oto.com", org, role="admin")
    make_user("viewer@oto.com", org, role="viewer")
    h_admin = login("admin@oto.com")
    h_viewer = login("viewer@oto.com")
    site = client.post("/api/v1/sites", json={"name": "Bursa Fabrika"}, headers=h_admin).json()
    zone = client.post(
        "/api/v1/zones",
        json={"site_id": site["id"], "name": "Kaynak Hattı", "criticality": "high"},
        headers=h_admin,
    ).json()
    sensor = client.post(
        "/api/v1/sensors/enroll",
        json={"site_id": site["id"], "name": "sensor-kaynak"},
        headers=h_admin,
    ).json()
    return {
        "org": org,
        "h_admin": h_admin,
        "h_viewer": h_viewer,
        "site": site,
        "zone": zone,
        "sensor": sensor,
        "h_sensor": {"X-Sensor-Token": sensor["sensor_token"]},
    }


def test_evidence_based_classification_without_false_vendor_claims(client, inventory_env):
    """Bölüm 4.2 & Test standardı #3:
    - Yalnızca IP/MAC olan cihaz 'Bilinmeyen cihaz' ve 'Üretici bilgisi doğrulanmadı' alır.
    - Modbus gözlenen cihaz 'Muhtemel endüstriyel cihaz' alır ama kesin üretici uydurulmaz.
    - Hostname 'hmi-line1' olan cihaz 'hmi' önerisi alır ama doğrulanmamış (is_verified=False) kalır.
    """
    sh = inventory_env["h_sensor"]
    h = inventory_env["h_admin"]
    payload = {
        "observations": [
            {
                "observed_at": "2026-11-10T12:00:00Z",
                "device": {"ip": "192.168.20.10", "mac": "00:11:22:33:44:01"},
                "evidence": {"source_logs": ["conn.log"], "observed_protocols": []},
            },
            {
                "observed_at": "2026-11-10T12:01:00Z",
                "device": {"ip": "192.168.20.20", "mac": "00:11:22:33:44:02"},
                "evidence": {"source_logs": ["conn.log", "modbus.log"], "observed_protocols": ["modbus"]},
            },
            {
                "observed_at": "2026-11-10T12:02:00Z",
                "device": {"ip": "192.168.20.30", "mac": "00:11:22:33:44:03", "hostname": "hmi-panel-1"},
                "evidence": {"source_logs": ["conn.log", "dhcp.log"], "observed_protocols": []},
            },
        ]
    }
    assert client.post("/api/v1/ingest/observations", json=payload, headers=sh).status_code == 200

    page = client.get("/api/v1/assets", headers=h).json()
    assert page["total"] == 3
    by_ip = {a["ip_address"]: a for a in page["items"]}

    d1 = by_ip["192.168.20.10"]
    assert d1["asset_type"] == "unknown_device"
    assert d1["vendor"] is None
    assert d1["classification_label"] == "Bilinmeyen cihaz"
    assert d1["vendor_status_label"] == "Üretici bilgisi doğrulanmadı"

    # Detay çağrısında gözlem kanıtındaki protokoller üzerinden etiket hesaplanır
    d2_detail = client.get(f"/api/v1/assets/{by_ip['192.168.20.20']['id']}", headers=h).json()
    assert d2_detail["vendor"] is None
    assert "Modbus" in d2_detail["classification_label"] or "MODBUS" in d2_detail["classification_label"]
    assert d2_detail["vendor_status_label"] == "Üretici bilgisi doğrulanmadı"

    d3 = by_ip["192.168.20.30"]
    assert d3["asset_type"] == "hmi"
    assert d3["is_verified"] is False
    assert "Doğrulanmadı" in d3["classification_label"]


def test_asset_manual_edit_verification_and_filters(client, inventory_env, db):
    """Aşama 3 başarı kriteri: Trafikte görülen cihaz envantere eklenir, kullanıcı tarafından
    düzenlenip doğrulanabilir, tüm filtrelerle sorgulanabilir ve audit log'a yazılır."""
    sh = inventory_env["h_sensor"]
    h = inventory_env["h_admin"]
    zone_id = inventory_env["zone"]["id"]

    client.post(
        "/api/v1/ingest/observations",
        json={
            "observations": [
                {
                    "observed_at": "2026-11-10T12:00:00Z",
                    "device": {"ip": "192.168.10.50", "mac": "00:11:22:33:44:50"},
                    "evidence": {"source_logs": ["conn.log"], "observed_protocols": ["modbus"]},
                }
            ]
        },
        headers=sh,
    )
    asset = client.get("/api/v1/assets", headers=h).json()["items"][0]

    # Viewer düzenleyemez (403)
    assert (
        client.patch(
            f"/api/v1/assets/{asset['id']}",
            json={"name": "Yetkisiz"},
            headers=inventory_env["h_viewer"],
        ).status_code
        == 403
    )

    # Admin/Analyst cihazı düzenler ve doğrular
    patch_res = client.patch(
        f"/api/v1/assets/{asset['id']}",
        json={
            "name": "Kaynak Hattı Ana PLC",
            "asset_type": "plc",
            "vendor": "Siemens",
            "model": "S7-1500",
            "serial_number": "SN-9001",
            "firmware_version": "V2.9.4",
            "zone_id": zone_id,
            "criticality": "critical",
            "is_verified": True,
        },
        headers=h,
    )
    assert patch_res.status_code == 200, patch_res.text
    updated = patch_res.json()
    assert updated["name"] == "Kaynak Hattı Ana PLC"
    assert updated["asset_type"] == "plc"
    assert updated["vendor"] == "Siemens"
    assert updated["confidence"] == 1.0
    assert updated["is_verified"] is True
    assert updated["classification_label"] == "PLC (Doğrulandı)"

    # Filtre kontrolleri
    assert client.get("/api/v1/assets?asset_type=plc", headers=h).json()["total"] == 1
    assert client.get("/api/v1/assets?asset_type=hmi", headers=h).json()["total"] == 0
    assert client.get("/api/v1/assets?vendor=siemens", headers=h).json()["total"] == 1
    assert client.get(f"/api/v1/assets?zone_id={zone_id}", headers=h).json()["total"] == 1
    assert client.get("/api/v1/assets?criticality=critical", headers=h).json()["total"] == 1
    assert client.get("/api/v1/assets?is_verified=true", headers=h).json()["total"] == 1
    assert client.get("/api/v1/assets?is_verified=false", headers=h).json()["total"] == 0
    assert client.get("/api/v1/assets?ip=192.168.10", headers=h).json()["total"] == 1

    # Audit log kontrolü
    audit = db.scalar(select(AuditLog).where(AuditLog.action == "asset.update"))
    assert audit is not None and audit.meta["changes"]["vendor"]["new"] == "Siemens"


def test_csv_import_creates_updates_and_reports_row_errors(client, inventory_env, db):
    h = inventory_env["h_admin"]
    site_id = inventory_env["site"]["id"]

    csv_text = (
        "name,ip_address,mac_address,hostname,asset_type,vendor,model,serial_number,firmware_version,zone,criticality,is_verified\n"
        "PLC-01,10.10.1.10,00:aa:bb:cc:dd:01,plc01.local,plc,Omron,NX1P2,OM-123,v1.40,Kaynak Hattı,high,true\n"
        "HMI-01,10.10.1.20,00:aa:bb:cc:dd:02,hmi01.local,hmi,Weintek,cMT3092X,WT-456,v2.1,Kaynak Hattı,medium,true\n"
        "HataliSatir,999.999.1.1,,,,,,invalid_zone,high,true\n"
    )
    res = client.post(
        "/api/v1/assets/import",
        json={"site_id": site_id, "csv_content": csv_text},
        headers=h,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["processed_rows"] == 3
    assert body["created"] == 2
    assert body["updated"] == 0
    assert len(body["errors"]) == 1 and body["errors"][0]["row"] == 4

    # Aynı IP ile güncellenmiş CSV tekrar içe aktarılırsa mükerrer oluşturmaz, mevcut kaydı günceller
    csv_update = (
        "name,ip_address,firmware_version,criticality\n"
        "PLC-01 Güncel,10.10.1.10,v1.50,critical\n"
    )
    res2 = client.post(
        "/api/v1/assets/import",
        json={"site_id": site_id, "csv_content": csv_update},
        headers=h,
    )
    assert res2.status_code == 200
    assert res2.json()["created"] == 0 and res2.json()["updated"] == 1

    plc = client.get("/api/v1/assets?ip=10.10.1.10", headers=h).json()["items"][0]
    assert plc["firmware_version"] == "v1.50" and plc["criticality"] == "critical"
    assert db.scalar(select(AuditLog).where(AuditLog.action == "asset.import")) is not None


def test_asset_tenant_isolation(client, inventory_env, make_org, make_user, login):
    sh = inventory_env["h_sensor"]
    client.post(
        "/api/v1/ingest/observations",
        json={"observations": [{"observed_at": "2026-11-10T12:00:00Z", "device": {"ip": "10.20.30.40"}}]},
        headers=sh,
    )
    asset_id = client.get("/api/v1/assets", headers=inventory_env["h_admin"]).json()["items"][0]["id"]

    org_b = make_org("Başka Fabrika")
    make_user("b@b.com", org_b, role="owner")
    hb = login("b@b.com")

    assert client.get("/api/v1/assets", headers=hb).json()["total"] == 0
    assert client.get(f"/api/v1/assets/{asset_id}", headers=hb).status_code == 404
    assert client.patch(f"/api/v1/assets/{asset_id}", json={"name": "Sızma"}, headers=hb).status_code == 404
