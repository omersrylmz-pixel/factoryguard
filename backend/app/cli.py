"""Yönetim komutları.

İlk kurulum (açık kayıt endpoint'i yoktur, ilk kullanıcı bu komutla oluşturulur):
  python -m app.cli create-owner --email admin@fabrika.com --full-name "Ad Soyad" --org-name "Fabrika A.Ş."
Parola sorulur; otomasyon için FG_INITIAL_PASSWORD ortam değişkeni kullanılabilir.

Canlı demo / pilot doğrulama verisi yüklemek için:
  python -m app.cli seed-demo
"""
from __future__ import annotations

import argparse
import getpass
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

from email_validator import EmailNotValidError, validate_email
from sqlalchemy import select

from app.core.db import get_sessionmaker
from app.core.security import MIN_PASSWORD_LENGTH, hash_password, hash_token, new_sensor_credential
from app.models import (
    Asset,
    Membership,
    Organization,
    Sensor,
    Site,
    User,
    VulnerabilityCatalog,
    Zone,
)
from app.modules.audit.service import record
from app.modules.ingestion.schemas import (
    CommunicationIn,
    CommunicationsIngestRequest,
    DeviceInfo,
    ObservationIn,
    ObservationsIngestRequest,
)
from app.modules.ingestion.service import ingest_communications, ingest_observations
from app.modules.risk_engine.service import evaluate_organization_risks


def create_owner(email: str, full_name: str, org_name: str, password: str) -> tuple[User, Organization]:
    email = validate_email(email, check_deliverability=False).normalized.lower()
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Parola en az {MIN_PASSWORD_LENGTH} karakter olmalı")
    with get_sessionmaker()() as db:
        if db.scalar(select(User).where(User.email == email)):
            raise ValueError(f"{email} zaten kayıtlı")
        user = User(email=email, full_name=full_name.strip(), password_hash=hash_password(password))
        org = Organization(name=org_name.strip())
        db.add_all([user, org])
        db.flush()
        db.add(Membership(organization_id=org.id, user_id=user.id, role="owner"))
        record(db, "cli.create_owner", user_id=user.id, organization_id=org.id, target_type="user", target_id=user.id)
        db.commit()
        return user, org


