"""Aşama 6 Sertleştirme, Güvenlik, Performans ve Uçtan Uca (E2E) Pilot Doğrulama Testleri.

Kapsam:
1. Gerçek Zeek 9.0.1 PCAP çıktısı -> `sensor.cli.run` -> `SensorExporter` -> PostgreSQL Ingestion ->
   Envanter -> Topoloji Grafiği -> Risk Motoru -> CSV/PDF Rapor Uçtan Uca (E2E) doğrulaması.
2. Tüm modüller genelinde RBAC (unauthenticated 401, viewer 403) matrisi.
3. Bozuk girdi, sınır değerler ve SQL enjeksiyonu benzeri dizgelerin güvenli reddi / kaçırılması.
4. Toplu gözlem ve iletişim yükü altında (< 5 sn) performans ve tekilleştirme doğrulaması.
"""
from __future__ import annotations

import time
import uuid
from pathlib import Path
from typing import Any

from sensor.cli import run as run_sensor_normalizer
from sensor.exporter.http_exporter import SensorExporter


def test_e2e_real_pcap_to_normalizer_to_ingestion_to_risks_to_reports(
    client, make_org, make_user, login
):
    """Gerçek Zeek 9.0.1 Modbus PCAP çıktısından PDF/CSV rapora kadar uçtan uca akış."""
    org = make_org("E2E Pilot Fabrika A.Ş.")
    make_user("admin@e2epilot.com", org, role="admin")
    h_admin = login("admin@e2epilot.com")

    site = client.post("/api/v1/sites", json={"name": "E2E Üretim Tesisi"}, headers=h_admin).json()
    sensor = client.post(
        "/api/v1/sensors/enroll",
        json={"site_id": site["id"], "name": "zeek-e2e-sensor"},
        headers=h_admin,
    ).json()

    real_zeek_dir = (
        Path(__file__).resolve().parents[2]
        / "sample-data"
        / "zeek"
        / "real-modbus-testdata-part1"
    )
    assert real_zeek_dir.is_dir(), f"Gerçek Zeek örnek dizini bulunamadı: {real_zeek_dir}"

    bundle = run_sensor_normalizer(real_zeek_dir, "zeek-e2e-sensor")
    assert len(bundle["observations"]) == 4
    assert len(bundle["communications"]) >= 2

    def _testclient_transport(
        url: str,
        payload: dict[str, Any] | None,
        headers: dict[str, str],
        timeout: float,
    ) -> dict[str, Any]:
        path = url.replace("http://testserver", "")
        res = client.post(path, json=payload, headers=headers)
        assert res.status_code == 200, res.text
        return res.json()

    exporter = SensorExporter(
        api_base_url="http://testserver",
        sensor_token=sensor["sensor_token"],
        transport=_testclient_transport,
    )
    export_res = exporter.export_normalized_bundle(bundle)
    assert export_res["observations"]["assets_created"] == 4
    assert export_res["communications"]["communications_created"] >= 2

    # Envanterde gerçek PCAP cihazlarını doğrula
    assets = client.get("/api/v1/assets", headers=h_admin).json()["items"]
    ips = {a["ip_address"] for a in assets}
    assert ips == {"10.0.0.3", "10.0.0.8", "10.0.0.9", "10.0.0.57"}

    # Topoloji grafiğini doğrula
    graph = client.get("/api/v1/communications/graph", headers=h_admin).json()
    assert len(graph["nodes"]) == 4
    assert len(graph["edges"]) >= 2

    # Açıklanabilir risk bulgularını doğrula
    risks = client.get("/api/v1/risks", headers=h_admin).json()["items"]
    rule_keys = {r["rule_key"] for r in risks}
    assert "NEW_ASSET" in rule_keys
    assert "UNKNOWN_OT_ASSET" in rule_keys
    assert "UNEXPECTED_COMMUNICATION" in rule_keys

    # Rapor çıktılarının (CSV + PDF) gerçek veriyi içerdiğini doğrula
    inv_pdf = client.get("/api/v1/reports/inventory?format=pdf", headers=h_admin)
    assert inv_pdf.status_code == 200
    assert inv_pdf.content.startswith(b"%PDF-1.4")
    assert b"10.0.0.9" in inv_pdf.content

    risk_pdf = client.get("/api/v1/reports/risks?format=pdf", headers=h_admin)
    assert risk_pdf.status_code == 200
    assert risk_pdf.content.startswith(b"%PDF-1.4")
    assert b"UNKNOWN_OT_ASSET" in risk_pdf.content


