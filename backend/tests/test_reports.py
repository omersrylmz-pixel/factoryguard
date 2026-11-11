"""Aşama 5 testleri: Yönetici özeti (`/api/v1/reports/summary`), CSV ve PDF cihaz envanteri
raporu (`/api/v1/reports/inventory`), CSV ve PDF yönetici/teknik risk raporu (`/api/v1/reports/risks`),
denetim kaydı (`audit_logs`) ve tenant izolasyonu."""
from __future__ import annotations

import csv
import io

import pytest
from sqlalchemy import select

from app.models import AuditLog


@pytest.fixture
def stage5_env(client, make_org, make_user, login):
    org_a = make_org("Anadolu Otomotiv A.Ş.")
    org_b = make_org("Rakip Plastik A.Ş.")
    make_user("admin@anadolu.com", org_a, role="admin")
    make_user("viewer@anadolu.com", org_a, role="viewer")
    make_user("admin@rakip.com", org_b, role="admin")

    h_admin = login("admin@anadolu.com")
    h_viewer = login("viewer@anadolu.com")
    h_other = login("admin@rakip.com")

    site = client.post(
        "/api/v1/sites",
        json={"name": "Bursa Gövde Fabrikası"},
        headers=h_admin,
    ).json()
    zone_ot = client.post(
        "/api/v1/zones",
        json={"site_id": site["id"], "name": "Kaynak Hattı", "criticality": "critical"},
        headers=h_admin,
    ).json()
    zone_it = client.post(
        "/api/v1/zones",
        json={"site_id": site["id"], "name": "Mühendislik Ağı", "criticality": "medium"},
        headers=h_admin,
    ).json()
    sensor = client.post(
        "/api/v1/sensors/enroll",
        json={"site_id": site["id"], "name": "sensor-bursa-1"},
        headers=h_admin,
    ).json()
    h_sensor = {"X-Sensor-Token": sensor["sensor_token"]}

    # Gözlem ve iletişim gönder
    client.post(
        "/api/v1/ingest/observations",
        json={
            "observations": [
                {
                    "observed_at": "2026-11-11T09:00:00Z",
                    "device": {"ip": "10.20.1.10", "mac": "00:1b:1b:aa:bb:01"},
                    "evidence": {
                        "source_logs": ["conn.log", "modbus.log"],
                        "observed_protocols": ["modbus"],
                    },
                },
                {
                    "observed_at": "2026-11-11T09:00:05Z",
                    "device": {"ip": "10.20.2.50", "mac": "00:1b:1b:aa:bb:02"},
                    "evidence": {"source_logs": ["conn.log"], "observed_protocols": []},
                },
            ]
        },
        headers=h_sensor,
    )
    res_comm = client.post(
        "/api/v1/ingest/communications",
        json={
            "communications": [
                {
                    "source_ip": "10.20.2.50",
                    "destination_ip": "10.20.1.10",
                    "transport": "tcp",
                    "destination_port": 3389,
                    "protocol": "rdp",
                    "protocol_confidence": "observed",
                    "connection_count": 3,
                    "first_seen_at": "2026-11-11T09:01:00Z",
                    "last_seen_at": "2026-11-11T09:02:00Z",
                }
            ]
        },
        headers=h_sensor,
    )
    assert res_comm.status_code == 200

    # Cihazları bölgelere ata (biri doğrulanmış PLC, diğeri doğrulanmamış)
    assets = client.get("/api/v1/assets", headers=h_admin).json()["items"]
    plc_asset = next(a for a in assets if a["ip_address"] == "10.20.1.10")
    peer_asset = next(a for a in assets if a["ip_address"] == "10.20.2.50")

    client.patch(
        f"/api/v1/assets/{plc_asset['id']}",
        json={
            "name": "Kaynak-PLC-01",
            "asset_type": "plc",
            "vendor": "Siemens",
            "model": "S7-1500",
            "firmware_version": "2.9.4",
            "criticality": "critical",
            "zone_id": zone_ot["id"],
            "is_verified": True,
        },
        headers=h_admin,
    )
    client.patch(
        f"/api/v1/assets/{peer_asset['id']}",
        json={"zone_id": zone_it["id"]},
        headers=h_admin,
    )

    return {
        "org_a": org_a,
        "org_b": org_b,
        "h_admin": h_admin,
        "h_viewer": h_viewer,
        "h_other": h_other,
        "site": site,
        "zone_ot": zone_ot,
        "zone_it": zone_it,
    }


