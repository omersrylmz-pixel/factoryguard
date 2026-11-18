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
    20000: "dnp3",
    34964: "profinet",
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

_S7COMM_ROSCTR_NAMES: dict[int, str] = {
    0x01: "JOB_REQUEST",
    0x02: "ACK",
    0x03: "ACK_DATA",
    0x07: "USERDATA",
}

_ENIP_COMMAND_NAMES: dict[int, str] = {
    0x0004: "LIST_SERVICES",
    0x0063: "LIST_IDENTITY",
    0x0064: "LIST_INTERFACES",
    0x0065: "REGISTER_SESSION",
    0x0066: "UNREGISTER_SESSION",
    0x006F: "SEND_RR_DATA",
    0x0070: "SEND_UNIT_DATA",
}

_OPCUA_MSG_TYPES: set[bytes] = {b"HEL", b"ACK", b"ERR", b"RHE", b"OPN", b"CLO", b"MSG"}

_BACNET_BVLC_FUNCS: dict[int, str] = {
    0x00: "RESULT",
    0x04: "FORWARDED_NPDU",
    0x09: "DISTRIBUTE_BROADCAST",
    0x0A: "ORIGINAL_UNICAST_NPDU",
    0x0B: "ORIGINAL_BROADCAST_NPDU",
}


