"""Tenant izolasyonu ve rol tabanlı yetkilendirme testleri (Test standardı #6, #7, #9)."""
import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.models import AuditLog, Site, Zone


@pytest.fixture
def two_tenants(make_org, make_user, login, client):
    a, b = make_org("A Fabrika"), make_org("B Fabrika")
    make_user("a@a.com", a)
    make_user("b@b.com", b)
    ha, hb = login("a@a.com"), login("b@b.com")
    site_b = client.post("/api/v1/sites", json={"name": "B Tesis"}, headers=hb).json()
    zone_b = client.post("/api/v1/zones", json={"site_id": site_b["id"], "name": "Hat 1"}, headers=hb).json()
    return {"a": a, "b": b, "ha": ha, "hb": hb, "site_b": site_b, "zone_b": zone_b}


def test_tenant_cannot_list_other_tenant_data(client, two_tenants):
    ha = two_tenants["ha"]
    assert client.get("/api/v1/sites", headers=ha).json() == []
    assert client.get("/api/v1/zones", headers=ha).json() == []
    assert client.get("/api/v1/audit-logs", headers=ha).json()["total"] == 0


def test_tenant_cannot_read_or_modify_other_tenant_objects(client, two_tenants):
    ha, sb, zb = two_tenants["ha"], two_tenants["site_b"]["id"], two_tenants["zone_b"]["id"]
    assert client.get(f"/api/v1/sites/{sb}", headers=ha).status_code == 404
    assert client.patch(f"/api/v1/sites/{sb}", json={"name": "x"}, headers=ha).status_code == 404
    assert client.delete(f"/api/v1/sites/{sb}", headers=ha).status_code == 404
    assert client.get(f"/api/v1/zones/{zb}", headers=ha).status_code == 404
    assert client.patch(f"/api/v1/zones/{zb}", json={"name": "x"}, headers=ha).status_code == 404
    assert client.delete(f"/api/v1/zones/{zb}", headers=ha).status_code == 404


def test_cannot_create_zone_in_other_tenant_site(client, two_tenants):
    r = client.post("/api/v1/zones", json={"site_id": two_tenants["site_b"]["id"], "name": "Sızma"},
                    headers=two_tenants["ha"])
    assert r.status_code == 404


def test_org_header_for_non_member_org_forbidden(client, two_tenants):
    h = {**two_tenants["ha"], "X-Organization-ID": str(two_tenants["b"].id)}
    assert client.get("/api/v1/sites", headers=h).status_code == 403
    assert client.get(f"/api/v1/organizations/{two_tenants['b'].id}", headers=two_tenants["ha"]).status_code == 404
    assert client.patch(f"/api/v1/organizations/{two_tenants['b'].id}", json={"name": "x"},
                        headers=two_tenants["ha"]).status_code == 404


def test_db_level_composite_fk_blocks_cross_tenant_zone(db, two_tenants):
    """Uygulama katmanı atlansa bile veritabanı, başka tenant'ın fabrikasına bölge bağlanmasını reddeder."""
    db.add(Zone(organization_id=two_tenants["a"].id, site_id=uuid.UUID(two_tenants["site_b"]["id"]), name="x"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_multi_org_user_requires_header(client, make_org, make_user, login, db):
    a, b = make_org("A"), make_org("B")
    u = make_user("cok@x.com", a)
    from app.models import Membership

    db.add(Membership(organization_id=b.id, user_id=u.id, role="viewer"))
    db.commit()
    h = login("cok@x.com")
    assert client.get("/api/v1/sites", headers=h).status_code == 400
    assert client.get("/api/v1/sites", headers={**h, "X-Organization-ID": str(b.id)}).status_code == 200
    # B'de viewer -> yazamaz
    r = client.post("/api/v1/sites", json={"name": "S"}, headers={**h, "X-Organization-ID": str(b.id)})
    assert r.status_code == 403


def test_user_without_membership_forbidden(client, make_user, login):
    make_user("yalniz@x.com")
    assert client.get("/api/v1/sites", headers=login("yalniz@x.com")).status_code == 403


@pytest.mark.parametrize("role,can_write", [("owner", True), ("admin", True), ("analyst", False), ("viewer", False)])
def test_role_permissions_on_sites(client, make_org, make_user, login, role, can_write):
    org = make_org("Org")
    make_user(f"{role}@x.com", org, role=role)
    h = login(f"{role}@x.com")
    r = client.post("/api/v1/sites", json={"name": "Tesis"}, headers=h)
    assert (r.status_code == 201) is can_write
    if not can_write:
        assert r.status_code == 403
    assert client.get("/api/v1/sites", headers=h).status_code == 200  # herkes okuyabilir
    assert (client.get("/api/v1/audit-logs", headers=h).status_code == 200) is can_write


def test_write_operations_are_audited(client, make_org, make_user, login, db):
    org = make_org("Org")
    make_user("o@x.com", org)
    h = login("o@x.com")
    s = client.post("/api/v1/sites", json={"name": "Tesis"}, headers=h).json()
    client.patch(f"/api/v1/sites/{s['id']}", json={"industry": "Plastik"}, headers=h)
    z = client.post("/api/v1/zones", json={"site_id": s["id"], "name": "Hat"}, headers=h).json()
    client.delete(f"/api/v1/zones/{z['id']}", headers=h)
    actions = [a.action for a in db.scalars(select(AuditLog).where(AuditLog.organization_id == org.id))]
    assert {"site.create", "site.update", "zone.create", "zone.delete"} <= set(actions)
    upd = db.scalar(select(AuditLog).where(AuditLog.action == "site.update"))
    assert upd.meta["changes"]["industry"] == {"old": None, "new": "Plastik"}
    assert db.scalar(select(Site)).industry == "Plastik"
