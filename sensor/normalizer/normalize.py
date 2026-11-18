"""Zeek kayıtlarını FactoryGuard normalize gözlem formatına çevirir.

İlkeler:
  * Yalnızca logda gerçekten bulunan bilgiyi üret; tahmin etme.
  * Protokol: Zeek'in 'service' alanı (DPD ile doğrulanmış) veya PCAP DPI imzası -> 'observed'.
    Yalnızca port eşleşmesi -> 'port_hint' (kesin değil).
  * Ham payload taşınmaz; sadece metadata.
  * Multicast / broadcast / belirtilmemiş (0.0.0.0) / loopback adresler fiziksel cihaz değildir;
    envantere cihaz olarak eklenmez ve bu adreslere giden akışlar cihazlar arası iletişim sayılmaz.
"""
from __future__ import annotations

import ipaddress
from dataclasses import dataclass, field
from datetime import datetime, timezone

# Port ipuçları: yalnızca yardımcı bilgi, protokol kanıtı DEĞİL.
PORT_HINTS = {
    502: "modbus",
    102: "s7comm?",
    44818: "enip?",
    4840: "opcua?",
    20000: "dnp3?",
    47808: "bacnet?",
    34964: "profinet?",
}
_CONF_RANK = {"none": 0, "port_hint": 1, "observed": 2}

# Fiziksel prosesi değiştirebilen Modbus fonksiyonları (Zeek modbus.log `func` adları).
MODBUS_WRITE_FUNCTIONS = frozenset(
    {
        "WRITE_SINGLE_COIL",
        "WRITE_SINGLE_REGISTER",
        "WRITE_MULTIPLE_COILS",
        "WRITE_MULTIPLE_REGISTERS",
        "READ_WRITE_MULTIPLE_REGISTERS",
        "MASK_WRITE_REGISTER",
        "WRITE_FILE_RECORD",
    }
)


def ts_to_iso(ts) -> str | None:
    if ts is None:
        return None
    try:
        if isinstance(ts, str) and not ts.replace(".", "", 1).isdigit():
            return datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        return datetime.fromtimestamp(float(ts), tz=timezone.utc).isoformat().replace("+00:00", "Z")
    except (ValueError, OverflowError, OSError):
        return None


def _end_iso(ts, duration) -> str | None:
    """Zeek conn.log `ts + duration` -> bağlantının son görülme zamanı."""
    try:
        if ts is None or duration in (None, "", "-"):
            return None
        d = float(duration)
        if d <= 0:
            return None
        return ts_to_iso(float(ts) + d)
    except (TypeError, ValueError):
        return None


def valid_ip(v) -> str | None:
    try:
        return str(ipaddress.ip_address(v)) if v else None
    except ValueError:
        return None


def is_device_address(ip: str) -> bool:
    """Tekil (unicast) ve gerçek bir uç noktaya ait olabilecek adres mi?"""
    addr = ipaddress.ip_address(ip)
    if addr.is_multicast or addr.is_unspecified or addr.is_loopback or addr.is_link_local and addr.version == 6:
        return False
    if addr.version == 4 and (str(addr) == "255.255.255.255" or str(addr).endswith(".255")):
        # Sınırlı veya (yaygın /24) yönlendirilmiş broadcast. /24 dışı alt ağlarda .255 geçerli bir host
        # olabilir; bu durumda yanlış negatif tercih edilir (sahte cihaz üretmemek için).
        return False
    return True


