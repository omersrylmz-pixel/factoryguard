"""Saf Python, sıfır bağımlılıklı pasif PCAP / PCAPNG ikili (binary) paket ayrıştırıcı.

Neden:
- Web arayüzünden doğrudan `.pcap` veya `.pcapng` dosyası yüklendiğinde Docker/Zeek gerekmeksizin
  milisaniyeler içinde Ethernet MAC, IPv4, TCP/UDP portları ve endüstriyel protokol kanıtlarını
  (Modbus/TCP fonksiyon kodları, S7comm, EtherNet/IP, OPC UA, RDP, SSH vb.) çıkarır ve
  `Normalizer` ile aynı kanonik çıktı formatını üretir.
"""
from __future__ import annotations

import socket
import struct
from datetime import UTC, datetime
from typing import Any

from sensor.normalizer.normalize import Normalizer

_PORT_SERVICE_MAP: dict[int, str] = {
    502: "modbus",
    102: "s7comm",
    44818: "enip",
    4840: "opcua",
    47808: "bacnet",
    3389: "rdp",
    5900: "vnc",
    22: "ssh",
    23: "telnet",
    80: "http",
    443: "ssl",
    53: "dns",
    67: "dhcp",
    68: "dhcp",
}

_MODBUS_FC_NAMES: dict[int, str] = {
    1: "READ_COILS",
    2: "READ_DISCRETE_INPUTS",
    3: "READ_HOLDING_REGISTERS",
    4: "READ_INPUT_REGISTERS",
    5: "WRITE_SINGLE_COIL",
    6: "WRITE_SINGLE_REGISTER",
    15: "WRITE_MULTIPLE_COILS",
    16: "WRITE_MULTIPLE_REGISTERS",
    43: "ENCAPSULATED_INTERFACE_TRANSPORT",
}


def _fmt_mac(raw6: bytes) -> str:
    return ":".join(f"{b:02x}" for b in raw6)


def _iter_pcap_packets(data: bytes):
    """Klasik libpcap (`.pcap`) ve `.pcapng` Enhanced Packet Block kayıtlarını üretir."""
    if len(data) < 24:
        raise ValueError("Dosya geçerli bir PCAP başlığı için çok kısa")

    magic = data[:4]
    if magic == b"\xd4\xc3\xb2\xa1":
        endian, nano = "<", False
    elif magic == b"\xa1\xb2\xc3\xd4":
        endian, nano = ">", False
    elif magic == b"\x4d\x3c\xb2\xa1":
        endian, nano = "<", True
    elif magic == b"\xa1\xb2\x3c\x4d":
        endian, nano = ">", True
    elif magic == b"\x0a\x0d\x0d\x0a":
        yield from _iter_pcapng_packets(data)
        return
    else:
        raise ValueError("Desteklenmeyen dosya formatı: Geçerli bir .pcap veya .pcapng başlığı bulunamadı")

    linktype = struct.unpack(f"{endian}I", data[20:24])[0]
    if linktype != 1:  # LINKTYPE_ETHERNET
        raise ValueError(f"Yalnızca Ethernet (linktype=1) desteklenir, gelen: {linktype}")

    pos = 24
    hdr_fmt = f"{endian}IIII"
    while pos + 16 <= len(data):
        ts_sec, ts_sub, incl_len, _orig_len = struct.unpack(hdr_fmt, data[pos : pos + 16])
        pos += 16
        if pos + incl_len > len(data):
            break
        pkt = data[pos : pos + incl_len]
        pos += incl_len
        ts = ts_sec + (ts_sub / (1_000_000_000.0 if nano else 1_000_000.0))
        yield ts, pkt


def _iter_pcapng_packets(data: bytes):
    pos = 0
    endian = "<"
    while pos + 12 <= len(data):
        block_type = struct.unpack(f"{endian}I", data[pos : pos + 4])[0]
        if block_type == 0x0A0D0D0A and pos + 12 <= len(data):
            bom = data[pos + 8 : pos + 12]
            endian = "<" if bom == b"\x4d\x3c\x2b\x1a" else ">"
        block_len = struct.unpack(f"{endian}I", data[pos + 4 : pos + 8])[0]
        if block_len < 12 or pos + block_len > len(data):
            break
        body = data[pos + 8 : pos + block_len - 4]
        pos += block_len

        if block_type == 0x00000006 and len(body) >= 20:  # Enhanced Packet Block
            _iface_id, ts_high, ts_low, cap_len, _orig_len = struct.unpack(f"{endian}IIIII", body[:20])
            pkt = body[20 : 20 + cap_len]
            ts64 = (ts_high << 32) | ts_low
            ts = ts64 / 1_000_000.0 if ts64 > 0 else datetime.now(UTC).timestamp()
            yield ts, pkt


