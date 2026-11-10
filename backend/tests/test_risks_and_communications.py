"""Aşama 4 testleri: Ağ iletişim grafiği, 5 risk kuralı (NEW_ASSET, UNKNOWN_OT_ASSET,
UNEXPECTED_COMMUNICATION, UNAPPROVED_REMOTE_PATH, KNOWN_VULNERABILITY), 100 puanlık açıklanabilir
puanlama modeli, mükerrer risk kaydı oluşmaması (Test standardı #5), false positive yönetimi ve
durum değişikliklerinin audit log'a yazılması (Test standardı #9)."""
import pytest
from sqlalchemy import select

from app.models import AuditLog, RiskFinding


@pytest.fixture
def stage4_env(client, make_org, make_user, login):
    org = make_org("Metal İşleme A.Ş.")
    make_user("admin@metal.com", org, role="admin")
    make_user("viewer@metal.com", org, role="viewer")
    h_admin = login("admin@metal.com")
    h_viewer = login("viewer@metal.com")
    site = client.post("/api/v1/sites", json={"name": "Kocaeli Fabrika"}, headers=h_admin).json()
    zone1 = client.post(
        "/api/v1/zones",
        json={"site_id": site["id"], "name": "Pres Hattı", "criticality": "critical"},
        headers=h_admin,
    ).json()
    zone2 = client.post(
        "/api/v1/zones",
        json={"site_id": site["id"], "name": "Ofis / Mühendislik", "criticality": "medium"},
        headers=h_admin,
    ).json()
    sensor = client.post(
        "/api/v1/sensors/enroll",
        json={"site_id": site["id"], "name": "sensor-pres"},
        headers=h_admin,
    ).json()
    return {
        "org": org,
        "h_admin": h_admin,
        "h_viewer": h_viewer,
        "site": site,
        "zone1": zone1,
        "zone2": zone2,
        "sensor": sensor,
        "h_sensor": {"X-Sensor-Token": sensor["sensor_token"]},
    }