def norm_mac(v) -> str | None:
    if not v or not isinstance(v, str):
        return None
    h = v.replace(":", "").replace("-", "").replace(".", "").lower()
    if len(h) != 12 or any(c not in "0123456789abcdef" for c in h):
        return None
    if h in ("000000000000", "ffffffffffff"):
        return None
    if int(h[0:2], 16) & 0x01:  # multicast / grup MAC adresi (ör. 01:00:5e:..)
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
    modbus_functions: set = field(default_factory=set)  # bu cihaza (sunucu rolü) gönderilen fonksiyonlar
    modbus_write_sources: set = field(default_factory=set)  # bu cihaza yazma komutu gönderen istemci IP'leri
    modbus_roles: set = field(default_factory=set)  # client | server
    protocol_messages: set = field(default_factory=set)  # PCAP DPI ile görülen mesaj türleri (ör. s7comm.job_request)

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
    def __init__(self, sensor_id: str, source: str = "zeek"):
        self.sensor_id = sensor_id
        self.source = source
        self.devices: dict[str, Device] = {}
        self.comms: dict[tuple, Comm] = {}
        self.rejected = 0
        self.non_unicast_skipped = 0
        self._seen_uids: set[str] = set()

    def _dev(self, ip: str) -> Device | None:
        if not is_device_address(ip):
            return None
        return self.devices.setdefault(ip, Device(ip=ip))

    def _log(self, zeek_log: str) -> str:
        """Kanıt kaynağı etiketi: Zeek için gerçek log adı, PCAP için `pcap_flow` / `pcap_dpi`."""
        if self.source == "zeek":
            return zeek_log
        return f"{self.source}_flow" if zeek_log == "conn.log" else f"{self.source}_dpi"

    def add_protocol_evidence(self, ip: str, protocol: str, message: str | None = None):
        """Bayt imzasıyla kanıtlanmış uygulama katmanı protokolünü (S7comm, ENIP, OPC UA) cihaza işler."""
        valid = valid_ip(ip)
        if not valid:
            return
        d = self._dev(valid)
        if d is None:
            return
        d.protocols.add(protocol.lower())
        d.evidence.add(self._log(f"{protocol.lower()}.log"))
        if message:
            d.protocol_messages.add(message)

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
        if not is_device_address(src) or not is_device_address(dst):
            self.non_unicast_skipped += 1
            return
        end_iso = _end_iso(r.get("ts"), r.get("duration")) or iso
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
            d.touch(end_iso)
            d.evidence.add(self._log("conn.log"))
            mac = norm_mac(r.get(mac_key))
            # MAC yalnızca yerel (aynı L2) adreslerde anlamlıdır; router MAC'i olabilir.
            if mac and not d.mac:
                d.mac = mac
            if proto and conf == "observed":
                d.protocols.add(proto)
        # Anahtar protokolü içermez: aynı akışın payload'sız bağlantıları (ör. yalnızca
        # TCP el sıkışma) ayrı kayda bölünmesin. Güven yalnızca yukarı yükseltilir.
        key = (src, dst, r.get("proto"), dport)
        c = self.comms.get(key)
        if not c:
            c = self.comms[key] = Comm(src, dst, r.get("proto"), proto, conf, dport)
        elif _CONF_RANK[conf] > _CONF_RANK[c.protocol_confidence]:
            c.protocol, c.protocol_confidence = proto, conf
        c.count += 1
        if isinstance(sport, int):
            c.source_ports.add(sport)
        c.first_seen = min(filter(None, [c.first_seen, iso]))
        c.last_seen = max(filter(None, [c.last_seen, end_iso]))

    # ---- dhcp.log ----
    def add_dhcp(self, r: dict):
        ip = valid_ip(r.get("assigned_addr") or r.get("client_addr"))
        if not ip:
            return
        d = self._dev(ip)
        if d is None:
            self.non_unicast_skipped += 1
            return
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
        """Modbus PDU kaydı. `id.orig_h` istemci (master), `id.resp_h` sunucu (slave/PLC) rolündedir."""
        client, server = valid_ip(r.get("id.orig_h")), valid_ip(r.get("id.resp_h"))
        iso = ts_to_iso(r.get("ts"))
        func = str(r.get("func") or "").upper().removesuffix("_EXCEPTION")
        for ip, role in ((client, "client"), (server, "server")):
            if not ip:
                continue
            d = self._dev(ip)
            if d is None:
                continue
            d.touch(iso)
            d.protocols.add("modbus")
            d.evidence.add(self._log("modbus.log"))
            d.modbus_roles.add(role)
        if server and func:
            d = self.devices.get(server)
            if d is not None:
                d.modbus_functions.add(func)
                if func in MODBUS_WRITE_FUNCTIONS and client:
                    d.modbus_write_sources.add(client)

    # ---- çıktı ----
    def observations(self) -> list[dict]:
        out = []
        for d in sorted(self.devices.values(), key=lambda x: ipaddress.ip_address(x.ip)):
            evidence = {
                "source_logs": sorted(d.evidence),
                "observed_protocols": sorted(d.protocols),
                "is_private_ip": ipaddress.ip_address(d.ip).is_private,
            }
            if d.modbus_roles:
                evidence["modbus_roles"] = sorted(d.modbus_roles)
            if d.modbus_functions:
                evidence["modbus_functions"] = sorted(d.modbus_functions)
            if d.modbus_write_sources:
                evidence["modbus_write_sources"] = sorted(d.modbus_write_sources, key=ipaddress.ip_address)
            if d.protocol_messages:
                evidence["protocol_messages"] = sorted(d.protocol_messages)
            out.append({
                "sensor_id": self.sensor_id,
                "observed_at": d.last_seen,
                "first_seen_at": d.first_seen,
                "source": self.source,
                "device": {"ip": d.ip, "mac": d.mac, "hostname": d.hostname},
                "evidence": evidence,
            })
        return out

    def communications(self) -> list[dict]:
        out = []
        for c in sorted(self.comms.values(), key=lambda x: (x.source_ip, x.destination_ip, x.destination_port or 0)):
            out.append({
                "sensor_id": self.sensor_id,
                "source": self.source,
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
                "evidence": {"source_log": self._log("conn.log")},
            })
        return out