def test_rbac_matrix_across_all_modules(client, make_org, make_user, login):
    """Kimliksiz (401) ve düşük yetkili (viewer -> 403) erişim matrisi."""
    org = make_org("RBAC Fabrika A.Ş.")
    make_user("admin@rbac.com", org, role="admin")
    make_user("viewer@rbac.com", org, role="viewer")
    h_admin = login("admin@rbac.com")
    h_viewer = login("viewer@rbac.com")

    site = client.post("/api/v1/sites", json={"name": "RBAC Saha"}, headers=h_admin).json()

    # 1. Kimliksiz istekler 401 dönmeli
    protected_gets = [
        "/api/v1/assets",
        "/api/v1/communications",
        "/api/v1/communications/graph",
        "/api/v1/risks",
        "/api/v1/reports/summary",
        "/api/v1/reports/inventory",
        "/api/v1/reports/risks",
        "/api/v1/sensors",
        "/api/v1/vulnerabilities/catalog",
        "/api/v1/audit-logs",
    ]
    for path in protected_gets:
        res = client.get(path)
        assert res.status_code == 401, f"{path} 401 dönmeliydi, {res.status_code} döndü"

    # 2. Viewer rolü okuma yapabilmeli ancak hiçbir yazma/yönetim işlemi yapamamalı
    assert client.get("/api/v1/assets", headers=h_viewer).status_code == 200
    assert client.get("/api/v1/risks", headers=h_viewer).status_code == 200
    assert client.get("/api/v1/reports/summary", headers=h_viewer).status_code == 200

    fake_id = str(uuid.uuid4())
    assert (
        client.post(
            "/api/v1/sensors/enroll",
            json={"site_id": site["id"], "name": "yetkisiz-sensor"},
            headers=h_viewer,
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/v1/assets/import",
            json={"site_id": site["id"], "csv_content": "ip,name\n10.0.0.1,Test"},
            headers=h_viewer,
        ).status_code
        == 403
    )
    assert (
        client.patch(
            f"/api/v1/assets/{fake_id}",
            json={"name": "Yetkisiz"},
            headers=h_viewer,
        ).status_code
        == 403
    )
    assert (
        client.patch(
            f"/api/v1/risks/{fake_id}",
            json={"status": "resolved"},
            headers=h_viewer,
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/v1/vulnerabilities/catalog",
            json={
                "cve_id": "CVE-2099-0001",
                "vendor": "Siemens",
                "product": "S7",
                "affected_version": "1.0",
                "severity": "high",
                "title": "Test",
                "description": "Test",
                "remediation": "Test",
            },
            headers=h_viewer,
        ).status_code
        == 403
    )
    assert client.get("/api/v1/audit-logs", headers=h_viewer).status_code == 403


def test_malformed_inputs_and_injection_strings_handled_safely(client, make_org, make_user, login):
    """SQL enjeksiyonu benzeri filtreler ve bozuk yükler 500 üretmeden güvenle ele alınmalı."""
    org = make_org("Girdi Güvenliği A.Ş.")
    make_user("admin@girdi.com", org, role="admin")
    h_admin = login("admin@girdi.com")
    site = client.post("/api/v1/sites", json={"name": "Merkez"}, headers=h_admin).json()
    sensor = client.post(
        "/api/v1/sensors/enroll",
        json={"site_id": site["id"], "name": "sensor-1"},
        headers=h_admin,
    ).json()
    h_sensor = {"X-Sensor-Token": sensor["sensor_token"]}

    # SQLi benzeri metin aramaları 200 ve boş liste dönmeli, tabloyu bozmamalı
    sqli_queries = [
        "' OR 1=1 --",
        "'; DROP TABLE assets; --",
        "%_\\'",
    ]
    for q in sqli_queries:
        res = client.get("/api/v1/assets", params={"ip": q, "vendor": q}, headers=h_admin)
        assert res.status_code == 200
        assert res.json()["total"] == 0

    # Geçersiz port ve boş gözlem listesi 422 dönmeli
    bad_comm = client.post(
        "/api/v1/ingest/communications",
        json={
            "communications": [
                {
                    "source_ip": "10.0.0.1",
                    "destination_ip": "10.0.0.2",
                    "destination_port": 99999,
                    "last_seen_at": "2026-11-11T10:00:00Z",
                }
            ]
        },
        headers=h_sensor,
    )
    assert bad_comm.status_code == 422

    empty_obs = client.post(
        "/api/v1/ingest/observations",
        json={"observations": []},
        headers=h_sensor,
    )
    assert empty_obs.status_code == 422