def parse_pcap_bytes(data: bytes, sensor_id: str) -> dict[str, Any]:
    """Ham `.pcap`/`.pcapng` baytlarını ayrıştırıp `Normalizer` çıktısı üretir."""
    normalizer = Normalizer(sensor_id)
    flow_seqs: dict[tuple[str, str, int, int, str], int] = {}
    packet_count = 0

    for idx, (ts, pkt) in enumerate(_iter_pcap_packets(data), start=1):
        if len(pkt) < 34:
            continue
        dst_mac = _fmt_mac(pkt[0:6])
        src_mac = _fmt_mac(pkt[6:12])
        ethertype = struct.unpack("!H", pkt[12:14])[0]
        ip_offset = 14
        if ethertype == 0x8100 and len(pkt) >= 38:  # 802.1Q VLAN
            ethertype = struct.unpack("!H", pkt[16:18])[0]
            ip_offset = 18
        if ethertype != 0x0800:  # Yalnızca IPv4
            continue

        ip_hdr = pkt[ip_offset:]
        if len(ip_hdr) < 20:
            continue
        ihl = (ip_hdr[0] & 0x0F) * 4
        if ihl < 20 or len(ip_hdr) < ihl:
            continue
        proto_num = ip_hdr[9]
        src_ip = socket.inet_ntoa(ip_hdr[12:16])
        dst_ip = socket.inet_ntoa(ip_hdr[16:20])
        l4 = ip_hdr[ihl:]

        if proto_num == 6 and len(l4) >= 20:  # TCP
            sport, dport = struct.unpack("!HH", l4[:4])
            data_offset = ((l4[12] >> 4) & 0x0F) * 4
            payload = l4[data_offset:] if len(l4) >= data_offset else b""
            transport = "tcp"
        elif proto_num == 17 and len(l4) >= 8:  # UDP
            sport, dport = struct.unpack("!HH", l4[:4])
            payload = l4[8:]
            transport = "udp"
        else:
            continue

        packet_count += 1
        flow_key = (src_ip, dst_ip, sport, dport, transport)
        flow_seqs[flow_key] = flow_seqs.get(flow_key, 0) + 1
        uid = f"pcap-{idx}-{flow_seqs[flow_key]}"

        service = None
        if len(payload) > 0:
            if dport in _PORT_SERVICE_MAP:
                service = _PORT_SERVICE_MAP[dport]
            elif sport in _PORT_SERVICE_MAP:
                service = _PORT_SERVICE_MAP[sport]

        # İstemci -> Sunucu yönünü düşük/bilinen porta göre normalize et
        if sport in _PORT_SERVICE_MAP and dport not in _PORT_SERVICE_MAP:
            orig_h, orig_p, orig_l2 = dst_ip, dport, dst_mac
            resp_h, resp_p, resp_l2 = src_ip, sport, src_mac
        else:
            orig_h, orig_p, orig_l2 = src_ip, sport, src_mac
            resp_h, resp_p, resp_l2 = dst_ip, dport, dst_mac

        normalizer.add_conn(
            {
                "ts": ts,
                "uid": uid,
                "id.orig_h": orig_h,
                "id.orig_p": orig_p,
                "id.resp_h": resp_h,
                "id.resp_p": resp_p,
                "proto": transport,
                "service": service,
                "orig_l2_addr": orig_l2,
                "resp_l2_addr": resp_l2,
            }
        )

        # Modbus/TCP uygulama katmanı (MBAP + Function Code)
        if (dport == 502 or sport == 502) and len(payload) >= 8:
            proto_id = struct.unpack("!H", payload[2:4])[0]
            fc = payload[7] & 0x7F
            if proto_id == 0 and fc in _MODBUS_FC_NAMES:
                normalizer.add_modbus(
                    {
                        "ts": ts,
                        "uid": uid,
                        "id.orig_h": orig_h,
                        "id.orig_p": orig_p,
                        "id.resp_h": resp_h,
                        "id.resp_p": resp_p,
                        "func": _MODBUS_FC_NAMES[fc],
                    }
                )

    return {
        "sensor_id": sensor_id,
        "schema_version": "0.1",
        "logs_used": ["pcap_binary"],
        "packets_parsed": packet_count,
        "observations": normalizer.observations(),
        "communications": normalizer.communications(),
        "stats": {
            "devices": len(normalizer.devices),
            "communications": len(normalizer.comms),
            "rejected_records": normalizer.rejected,
        },
    }