def test_five_rules_scoring_dedup_and_audit(client, stage4_env, db):
    sh = stage4_env["h_sensor"]
    h = stage4_env["h_admin"]

    # 1. Gözlem gönder -> 192.168.50.10 (Modbus gözlenen PLC adayı) ve 192.168.50.99 (bilinmeyen istemci)
    obs_payload = {
        "observations": [
            {
                "observed_at": "2026-11-11T08:00:00Z",
                "device": {"ip": "192.168.50.10", "mac": "00:11:22:33:50:10"},
                "evidence": {"source_logs": ["conn.log", "modbus.log"], "observed_protocols": ["modbus"]},
            },
            {
                "observed_at": "2026-11-11T08:00:00Z",
                "device": {"ip": "192.168.50.99", "mac": "00:11:22:33:50:99"},
                "evidence": {"source_logs": ["conn.log"], "observed_protocols": []},
            },
        ]
    }
    assert client.post("/api/v1/ingest/observations", json=obs_payload, headers=sh).status_code == 200

    # 2. İletişim gönder ->
    #    a) 192.168.50.99 -> 192.168.50.10:502 (modbus) => UNEXPECTED_COMMUNICATION
    #    b) 198.51.100.25 (public IP) -> 192.168.50.10:22 (SSH) => UNAPPROVED_REMOTE_PATH
    comm_payload = {
        "communications": [
            {
                "source_ip": "192.168.50.99",
                "destination_ip": "192.168.50.10",
                "transport": "tcp",
                "protocol": "modbus",
                "protocol_confidence": "observed",
                "destination_port": 502,
                "connection_count": 5,
                "first_seen_at": "2026-11-11T08:01:00Z",
                "last_seen_at": "2026-11-11T08:05:00Z",
            },
            {
                "source_ip": "198.51.100.25",
                "destination_ip": "192.168.50.10",
                "transport": "tcp",
                "protocol": "ssh",
                "protocol_confidence": "observed",
                "destination_port": 22,
                "connection_count": 1,
                "first_seen_at": "2026-11-11T08:02:00Z",
                "last_seen_at": "2026-11-11T08:03:00Z",
            },
        ]
    }
    assert client.post("/api/v1/ingest/communications", json=comm_payload, headers=sh).status_code == 200

    # Ağ grafiği yalnızca gözlemlenen 3 düğümü ve 2 kenarı içermeli (Bölüm 4.4)
    graph = client.get("/api/v1/communications/graph", headers=h).json()
    assert len(graph["nodes"]) == 3
    assert len(graph["edges"]) == 2

    # 3. Bilinen güvenlik açığı kataloğuna CVE ekle ve 192.168.50.10 cihazına eşleşen vendor/model/firmware gir
    v_res = client.post(
        "/api/v1/vulnerabilities/catalog",
        json={
            "cve_id": "CVE-2024-99999",
            "cpe": "cpe:2.3:o:siemens:simatic_s7_1500_firmware:2.9.2:*:*:*:*:*:*:*",
            "vendor": "Siemens",
            "product": "S7-1500",
            "version_exact": "V2.9.2",
            "cvss": 9.8,
            "description": "Örnek kritik PLC firmware güvenlik açığı.",
        },
        headers=h,
    )
    assert v_res.status_code == 201

    assets = {a["ip_address"]: a for a in client.get("/api/v1/assets", headers=h).json()["items"]}
    plc = assets["192.168.50.10"]

    # Eksik firmware ile KNOWN_VULNERABILITY oluşmamalı (Bölüm 4.5 & 17.5)
    client.patch(
        f"/api/v1/assets/{plc['id']}",
        json={"vendor": "Siemens", "model": "S7-1500"},
        headers=h,
    )
    rules_now = {r["rule_key"] for r in client.get("/api/v1/risks", headers=h).json()["items"]}
    assert "KNOWN_VULNERABILITY" not in rules_now

    # Tam sürüm kanıtı (`V2.9.2`) girildiğinde KNOWN_VULNERABILITY oluşmalı
    client.patch(
        f"/api/v1/assets/{plc['id']}",
        json={"firmware_version": "V2.9.2", "criticality": "critical"},
        headers=h,
    )
    risks = client.get("/api/v1/risks", headers=h).json()["items"]
    rules_after = {r["rule_key"] for r in risks}
    assert {
        "NEW_ASSET",
        "UNKNOWN_OT_ASSET",
        "UNEXPECTED_COMMUNICATION",
        "UNAPPROVED_REMOTE_PATH",
        "KNOWN_VULNERABILITY",
    } <= rules_after

    # Puanlama modeli kırılımı ve kanıt yapısı kontrolü
    vuln_finding = next(r for r in risks if r["rule_key"] == "KNOWN_VULNERABILITY")
    assert 0 < vuln_finding["score"] <= 100
    assert "score_breakdown" in vuln_finding["evidence"]
    assert "what_observed" in vuln_finding["evidence"]
    assert "why_important" in vuln_finding["evidence"]

    # Test standardı #5: Aynı değerlendirme veya veri tekrar çalıştırıldığında mükerrer risk kaydı oluşmamalı
    count_before = len(db.scalars(select(RiskFinding)).all())
    eval_res = client.post("/api/v1/risks/evaluate", headers=h)
    assert eval_res.status_code == 200 and eval_res.json()["created"] == 0
    count_after = len(db.scalars(select(RiskFinding)).all())
    assert count_before == count_after

    # Test standardı #9: Risk durumu güncelleme, False Positive koruma ve audit log kaydı
    # Viewer güncelleyemez (403)
    assert (
        client.patch(
            f"/api/v1/risks/{vuln_finding['id']}",
            json={"status": "investigating"},
            headers=stage4_env["h_viewer"],
        ).status_code
        == 403
    )

    patch_r = client.patch(
        f"/api/v1/risks/{vuln_finding['id']}",
        json={"status": "false_positive"},
        headers=h,
    )
    assert patch_r.status_code == 200
    assert patch_r.json()["status"] == "false_positive"
    assert patch_r.json()["resolved_at"] is not None

    # Yeniden değerlendirme çalışsa bile false_positive durumu korunmalı (tekrar open olmamalı)
    client.post("/api/v1/risks/evaluate", headers=h)
    refreshed = client.get(f"/api/v1/risks/{vuln_finding['id']}", headers=h).json()
    assert refreshed["status"] == "false_positive"

    audit = db.scalar(select(AuditLog).where(AuditLog.action == "risk.status_change"))
    assert audit is not None
    assert audit.meta["old_status"] == "open" and audit.meta["new_status"] == "false_positive"


def test_verifying_asset_auto_resolves_new_and_unknown_ot_risks(client, stage4_env):
    sh = stage4_env["h_sensor"]
    h = stage4_env["h_admin"]
    client.post(
        "/api/v1/ingest/observations",
        json={
            "observations": [
                {
                    "observed_at": "2026-11-11T09:00:00Z",
                    "device": {"ip": "10.50.0.10", "mac": "00:aa:bb:cc:50:10"},
                    "evidence": {"source_logs": ["conn.log"], "observed_protocols": ["modbus"]},
                }
            ]
        },
        headers=sh,
    )
    asset = client.get("/api/v1/assets", headers=h).json()["items"][0]
    open_rules = {
        r["rule_key"]
        for r in client.get(f"/api/v1/risks?asset_id={asset['id']}&status=open", headers=h).json()["items"]
    }
    assert {"NEW_ASSET", "UNKNOWN_OT_ASSET"} <= open_rules

    # Kullanıcı cihazı doğrulayıp tür ve üretici girdiğinde bu iki bulgu otomatik olarak 'resolved' olmalı
    client.patch(
        f"/api/v1/assets/{asset['id']}",
        json={"asset_type": "plc", "vendor": "Schneider Electric", "is_verified": True},
        headers=h,
    )
    open_after = client.get(f"/api/v1/risks?asset_id={asset['id']}&status=open", headers=h).json()["items"]
    assert open_after == []