def test_bulk_ingestion_and_risk_evaluation_performance(client, make_org, make_user, login):
    """80 endüstriyel cihaz ve 120 akışın toplu işlenmesi + risk değerlendirmesi < 5 saniye sürmeli."""
    org = make_org("Performans Test A.Ş.")
    make_user("admin@perf.com", org, role="admin")
    h_admin = login("admin@perf.com")
    site = client.post("/api/v1/sites", json={"name": "Büyük Tesis"}, headers=h_admin).json()
    sensor = client.post(
        "/api/v1/sensors/enroll",
        json={"site_id": site["id"], "name": "sensor-perf"},
        headers=h_admin,
    ).json()
    h_sensor = {"X-Sensor-Token": sensor["sensor_token"]}

    observations = [
        {
            "observed_at": "2026-11-11T10:00:00Z",
            "device": {
                "ip": f"10.50.1.{i}",
                "mac": f"00:22:44:66:88:{i:02x}",
                "hostname": f"plc-node-{i}",
            },
            "evidence": {
                "source_logs": ["conn.log", "modbus.log"],
                "observed_protocols": ["modbus"] if i % 2 == 0 else [],
            },
        }
        for i in range(1, 81)
    ]

    communications = [
        {
            "source_ip": f"10.50.1.{(i % 80) + 1}",
            "destination_ip": f"10.50.1.{((i + 1) % 80) + 1}",
            "transport": "tcp",
            "destination_port": 502 if i % 3 == 0 else 443,
            "protocol": "modbus" if i % 3 == 0 else "https",
            "protocol_confidence": "observed",
            "connection_count": 5,
            "first_seen_at": "2026-11-11T10:00:00Z",
            "last_seen_at": "2026-11-11T10:05:00Z",
        }
        for i in range(120)
    ]

    t0 = time.perf_counter()
    r1 = client.post(
        "/api/v1/ingest/observations",
        json={"observations": observations},
        headers=h_sensor,
    )
    assert r1.status_code == 200
    assert r1.json()["assets_created"] == 80

    r2 = client.post(
        "/api/v1/ingest/communications",
        json={"communications": communications},
        headers=h_sensor,
    )
    assert r2.status_code == 200
    stats = r2.json()
    assert stats["received"] == 120
    assert (
        stats["communications_created"]
        + stats["communications_updated"]
        + stats["duplicates_skipped"]
        == 120
    )
    elapsed = time.perf_counter() - t0

    assert elapsed < 5.0, f"Toplu işleme çok yavaş: {elapsed:.2f}s"


def test_web_pcap_and_sample_upload_analyze_endpoint(client, make_org, make_user, login):
    """Web arayüzünden tek tıkla PCAP / örnek paket analizi (`POST /api/v1/sensors/{id}/analyze-upload`)."""
    import base64

    org = make_org("Web PCAP Yükleme A.Ş.")
    make_user("admin@webpcap.com", org, role="admin")
    h_admin = login("admin@webpcap.com")
    site = client.post("/api/v1/sites", json={"name": "İzmir Fabrika"}, headers=h_admin).json()
    sensor = client.post(
        "/api/v1/sensors/enroll",
        json={"site_id": site["id"], "name": "sensor-web-upload"},
        headers=h_admin,
    ).json()

    # 1. Hazır gerçek Modbus PCAP senaryosu
    r_sample = client.post(
        f"/api/v1/sensors/{sensor['id']}/analyze-upload",
        json={"sample": "real-modbus-pcap"},
        headers=h_admin,
    )
    assert r_sample.status_code == 200, r_sample.text
    s_data = r_sample.json()
    assert s_data["devices_discovered"] == 4
    assert s_data["assets_created"] == 4
    assert s_data["open_risks_total"] >= 3

    # 2. Gerçek ikili (binary) .pcap dosyası yükleme (MODBUS-TestDataPart1.pcap ilk 64 KB)
    pcap_path = (
        Path(__file__).resolve().parents[2]
        / "sample-data"
        / "pcap"
        / "MODBUS-TestDataPart1.pcap"
    )
    if pcap_path.is_file():
        raw_chunk = pcap_path.read_bytes()[:65536]
        r_bin = client.post(
            f"/api/v1/sensors/{sensor['id']}/analyze-upload",
            json={
                "filename": "MODBUS-TestDataPart1.pcap",
                "content_base64": base64.b64encode(raw_chunk).decode("ascii"),
            },
            headers=h_admin,
        )
        assert r_bin.status_code == 200, r_bin.text
        assert r_bin.json()["devices_discovered"] >= 2