def _inspect_industrial_payload(dport: int, sport: int, payload: bytes) -> tuple[str | None, str | None]:
    """Uygulama katmanı bayt imzasından (DPI) kanıtlanmış endüstriyel protokolü döndürür."""
    if not payload:
        return None, None

    # 1. Modbus/TCP (Port 502, MBAP Protocol ID == 0x0000)
    if (dport == 502 or sport == 502) and len(payload) >= 8:
        proto_id = struct.unpack("!H", payload[2:4])[0]
        fc = payload[7] & 0x7F
        if proto_id == 0 and fc in _MODBUS_FC_NAMES:
            return "modbus", f"modbus.fc.{_MODBUS_FC_NAMES[fc]}"

    # 2. Siemens S7comm (Port 102, TPKT 0x03 0x00 + COTP + S7 Protocol ID 0x32)
    if (dport == 102 or sport == 102) and len(payload) >= 8:
        if payload[0] == 0x03 and payload[1] == 0x00:
            cotp_len = payload[4]
            s7_offset = 5 + cotp_len
            if len(payload) > s7_offset + 1 and payload[s7_offset] == 0x32:
                rosctr = payload[s7_offset + 1]
                ros_name = _S7COMM_ROSCTR_NAMES.get(rosctr, f"ROSCTR_{rosctr}")
                return "s7comm", f"s7comm.{ros_name.lower()}"

    # 3. Rockwell / ODVA EtherNet/IP (Port 44818, 24-byte ENIP Encapsulation Header)
    if (dport == 44818 or sport == 44818) and len(payload) >= 24:
        cmd = struct.unpack("<H", payload[0:2])[0]
        status_code = struct.unpack("<I", payload[8:12])[0]
        if cmd in _ENIP_COMMAND_NAMES and status_code == 0:
            return "enip", f"enip.{_ENIP_COMMAND_NAMES[cmd].lower()}"

    # 4. OPC UA Binary Protocol (Port 4840, 3-byte MessageType + 1-byte ChunkType 'F'/'C'/'A')
    if (dport == 4840 or sport == 4840) and len(payload) >= 8:
        msg_type = payload[0:3]
        chunk_type = payload[3:4]
        if msg_type in _OPCUA_MSG_TYPES and chunk_type in (b"F", b"C", b"A"):
            return "opcua", f"opcua.{msg_type.decode('ascii').lower()}"

    # 5. BACnet/IP (UDP Port 47808 / 0xBAC0, BVLC Type == 0x81 + Function + NPDU Version 0x01)
    if (dport == 47808 or sport == 47808) and len(payload) >= 6:
        bvlc_type = payload[0]
        bvlc_func = payload[1]
        if bvlc_type == 0x81 and bvlc_func in _BACNET_BVLC_FUNCS:
            return "bacnet", f"bacnet.{_BACNET_BVLC_FUNCS[bvlc_func].lower()}"

    # 6. DNP3 (TCP/UDP Port 20000, Data Link Layer Start Bytes 0x05 0x64)
    if (dport == 20000 or sport == 20000) and len(payload) >= 10:
        if payload[0] == 0x05 and payload[1] == 0x64:
            ctrl_fc = payload[3] & 0x0F
            return "dnp3", f"dnp3.dl_fc_{ctrl_fc}"

    # 7. PROFINET IO Context Manager / DCE-RPC (UDP/TCP Port 34964, RPC Version 0x04)
    if (dport == 34964 or sport == 34964) and len(payload) >= 20:
        rpc_ver = payload[0]
        pkt_type = payload[1]
        if rpc_ver == 0x04 and pkt_type in (0x00, 0x02):
            ptype_label = "request" if pkt_type == 0x00 else "response"
            return "profinet", f"profinet.dcerpc_{ptype_label}"

    return None, None


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
    """Ham `.pcap`/`.pcapng` baytlarını ayrıştırıp `Normalizer` çıktısı üretir.

    Paketler 5'li anahtara (istemci IP/port, sunucu IP/port, taşıma) göre **akışlara** birleştirilir;
    böylece `connection_count` paket sayısını değil, Zeek `conn.log` ile karşılaştırılabilir akış sayısını
    ifade eder. Uygulama katmanı protokolü yalnızca bayt imzası (DPI) eşleşirse `observed` sayılır;
    yalnızca port eşleşmesi Normalizer tarafından `port_hint` olarak işaretlenir.
    """
    normalizer = Normalizer(sensor_id, source="pcap")
    # flow_key -> {first_ts, last_ts, service, orig_l2, resp_l2}
    flows: dict[tuple[str, int, str, int, str], dict[str, Any]] = {}
    packet_count = 0

    for ts, pkt in _iter_pcap_packets(data):
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
        dpi_proto, dpi_msg = _inspect_industrial_payload(dport, sport, payload)

        # İstemci -> Sunucu yönünü bilinen servis portuna göre normalize et (yanıt paketleri aynı akışa düşer)
        if sport in _PORT_SERVICE_MAP and dport not in _PORT_SERVICE_MAP:
            orig_h, orig_p, orig_l2 = dst_ip, dport, dst_mac
            resp_h, resp_p, resp_l2 = src_ip, sport, src_mac
        else:
            orig_h, orig_p, orig_l2 = src_ip, sport, src_mac
            resp_h, resp_p, resp_l2 = dst_ip, dport, dst_mac

        key = (orig_h, orig_p, resp_h, resp_p, transport)
        flow = flows.get(key)
        if flow is None:
            flow = flows[key] = {
                "first_ts": ts,
                "last_ts": ts,
                "service": None,
                "orig_l2": orig_l2,
                "resp_l2": resp_l2,
            }
        flow["first_ts"] = min(flow["first_ts"], ts)
        flow["last_ts"] = max(flow["last_ts"], ts)
        if dpi_proto and flow["service"] is None:
            flow["service"] = dpi_proto

        # Uygulama katmanı kanıtı (paket bazında; ham payload saklanmaz, yalnızca mesaj türü)
        if dpi_proto == "modbus" and dpi_msg:
            normalizer.add_modbus(
                {
                    "ts": ts,
                    "id.orig_h": orig_h,
                    "id.orig_p": orig_p,
                    "id.resp_h": resp_h,
                    "id.resp_p": resp_p,
                    "func": dpi_msg.removeprefix("modbus.fc."),
                }
            )
        elif dpi_proto and dpi_msg:
            normalizer.add_protocol_evidence(orig_h, dpi_proto, dpi_msg)
            normalizer.add_protocol_evidence(resp_h, dpi_proto, dpi_msg)

    for n, ((orig_h, orig_p, resp_h, resp_p, transport), flow) in enumerate(sorted(flows.items()), start=1):
        normalizer.add_conn(
            {
                "ts": flow["first_ts"],
                "duration": flow["last_ts"] - flow["first_ts"],
                "uid": f"pcap-flow-{n}",
                "id.orig_h": orig_h,
                "id.orig_p": orig_p,
                "id.resp_h": resp_h,
                "id.resp_p": resp_p,
                "proto": transport,
                "service": flow["service"],
                "orig_l2_addr": flow["orig_l2"],
                "resp_l2_addr": flow["resp_l2"],
            }
        )

    return {
        "sensor_id": sensor_id,
        "schema_version": "0.2",
        "logs_used": ["pcap_binary"],
        "packets_parsed": packet_count,
        "flows_parsed": len(flows),
        "observations": normalizer.observations(),
        "communications": normalizer.communications(),
        "stats": {
            "devices": len(normalizer.devices),
            "communications": len(normalizer.comms),
            "rejected_records": normalizer.rejected,
            "non_unicast_skipped": normalizer.non_unicast_skipped,
        },
    }