def seed_demo(
    email: str = "admin@factoryguard.com",
    password: str = "FactoryGuard2026!",
    org_name: str = "TürkOtomotiv Sanayi A.Ş.",
) -> dict[str, str]:
    """Gerçek PCAP gözlemleri ve örnek OT topolojisiyle idempotent demo ortamı hazırlar."""
    email_norm = validate_email(email, check_deliverability=False).normalized.lower()
    with get_sessionmaker()() as db:
        user = db.scalar(select(User).where(User.email == email_norm))
        if user is None:
            user = User(
                email=email_norm,
                full_name="Ömer Sarıyılmaz (OT Güvenlik Yöneticisi)",
                password_hash=hash_password(password),
            )
            org = Organization(name=org_name)
            db.add_all([user, org])
            db.flush()
            db.add(Membership(organization_id=org.id, user_id=user.id, role="owner"))
            record(
                db,
                "cli.seed_demo",
                user_id=user.id,
                organization_id=org.id,
                target_type="organization",
                target_id=org.id,
            )
        else:
            membership = db.scalar(select(Membership).where(Membership.user_id == user.id))
            org = db.get(Organization, membership.organization_id) if membership else None
            if org is None:
                org = Organization(name=org_name)
                db.add(org)
                db.flush()
                db.add(Membership(organization_id=org.id, user_id=user.id, role="owner"))

        site = db.scalar(select(Site).where(Site.organization_id == org.id, Site.name == "Gebze Ana Üretim Tesisi"))
        if site is None:
            site = Site(
                organization_id=org.id,
                name="Gebze Ana Üretim Tesisi",
                industry="Otomotiv & Metal İşleme",
                timezone="Europe/Istanbul",
            )
            db.add(site)
            db.flush()

        zone_ot = db.scalar(
            select(Zone).where(Zone.site_id == site.id, Zone.name == "Pres ve Kaynak Hattı (Hücre 1)")
        )
        if zone_ot is None:
            zone_ot = Zone(
                organization_id=org.id,
                site_id=site.id,
                name="Pres ve Kaynak Hattı (Hücre 1)",
                description="Modbus/TCP ve S7comm konuşan PLC ve saha kontrolörleri",
                criticality="critical",
            )
            db.add(zone_ot)

        zone_scada = db.scalar(
            select(Zone).where(Zone.site_id == site.id, Zone.name == "SCADA ve Operatör Odası")
        )
        if zone_scada is None:
            zone_scada = Zone(
                organization_id=org.id,
                site_id=site.id,
                name="SCADA ve Operatör Odası",
                description="Merkezi SCADA sunucusu ve operatör HMI panelleri",
                criticality="high",
            )
            db.add(zone_scada)

        zone_eng = db.scalar(
            select(Zone).where(Zone.site_id == site.id, Zone.name == "Mühendislik / Bakım Ağı")
        )
        if zone_eng is None:
            zone_eng = Zone(
                organization_id=org.id,
                site_id=site.id,
                name="Mühendislik / Bakım Ağı",
                description="Mühendislik iş istasyonları ve geçici bakım bağlantıları",
                criticality="medium",
            )
            db.add(zone_eng)
        db.flush()

        sensor = db.scalar(
            select(Sensor).where(Sensor.site_id == site.id, Sensor.name == "zeek-span-gebze-01")
        )
        if sensor is None:
            _, fp = new_sensor_credential()
            sensor = Sensor(
                organization_id=org.id,
                site_id=site.id,
                name="zeek-span-gebze-01",
                version="0.1.0-zeek9",
                status="active",
                credential_fingerprint=fp,
                last_seen_at=datetime.now(UTC),
            )
            db.add(sensor)
            db.flush()
        else:
            sensor.last_seen_at = datetime.now(UTC)

        # Bilinen zafiyet kataloğu kaydı (kesin eşleşme örneği)
        cve_code = "CVE-2023-28489"
        vuln = db.scalar(select(VulnerabilityCatalog).where(VulnerabilityCatalog.cve_id == cve_code))
        if vuln is None:
            vuln = VulnerabilityCatalog(
                cve_id=cve_code,
                vendor="Siemens",
                product="SIMATIC S7-1500",
                version_exact="2.9.2",
                cvss=9.1,
                description="Doğrulanmış S7-1500 CPU firmware 2.9.2 sürümünde ağ üzerinden istismar edilebilir kritik zafiyet.",
                recommendation="Üretici güvenlik bültenine göre firmware sürümünü v3.0.1 veya üzerine güncelleyin; erişimi yalnızca yetkili mühendislik istasyonuyla sınırlandırın.",
            )
            db.add(vuln)
            db.flush()

        now = datetime.now(UTC)
        obs_req = ObservationsIngestRequest(
            observations=[
                ObservationIn(
                    observed_at=now,
                    source="zeek",
                    device=DeviceInfo(ip="10.0.0.9", mac="00:50:04:93:70:67", hostname="plc-pres-01"),
                    evidence={
                        "source_logs": ["conn.log", "modbus.log"],
                        "observed_protocols": ["modbus"],
                        "ports_as_responder": [502],
                        "modbus_roles": ["slave_or_responder"],
                        "modbus_functions": ["READ_COILS", "READ_HOLDING_REGISTERS"],
                    },
                ),
                ObservationIn(
                    observed_at=now,
                    source="zeek",
                    device=DeviceInfo(ip="10.0.0.8", mac="00:1b:1b:44:55:08", hostname="hmi-operator-01"),
                    evidence={
                        "source_logs": ["conn.log", "modbus.log"],
                        "observed_protocols": ["modbus"],
                        "ports_as_initiator": [502],
                        "modbus_roles": ["master_or_initiator"],
                    },
                ),
                ObservationIn(
                    observed_at=now,
                    source="zeek",
                    device=DeviceInfo(ip="10.0.0.20", mac="00:1b:1b:44:55:20", hostname="plc-kaynak-02"),
                    evidence={
                        "source_logs": ["conn.log", "modbus.log"],
                        "observed_protocols": ["modbus"],
                        "ports_as_responder": [502],
                    },
                ),
                ObservationIn(
                    observed_at=now,
                    source="zeek",
                    device=DeviceInfo(ip="10.10.5.128", mac="00:c0:4f:36:05:a2", hostname="scada-master-01"),
                    evidence={
                        "source_logs": ["conn.log", "modbus.log"],
                        "observed_protocols": ["modbus", "http"],
                        "ports_as_responder": [80, 3389],
                    },
                ),
                ObservationIn(
                    observed_at=now,
                    source="zeek",
                    device=DeviceInfo(ip="10.10.20.99", mac="dc:a6:32:88:99:aa"),
                    evidence={
                        "source_logs": ["conn.log"],
                        "observed_protocols": ["rdp", "modbus"],
                        "ports_as_initiator": [502, 3389],
                    },
                ),
            ]
        )
        ingest_observations(db, sensor, obs_req.observations)

        comm_req = CommunicationsIngestRequest(
            communications=[
                CommunicationIn(
                    source="zeek",
                    source_ip="10.0.0.8",
                    destination_ip="10.0.0.9",
                    transport="tcp",
                    destination_port=502,
                    protocol="modbus",
                    protocol_confidence="observed",
                    connection_count=264,
                    first_seen_at=now,
                    last_seen_at=now,
                ),
                CommunicationIn(
                    source="zeek",
                    source_ip="10.10.5.128",
                    destination_ip="10.0.0.9",
                    transport="tcp",
                    destination_port=502,
                    protocol="modbus",
                    protocol_confidence="observed",
                    connection_count=142,
                    first_seen_at=now,
                    last_seen_at=now,
                ),
                CommunicationIn(
                    source="zeek",
                    source_ip="10.10.5.128",
                    destination_ip="10.0.0.20",
                    transport="tcp",
                    destination_port=502,
                    protocol="modbus",
                    protocol_confidence="observed",
                    connection_count=85,
                    first_seen_at=now,
                    last_seen_at=now,
                ),
                CommunicationIn(
                    source="zeek",
                    source_ip="10.10.20.99",
                    destination_ip="10.10.5.128",
                    transport="tcp",
                    destination_port=3389,
                    protocol="rdp",
                    protocol_confidence="observed",
                    connection_count=6,
                    first_seen_at=now,
                    last_seen_at=now,
                ),
                CommunicationIn(
                    source="zeek",
                    source_ip="10.10.20.99",
                    destination_ip="10.0.0.20",
                    transport="tcp",
                    destination_port=502,
                    protocol="modbus",
                    protocol_confidence="observed",
                    connection_count=12,
                    first_seen_at=now,
                    last_seen_at=now,
                ),
            ]
        )
        ingest_communications(db, sensor, comm_req.communications)

        # Bazı cihazları doğrulanmış envantere dönüştür, diğerlerini doğrulanmamış bırak
        plc1 = db.scalar(select(Asset).where(Asset.organization_id == org.id, Asset.ip_address == "10.0.0.9"))
        if plc1:
            plc1.name = "Pres Hattı Ana PLC (S7-1500)"
            plc1.asset_type = "plc"
            plc1.vendor = "Siemens"
            plc1.model = "SIMATIC S7-1500"
            plc1.firmware_version = "2.9.2"
            plc1.serial_number = "S-C-PRES1500-01"
            plc1.criticality = "critical"
            plc1.zone_id = zone_ot.id
            plc1.is_verified = True
            plc1.confidence = 1.0

        hmi1 = db.scalar(select(Asset).where(Asset.organization_id == org.id, Asset.ip_address == "10.0.0.8"))
        if hmi1:
            hmi1.name = "Pres Operatör HMI Paneli"
            hmi1.asset_type = "hmi"
            hmi1.vendor = "Siemens"
            hmi1.model = "SIMATIC HMI Comfort"
            hmi1.firmware_version = "17.0.0"
            hmi1.criticality = "high"
            hmi1.zone_id = zone_scada.id
            hmi1.is_verified = True
            hmi1.confidence = 1.0

        scada = db.scalar(select(Asset).where(Asset.organization_id == org.id, Asset.ip_address == "10.10.5.128"))
        if scada:
            scada.name = "Merkezi SCADA Sunucusu"
            scada.asset_type = "scada_server"
            scada.vendor = "Wonderware"
            scada.model = "System Platform"
            scada.firmware_version = "2023-R2"
            scada.criticality = "critical"
            scada.zone_id = zone_scada.id
            scada.is_verified = True
            scada.confidence = 1.0

        plc2 = db.scalar(select(Asset).where(Asset.organization_id == org.id, Asset.ip_address == "10.0.0.20"))
        if plc2:
            plc2.zone_id = zone_ot.id
            plc2.criticality = "high"
            # kasıtlı olarak is_verified=False bırakılır -> UNKNOWN_OT_ASSET bulgusu üretir

        rogue = db.scalar(select(Asset).where(Asset.organization_id == org.id, Asset.ip_address == "10.10.20.99"))
        if rogue:
            rogue.zone_id = zone_eng.id
            # kasıtlı olarak is_verified=False -> NEW_ASSET, UNEXPECTED_COMMUNICATION ve UNAPPROVED_REMOTE_PATH üretir

        db.flush()
        evaluate_organization_risks(db, org.id)
        db.commit()
        return {"email": email_norm, "password": password, "organization": org.name}


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="factoryguard")
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("create-owner", help="İlk kullanıcıyı ve organizasyonu oluştur")
    c.add_argument("--email", required=True)
    c.add_argument("--full-name", required=True)
    c.add_argument("--org-name", required=True)

    s = sub.add_parser("seed-demo", help="Gerçek PCAP ve örnek OT topolojisiyle demo verisi yükle")
    s.add_argument("--email", default="admin@factoryguard.com")
    s.add_argument("--password", default="FactoryGuard2026!")
    s.add_argument("--org-name", default="TürkOtomotiv Sanayi A.Ş.")

    a = p.parse_args(argv)

    if a.cmd == "seed-demo":
        info = seed_demo(email=a.email, password=a.password, org_name=a.org_name)
        print(
            f"Demo ortamı hazır: e-posta={info['email']} parola={info['password']} "
            f"organizasyon={info['organization']}"
        )
        return 0

    password = os.environ.get("FG_INITIAL_PASSWORD") or getpass.getpass("Parola: ")
    try:
        user, org = create_owner(a.email, a.full_name, a.org_name, password)
    except (ValueError, EmailNotValidError) as exc:
        print(f"HATA: {exc}", file=sys.stderr)
        return 1
    print(f"Oluşturuldu: kullanıcı={user.email} organizasyon={org.name} ({org.id})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
