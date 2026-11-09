"""Zeek kayıtlarını FactoryGuard normalize gözlem formatına çevirir.

İlkeler:
  * Yalnızca logda gerçekten bulunan bilgiyi üret; tahmin etme.
  * Protokol: Zeek'in 'service' alanı (DPD ile doğrulanmış) -> confidence 'observed'.
    Yalnızca port eşleşmesi -> 'port_hint' (kesin değil).
  * Ham payload taşınmaz; sadece metadata.
"""
from __future__ import annotations

import ipaddress
from dataclasses import dataclass, field
from datetime import datetime, timezone

# Port ipuçları: yalnızca yardımcı bilgi, protokol kanıtı DEĞİL.
PORT_HINTS = {502: "modbus", 102: "s7comm?", 44818: "enip?", 4840: "opcua?", 20000: "dnp3?"}


def ts_to_iso(ts) -> str | None:
    if ts is None:
        return None
    try:
        if isinstance(ts, str) and not ts.replace(".", "", 1).isdigit():
            return datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        return datetime.fromtimestamp(float(ts), tz=timezone.utc).isoformat().replace("+00:00", "Z")
    except (ValueError, OverflowError, OSError):
        return None


def valid_ip(v) -> str | None:
    try:
        return str(ipaddress.ip_address(v)) if v else None
    except ValueError:
        return None


def norm_mac(v) -> str | None:
    if not v or not isinstance(v, str):
        return None
    h = v.replace(":", "").replace("-", "").replace(".", "").lower()
    if len(h) != 12 or any(c not in "0123456789abcdef" for c in h):
        return None
    if h in ("000000000000", "ffffffffffff"):
        return None
    return ":".join(h[i:i + 2] for i in range(0, 12, 2))


@dataclass
class Device:
    ip: str
    mac: str | None = None
    hostname: str | None = None
    first_seen: str | None = None
    last_seen: str | None = None
    evidence: set = field(default_factory=set)
    protocols: set = field(default_factory=set)

    def touch(self, iso: str | None):
        if iso:
            self.first_seen = min(filter(None, [self.first_seen, iso]))
            self.last_seen = max(filter(None, [self.last_seen, iso]))


@dataclass
class Comm:
    source_ip: str
    destination_ip: str
    transport: str | None
    protocol: str | None
    protocol_confidence: str
    destination_port: int | None
    count: int = 0
    first_seen: str | None = None
    last_seen: str | None = None
    source_ports: set = field(default_factory=set)


class Normalizer:
    def __init__(self, sensor_id: str):
        self.sensor_id = sensor_id
        self.devices: dict[str, Device] = {}
        self.comms: dict[tuple, Comm] = {}
        self.rejected = 0
        self._seen_uids: set[str] = set()

    def _dev(self, ip: str) -> Device:
        return self.devices.setdefault(ip, Device(ip=ip))

    # ---- conn.log ----
    def add_conn(self, r: dict):
        uid = r.get("uid")
        if uid and uid in self._seen_uids:
            return  # aynı bağlantı tekrarı
        src, dst = valid_ip(r.get("id.orig_h")), valid_ip(r.get("id.resp_h"))
        iso = ts_to_iso(r.get("ts"))
        if not src or not dst or not iso:
            self.rejected += 1
            return
        if uid:
            self._seen_uids.add(uid)
        sport, dport = r.get("id.orig_p"), r.get("id.resp_p")
        service = r.get("service")
        if isinstance(service, list):
            service = ",".join(service)
        if service:
            proto, conf = service.lower(), "observed"
        elif isinstance(dport, int) and dport in PORT_HINTS:
            proto, conf = PORT_HINTS[dport], "port_hint"
        else:
            proto, conf = None, "none"
        for ip, mac_key in ((src, "orig_l2_addr"), (dst, "resp_l2_addr")):
            d = self._dev(ip)
            d.touch(iso)
            d.evidence.add("conn.log")
            mac = norm_mac(r.get(mac_key))
            # MAC yalnızca yerel (aynı L2) adreslerde anlamlıdır; router MAC'i olabilir.
            if mac and not d.mac:
                d.mac = mac
            if proto and conf == "observed":
                d.protocols.add(proto)
        key = (src, dst, r.get("proto"), proto, dport)
        c = self.comms.get(key)
        if not c:
            c = self.comms[key] = Comm(src, dst, r.get("proto"), proto, conf, dport)
        c.count += 1
        if isinstance(sport, int):
            c.source_ports.add(sport)
        c.first_seen = min(filter(None, [c.first_seen, iso]))
        c.last_seen = max(filter(None, [c.last_seen, iso]))

    # ---- dhcp.log ----
    def add_dhcp(self, r: dict):
        ip = valid_ip(r.get("assigned_addr") or r.get("client_addr"))
        if not ip:
            return
        d = self._dev(ip)
        d.touch(ts_to_iso(r.get("ts")))
        d.evidence.add("dhcp.log")
        mac = norm_mac(r.get("mac"))
        if mac:
            d.mac = mac  # DHCP MAC'i istemcinin kendi MAC'idir -> conn'dan daha güvenilir
        if r.get("host_name"):
            d.hostname = str(r["host_name"])

    # ---- dns.log ----
    def add_dns(self, r: dict):
        """A/AAAA yanıtlarından hostname (yalnızca yerel ağdaki IP'ler için)."""
        q, answers = r.get("query"), r.get("answers") or []
        if not q or r.get("qtype_name") not in ("A", "AAAA"):
            return
        for a in answers:
            ip = valid_ip(a)
            if ip and ip in self.devices and ipaddress.ip_address(ip).is_private and not self.devices[ip].hostname:
                self.devices[ip].hostname = q
                self.devices[ip].evidence.add("dns.log")

    # ---- modbus.log ----
    def add_modbus(self, r: dict):
        for k in ("id.orig_h", "id.resp_h"):
            ip = valid_ip(r.get(k))
            if ip:
                d = self._dev(ip)
                d.touch(ts_to_iso(r.get("ts")))
                d.protocols.add("modbus")
                d.evidence.add("modbus.log")

    # ---- çıktı ----
    def observations(self) -> list[dict]:
        out = []
        for d in sorted(self.devices.values(), key=lambda x: ipaddress.ip_address(x.ip)):
            out.append({
                "sensor_id": self.sensor_id,
                "observed_at": d.last_seen,
                "first_seen_at": d.first_seen,
                "source": "zeek",
                "device": {"ip": d.ip, "mac": d.mac, "hostname": d.hostname},
                "evidence": {
                    "source_logs": sorted(d.evidence),
                    "observed_protocols": sorted(d.protocols),
                    "is_private_ip": ipaddress.ip_address(d.ip).is_private,
                },
            })
        return out

    def communications(self) -> list[dict]:
        out = []
        for c in sorted(self.comms.values(), key=lambda x: (x.source_ip, x.destination_ip, x.destination_port or 0)):
            out.append({
                "sensor_id": self.sensor_id,
                "source": "zeek",
                "source_ip": c.source_ip,
                "destination_ip": c.destination_ip,
                "transport": c.transport,
                "protocol": c.protocol,
                "protocol_confidence": c.protocol_confidence,
                "destination_port": c.destination_port,
                "source_port_count": len(c.source_ports),
                "connection_count": c.count,
                "first_seen_at": c.first_seen,
                "last_seen_at": c.last_seen,
                "evidence": {"source_log": "conn.log"},
            })
        return out