def test_report_summary_and_exports_csv_pdf(client, stage5_env, db):
    h_viewer = stage5_env["h_viewer"]
    site_id = stage5_env["site"]["id"]

    # 1. Yönetici Özeti JSON (/api/v1/reports/summary)
    res_sum = client.get(f"/api/v1/reports/summary?site_id={site_id}", headers=h_viewer)
    assert res_sum.status_code == 200
    summary = res_sum.json()
    assert summary["organization_name"] == "Anadolu Otomotiv A.Ş."
    assert summary["site_name"] == "Bursa Gövde Fabrikası"
    assert summary["assets"]["total"] == 2
    assert summary["assets"]["verified"] == 1
    assert summary["assets"]["unverified"] == 1
    assert summary["communications"]["total_flows"] == 1
    assert summary["communications"]["cross_zone_flows"] == 1
    assert summary["risks"]["open_total"] >= 2
    assert summary["risks"]["max_score"] > 0

    # 2. Envanter CSV Dışa Aktarma (/api/v1/reports/inventory?format=csv)
    res_inv_csv = client.get("/api/v1/reports/inventory?format=csv", headers=h_viewer)
    assert res_inv_csv.status_code == 200
    assert res_inv_csv.headers["content-type"].startswith("text/csv")
    assert "factoryguard-envanter-" in res_inv_csv.headers["content-disposition"]
    raw_text = res_inv_csv.content.decode("utf-8-sig")
    rows = list(csv.DictReader(io.StringIO(raw_text)))
    assert len(rows) == 2

    plc_row = next(r for r in rows if r["ip_address"] == "10.20.1.10")
    assert plc_row["name"] == "Kaynak-PLC-01"
    assert plc_row["vendor"] == "Siemens"
    assert plc_row["is_verified"] == "true"

    unverified_row = next(r for r in rows if r["ip_address"] == "10.20.2.50")
    assert unverified_row["vendor"] == ""
    assert unverified_row["vendor_status"] == "Üretici bilgisi doğrulanmadı"
    assert unverified_row["is_verified"] == "false"

    # 3. Envanter PDF Dışa Aktarma (/api/v1/reports/inventory?format=pdf)
    res_inv_pdf = client.get("/api/v1/reports/inventory?format=pdf", headers=h_viewer)
    assert res_inv_pdf.status_code == 200
    assert res_inv_pdf.headers["content-type"] == "application/pdf"
    assert res_inv_pdf.content.startswith(b"%PDF-1.4")
    assert res_inv_pdf.content.strip().endswith(b"%%EOF")
    assert b"Kaynak-PLC-01" in res_inv_pdf.content
    assert b"10.20.1.10" in res_inv_pdf.content

    # 4. Risk Raporu CSV & PDF (/api/v1/reports/risks)
    res_risk_csv = client.get("/api/v1/reports/risks?format=csv", headers=h_viewer)
    assert res_risk_csv.status_code == 200
    risk_rows = list(csv.DictReader(io.StringIO(res_risk_csv.content.decode("utf-8-sig"))))
    assert len(risk_rows) >= 2
    rule_keys = {r["rule_key"] for r in risk_rows}
    assert "UNAPPROVED_REMOTE_PATH" in rule_keys
    assert "NEW_ASSET" in rule_keys
    for r in risk_rows:
        assert r["what_observed"] != ""
        assert r["recommendation"] != ""

    res_risk_pdf = client.get("/api/v1/reports/risks?format=pdf", headers=h_viewer)
    assert res_risk_pdf.status_code == 200
    assert res_risk_pdf.headers["content-type"] == "application/pdf"
    assert res_risk_pdf.content.startswith(b"%PDF-1.4")
    assert b"UNAPPROVED_REMOTE_PATH" in res_risk_pdf.content

    # 5. Denetim kaydı doğrulaması
    audit_actions = list(
        db.scalars(
            select(AuditLog.action).where(AuditLog.organization_id == stage5_env["org_a"].id)
        ).all()
    )
    assert "report.export_inventory" in audit_actions
    assert "report.export_risks" in audit_actions


def test_reports_tenant_isolation(client, stage5_env):
    h_other = stage5_env["h_other"]

    # Başka organizasyonun özeti boş olmalı
    sum_other = client.get("/api/v1/reports/summary", headers=h_other).json()
    assert sum_other["assets"]["total"] == 0
    assert sum_other["risks"]["total"] == 0

    # Başka organizasyonun CSV çıktısı yalnızca başlık satırı içermeli
    inv_csv_other = client.get("/api/v1/reports/inventory?format=csv", headers=h_other)
    rows = list(csv.DictReader(io.StringIO(inv_csv_other.content.decode("utf-8-sig"))))
    assert rows == []
