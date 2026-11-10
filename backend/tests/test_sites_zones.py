"""Aşama 1 başarı kriteri: giriş -> fabrika kaydı -> veritabanı okuma/yazma."""
import pytest


@pytest.fixture
def owner(make_org, make_user, login):
    org = make_org("Demo Plastik A.Ş.")
    make_user("owner@x.com", org)
    return org, login("owner@x.com")


def test_stage1_success_flow(client, owner):
    org, h = owner
    me = client.get("/api/v1/auth/me", headers=h).json()
    assert me["organizations"][0]["id"] == str(org.id)
    r = client.post("/api/v1/sites", json={"name": "Gebze Tesisi", "industry": "Plastik"}, headers=h)
    assert r.status_code == 201
    site = r.json()
    assert site["timezone"] == "Europe/Istanbul" and site["organization_id"] == str(org.id)
    z = client.post("/api/v1/zones", json={"site_id": site["id"], "name": "Enjeksiyon Hattı 1",
                                           "criticality": "high"}, headers=h)
    assert z.status_code == 201
    assert [s["name"] for s in client.get("/api/v1/sites", headers=h).json()] == ["Gebze Tesisi"]
    zones = client.get(f"/api/v1/zones?site_id={site['id']}", headers=h).json()
    assert zones[0]["criticality"] == "high"


def test_site_validation(client, owner):
    _, h = owner
    assert client.post("/api/v1/sites", json={"name": "  "}, headers=h).status_code == 422
    assert client.post("/api/v1/sites", json={"name": "X", "timezone": "Mars/Base"}, headers=h).status_code == 422
    assert client.post("/api/v1/sites", json={"name": "x" * 201}, headers=h).status_code == 422


def test_duplicate_site_name_conflict(client, owner):
    _, h = owner
    assert client.post("/api/v1/sites", json={"name": "Tesis"}, headers=h).status_code == 201
    assert client.post("/api/v1/sites", json={"name": "Tesis"}, headers=h).status_code == 409


def test_zone_validation_and_duplicates(client, owner):
    _, h = owner
    s = client.post("/api/v1/sites", json={"name": "Tesis"}, headers=h).json()
    bad = client.post("/api/v1/zones", json={"site_id": s["id"], "name": "Hat", "criticality": "extreme"}, headers=h)
    assert bad.status_code == 422
    assert client.post("/api/v1/zones", json={"site_id": s["id"], "name": "Hat"}, headers=h).status_code == 201
    assert client.post("/api/v1/zones", json={"site_id": s["id"], "name": "Hat"}, headers=h).status_code == 409
    missing = client.post("/api/v1/zones", json={"site_id": "00000000-0000-0000-0000-000000000000", "name": "X"},
                          headers=h)
    assert missing.status_code == 404


def test_site_with_zones_cannot_be_deleted(client, owner):
    _, h = owner
    s = client.post("/api/v1/sites", json={"name": "Tesis"}, headers=h).json()
    z = client.post("/api/v1/zones", json={"site_id": s["id"], "name": "Hat"}, headers=h).json()
    assert client.delete(f"/api/v1/sites/{s['id']}", headers=h).status_code == 409
    assert client.delete(f"/api/v1/zones/{z['id']}", headers=h).status_code == 204
    assert client.delete(f"/api/v1/sites/{s['id']}", headers=h).status_code == 204
    assert client.get(f"/api/v1/sites/{s['id']}", headers=h).status_code == 404


def test_update_site_and_zone(client, owner):
    _, h = owner
    s = client.post("/api/v1/sites", json={"name": "Tesis"}, headers=h).json()
    r = client.patch(f"/api/v1/sites/{s['id']}", json={"name": "Yeni Ad", "timezone": "UTC"}, headers=h)
    assert r.status_code == 200 and r.json()["name"] == "Yeni Ad" and r.json()["timezone"] == "UTC"
    z = client.post("/api/v1/zones", json={"site_id": s["id"], "name": "Hat"}, headers=h).json()
    r = client.patch(f"/api/v1/zones/{z['id']}", json={"criticality": "critical", "description": "PLC hattı"},
                     headers=h)
    assert r.json()["criticality"] == "critical" and r.json()["description"] == "PLC hattı"


def test_organizations_endpoints(client, owner):
    org, h = owner
    lst = client.get("/api/v1/organizations", headers=h).json()
    assert lst[0]["role"] == "owner"
    r = client.patch(f"/api/v1/organizations/{org.id}", json={"name": "Yeni Unvan"}, headers=h)
    assert r.status_code == 200 and r.json()["name"] == "Yeni Unvan"
    members = client.get(f"/api/v1/organizations/{org.id}/members", headers=h).json()
    assert members[0]["email"] == "owner@x.com"
    new = client.post("/api/v1/organizations", json={"name": "İkinci Org"}, headers=h)
    assert new.status_code == 201 and new.json()["role"] == "owner"


def test_health(client):
    r = client.get("/api/v1/health")
    assert r.status_code == 200 and r.json()["database"] == "ok"


def test_cli_create_owner(db):
    from app.cli import create_owner

    user, org = create_owner("Kurucu@Fabrika.com", "Kurucu", "Fabrika", "uzun-guvenli-parola")
    assert user.email == "kurucu@fabrika.com"
    with pytest.raises(ValueError):
        create_owner("kurucu@fabrika.com", "x", "y", "uzun-guvenli-parola")
    with pytest.raises(ValueError):
        create_owner("baska@fabrika.com", "x", "y", "kisa")