def test_phase2_mac_oui_hint_and_modbus_write_risk(client, make_org, make_user, login):
    """Faz 2: Pasif MAC OUI donanım üreticisi ipucu ve tehlikeli Modbus WRITE komutu risk bulgusu."""
    org = make_org("Faz 2 Endüstriyel A.Ş.")
    make_user("admin@faz2.com", org, role="admin")
    h_admin = login("admin@faz2.com")
    site = client.post("/api/v1/sites", json={"name": "Manisa Fabrika"}, headers=h_admin).json()
    sensor = client.post(
        "/api/v1/sensors/enroll",
        json={"site_id": site["id"], "name": "sensor-faz2"},
        headers=h_admin,
    ).json()
    h_sensor = {"X-Sensor-Token": sensor["sensor_token"]}

    # Siemens OUI (00:1b:1b) ve WRITE_MULTIPLE_REGISTERS gözlemi
    res = client.post(
        "/api/v1/ingest/observations",
        json={
            "observations": [
                {
                    "observed_at": "2026-11-13T20:00:00Z",
                    "device": {"ip": "10.90.1.15", "mac": "00:1b:1b:99:88:77"},
                    "evidence": {
                        "source_logs": ["conn.log", "modbus.log"],
                        "observed_protocols": ["s7comm", "modbus"],
                        "modbus_functions": ["READ_COILS", "WRITE_MULTIPLE_REGISTERS"],
                    },
                }
            ]
        },
        headers=h_sensor,
    )
    assert res.status_code == 200

    assets = client.get("/api/v1/assets", headers=h_admin).json()["items"]
    assert len(assets) == 1
    detail = client.get(f"/api/v1/assets/{assets[0]['id']}", headers=h_admin).json()
    assert any("Siemens AG" in r for r in detail["classification_reasons"])
    assert any("WRITE_MULTIPLE_REGISTERS" in f["title"] for f in detail["risk_findings"])


def test_phase3_baseline_approval_and_siem_cef_export(client, make_org, make_user, login):
    """Faz 3: İletişim baseline (whitelist) onaylama ve kurumsal SIEM CEF dışa aktarma."""
    org = make_org("Faz 3 SIEM ve Baseline A.Ş.")
    make_user("admin@faz3.com", org, role="admin")
    h_admin = login("admin@faz3.com")
    site = client.post("/api/v1/sites", json={"name": "Sakarya Fabrika"}, headers=h_admin).json()
    sensor = client.post(
        "/api/v1/sensors/enroll",
        json={"site_id": site["id"], "name": "sensor-faz3"},
        headers=h_admin,
    ).json()

    # Gerçek Modbus PCAP analiz et
    r_up = client.post(
        f"/api/v1/sensors/{sensor['id']}/analyze-upload",
        json={"sample": "real-modbus-pcap"},
        headers=h_admin,
    )
    assert r_up.status_code == 200

    # Baseline onaylamadan önce akışları kontrol et
    graph_before = client.get("/api/v1/communications/graph", headers=h_admin).json()
    assert len(graph_before["edges"]) >= 2
    assert any(not e["is_baseline_approved"] for e in graph_before["edges"])

    # Tüm mevcut akışları baseline olarak onayla
    r_base = client.post("/api/v1/communications/approve-all-baseline", headers=h_admin)
    assert r_base.status_code == 200
    assert r_base.json()["approved_flows"] == len(graph_before["edges"])

    graph_after = client.get("/api/v1/communications/graph", headers=h_admin).json()
    assert all(e["is_baseline_approved"] for e in graph_after["edges"])

    # SIEM CEF dışa aktarma kontrolü
    r_cef = client.get("/api/v1/reports/siem-cef", headers=h_admin)
    assert r_cef.status_code == 200
    cef_text = r_cef.content.decode("utf-8")
    assert "CEF:0|FactoryGuard|Lite|0.1.0|" in cef_text
    assert "UNKNOWN_OT_ASSET" in cef_text

    # Fabrika güvenlik duruş endeksi ve toplu durum güncelleme kontrolü
    r_posture = client.get("/api/v1/risks/posture", headers=h_admin)
    assert r_posture.status_code == 200
    posture = r_posture.json()
    assert posture["grade"] in ("A", "B", "C", "D", "F")
    assert 0 <= posture["health_score"] <= 100

    r_bulk = client.post(
        "/api/v1/risks/bulk-status",
        headers=h_admin,
        json={"filter_status": "open", "new_status": "investigating"},
    )
    assert r_bulk.status_code == 200
    assert r_bulk.json()["updated_count"] >= 1


def test_audit_fixes_end_to_end_consistency_and_lifecycle(client, make_org, make_user, login):
    """Denetim düzeltmeleri doğrulaması:
    1. Sentetik Zeek örnek analizi (`synthetic-zeek`) 200 döner (404 hatası giderildi).
    2. İkili PCAP içinde Modbus WRITE komutu Normalizer -> Ingestion -> Risk Motoru boyunca uçtan uca tespit edilir.
    3. Yalnızca `port_hint` olan trafik `UNKNOWN_OT_ASSET` tetiklemez.
    4. Cihaz listesi (`GET /assets`) ve detay (`GET /assets/{id}`) aynı `classification_label` ve `observed_protocols` döner.
    5. Baseline onaylama sahte `RiskFinding` üretmez; `AssetCommunication.is_baseline_approved` kolonunu günceller.
    6. `ASSET_NOT_SEEN` (7+ gün görülmeyen cihaz) tetiklenir ve cihaz tekrar görüldüğünde otomatik `resolved` olur.
    7. `GET /api/v1/risks/rules` 6 kuralı ve ağırlık modelini döndürür.
    """
    import base64
    import socket
    import struct

    org = make_org("Denetim Doğrulama A.Ş.")
    make_user("admin@denetim.com", org, role="admin")
    h_admin = login("admin@denetim.com")
    site = client.post("/api/v1/sites", json={"name": "Denetim Fabrikası"}, headers=h_admin).json()
    sensor = client.post(
        "/api/v1/sensors/enroll",
        json={"site_id": site["id"], "name": "sensor-denetim"},
        headers=h_admin,
    ).json()
    h_sensor = {"X-Sensor-Token": sensor["sensor_token"]}

    # 1. Sentetik Zeek örnek paketi analizi (eskiden 404 dönüyordu)
    r_syn = client.post(
        f"/api/v1/sensors/{sensor['id']}/analyze-upload",
        json={"sample": "synthetic-zeek"},
        headers=h_admin,
    )
    assert r_syn.status_code == 200, r_syn.text
    assert r_syn.json()["devices_discovered"] == 7

    # 192.168.10.21 yalnızca port 102 (port_hint) trafiğine sahip -> UNKNOWN_OT_ASSET tetiklenmemeli!
    assets_list = client.get("/api/v1/assets", headers=h_admin).json()["items"]
    by_ip = {a["ip_address"]: a for a in assets_list}
    s7_hint_only = by_ip["192.168.10.21"]
    s7_detail = client.get(f"/api/v1/assets/{s7_hint_only['id']}", headers=h_admin).json()
    assert s7_hint_only["classification_label"] == s7_detail["classification_label"]
    assert not any(f["rule_key"] == "UNKNOWN_OT_ASSET" for f in s7_detail["risk_findings"])

    # 192.168.10.20 gerçek Modbus trafiğine sahip -> liste ve detay etiketi birebir aynı olmalı
    modbus_plc = by_ip["192.168.10.20"]
    plc_detail = client.get(f"/api/v1/assets/{modbus_plc['id']}", headers=h_admin).json()
    assert modbus_plc["classification_label"] == plc_detail["classification_label"]
    assert "modbus" in modbus_plc["observed_protocols"]
    assert modbus_plc["last_sensor_id"] == sensor["id"]

    # 2. İkili PCAP üzerinden Modbus WRITE (FC 6) -> Risk bulgusu uçtan uca oluşmalı
    eth = bytes.fromhex("001b1b112233" "000e8c445566" "0800")
    mb_write = struct.pack("!HHHB", 1, 0, 6, 1) + bytes([0x06, 0x00, 0x01, 0x00, 0x55])
    ip_hdr = struct.pack(
        "!BBHHHBBH4s4s",
        0x45,
        0,
        40 + len(mb_write),
        1,
        0,
        64,
        6,
        0,
        socket.inet_aton("192.168.10.50"),
        socket.inet_aton("192.168.10.20"),
    )
    tcp_hdr = struct.pack("!HHIIBBHHH", 49152, 502, 1, 1, (5 << 4), 0x18, 8192, 0, 0)
    pkt = eth + ip_hdr + tcp_hdr + mb_write
    pcap_bytes = (
        struct.pack("<IHHiIII", 0xA1B2C3D4, 2, 4, 0, 0, 65535, 1)
        + struct.pack("<IIII", 1793960000, 0, len(pkt), len(pkt))
        + pkt
    )
    r_pcap = client.post(
        f"/api/v1/sensors/{sensor['id']}/analyze-upload",
        json={
            "filename": "modbus_write.pcap",
            "content_base64": base64.b64encode(pcap_bytes).decode("ascii"),
        },
        headers=h_admin,
    )
    assert r_pcap.status_code == 200, r_pcap.text
    plc_after_write = client.get(f"/api/v1/assets/{modbus_plc['id']}", headers=h_admin).json()
    assert any("WRITE_SINGLE_REGISTER" in f["title"] for f in plc_after_write["risk_findings"])

    # 5. Baseline onaylama sahte RiskFinding üretmemeli
    risks_before_count = client.get("/api/v1/risks", headers=h_admin).json()["total"]
    client.post("/api/v1/communications/approve-all-baseline", headers=h_admin)
    risks_after = client.get("/api/v1/risks", headers=h_admin).json()
    assert risks_after["total"] == risks_before_count
    assert not any("Onaylı Baseline Akışı" in r["title"] for r in risks_after["items"])

    # 6. ASSET_NOT_SEEN: 10 gün sonraki bir gözlem gönderildiğinde eski cihazlar için ASSET_NOT_SEEN oluşmalı
    r_future = client.post(
        "/api/v1/ingest/observations",
        json={
            "observations": [
                {
                    "observed_at": "2026-11-20T00:00:00Z",
                    "device": {"ip": "192.168.10.20"},
                    "evidence": {"source_logs": ["conn.log"], "observed_protocols": ["modbus"]},
                }
            ]
        },
        headers=h_sensor,
    )
    assert r_future.status_code == 200
    stale_risks = client.get("/api/v1/risks?rule_key=ASSET_NOT_SEEN&status=open", headers=h_admin).json()["items"]
    assert len(stale_risks) >= 1
    assert stale_risks[0]["evidence"]["rule_id"] == "FG-RULE-006"

    # Cihaz tekrar görüldüğünde ASSET_NOT_SEEN otomatik olarak 'resolved' olmalı
    stale_asset_ip = stale_risks[0]["asset_ip"]
    client.post(
        "/api/v1/ingest/observations",
        json={
            "observations": [
                {
                    "observed_at": "2026-11-20T00:05:00Z",
                    "device": {"ip": stale_asset_ip},
                    "evidence": {"source_logs": ["conn.log"]},
                }
            ]
        },
        headers=h_sensor,
    )
    stale_for_asset = client.get(
        f"/api/v1/risks?asset_id={stale_risks[0]['asset_id']}&rule_key=ASSET_NOT_SEEN&status=open",
        headers=h_admin,
    ).json()["items"]
    assert stale_for_asset == []

    # 7. Kural kataloğu uç noktası
    rules_cat = client.get("/api/v1/risks/rules", headers=h_admin)
    assert rules_cat.status_code == 200
    assert len(rules_cat.json()["rules"]) == 6





