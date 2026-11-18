from pathlib import Path

from sensor.cli import run
from sensor.normalizer.normalize import Normalizer, norm_mac
from sensor.parsers.zeek import read_zeek_log

LAB = Path(__file__).resolve().parents[2] / "sample-data" / "zeek" / "lab-basic"


def result():
    return run(LAB, "sensor-test")


def by_ip(res):
    return {o["device"]["ip"]: o for o in res["observations"]}


def test_tsv_parsing_types():
    recs = list(read_zeek_log(LAB / "modbus.log"))
    assert len(recs) == 1
    assert recs[0]["id.resp_p"] == 502 and recs[0]["exception"] is None


def test_bad_lines_skipped_and_invalid_ip_rejected():
    res = result()
    assert res["stats"]["rejected_records"] == 1  # not-an-ip
    assert "not-an-ip" not in by_ip(res)


def test_duplicate_uid_not_double_counted():
    res = result()
    c = [c for c in res["communications"] if c["destination_port"] == 502]
    assert len(c) == 1 and c[0]["connection_count"] == 2


def test_no_duplicate_devices():
    res = result()
    ips = [o["device"]["ip"] for o in res["observations"]]
    assert len(ips) == len(set(ips)) == 7


def test_protocol_confidence_observed_vs_port_hint():
    res = result()
    comms = {c["destination_port"]: c for c in res["communications"]}
    assert comms[502]["protocol_confidence"] == "observed"
    assert comms[102]["protocol_confidence"] == "port_hint"  # S7 KANITLANMADI
    # port ipucu cihaz protokol kanıtına eklenmez
    assert by_ip(res)["192.168.10.21"]["evidence"]["observed_protocols"] == []


def test_dhcp_hostname_and_dns_hostname():
    d = by_ip(result())
    assert d["192.168.10.30"]["device"]["hostname"] == "hmi-line1"
    assert d["192.168.10.40"]["device"]["hostname"] == "scada01.fabrika.local"


def test_no_vendor_or_type_guessing():
    for o in result()["observations"]:
        assert set(o["device"]) == {"ip", "mac", "hostname"}


def test_first_last_seen():
    d = by_ip(result())["192.168.10.30"]
    assert d["first_seen_at"] < d["observed_at"]


def test_mac_normalization():
    assert norm_mac("00-11-22-AA-BB-CC") == "00:11:22:aa:bb:cc"
    assert norm_mac("ff:ff:ff:ff:ff:ff") is None
    assert norm_mac("zz") is None


def test_same_flow_not_split_and_confidence_upgraded():
    # Gerçek PCAP'te görülen durum: payload'sız el sıkışma + gerçek Modbus aynı akış.
    n = Normalizer("s")
    base = {"id.orig_h": "10.0.0.57", "id.resp_h": "10.0.0.3", "id.resp_p": 502, "proto": "tcp"}
    n.add_conn({**base, "uid": "a", "ts": 1.0})
    n.add_conn({**base, "uid": "b", "ts": 2.0, "service": "modbus"})
    comms = n.communications()
    assert len(comms) == 1
    assert comms[0]["protocol_confidence"] == "observed" and comms[0]["connection_count"] == 2


def test_shared_mac_kept_per_ip_not_merged():
    # Gerçek PCAP: iki IP aynı MAC (gateway). Normalizer birleştirmez; karar Aşama 3'te.
    n = Normalizer("s")
    for ip, uid in (("10.0.0.8", "a"), ("10.0.0.9", "b")):
        n.add_conn({"uid": uid, "ts": 1.0, "id.orig_h": "10.0.0.57", "id.resp_h": ip, "id.resp_p": 502,
                    "proto": "tcp", "resp_l2_addr": "00:50:04:93:70:67"})
    assert {o["device"]["ip"] for o in n.observations()} >= {"10.0.0.8", "10.0.0.9"}


def test_conn_without_ts_rejected():
    n = Normalizer("s")
    n.add_conn({"id.orig_h": "10.0.0.1", "id.resp_h": "10.0.0.2"})
    assert n.rejected == 1 and not n.devices


def test_pcap_dpi_s7comm_enip_opcua_signatures():
    import socket
    import struct
    from sensor.parsers.pcap_binary import parse_pcap_bytes

    def build_tcp_pkt(src_ip: str, dst_ip: str, sport: int, dport: int, payload: bytes) -> bytes:
        eth = bytes.fromhex("001b1b112233" "000e8c445566" "0800")
        tot_len = 20 + 20 + len(payload)
        ip = struct.pack("!BBHHHBBH4s4s", 0x45, 0, tot_len, 1, 0, 64, 6, 0, socket.inet_aton(src_ip), socket.inet_aton(dst_ip))
        tcp = struct.pack("!HHIIBBHHH", sport, dport, 1, 1, (5 << 4), 0x18, 8192, 0, 0)
        return eth + ip + tcp + payload

    # 1. Siemens S7comm Job Request (TPKT 03 00 00 11 + COTP 02 f0 80 + S7 32 01 ...)
    s7_payload = bytes([0x03, 0x00, 0x00, 0x11, 0x02, 0xF0, 0x80, 0x32, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00])
    # 2. EtherNet/IP ListIdentity (cmd=0x0063, 24 bytes header)
    enip_payload = struct.pack("<HHII8sI", 0x0063, 0, 0, 0, b"\x00" * 8, 0)
    # 3. OPC UA Hello (HEL + F + size)
    opcua_payload = b"HELF" + struct.pack("<I", 32) + b"\x00" * 24

    pkts = [
        build_tcp_pkt("10.10.1.50", "10.10.1.10", 49152, 102, s7_payload),
        build_tcp_pkt("10.10.1.50", "10.10.1.11", 49153, 44818, enip_payload),
        build_tcp_pkt("10.10.1.50", "10.10.1.12", 49154, 4840, opcua_payload),
    ]
    pcap = struct.pack("<IHHiIII", 0xA1B2C3D4, 2, 4, 0, 0, 65535, 1)
    for idx, p in enumerate(pkts, start=1):
        pcap += struct.pack("<IIII", 1700000000 + idx, 0, len(p), len(p)) + p

    parsed = parse_pcap_bytes(pcap, "snr-dpi")
    obs = {o["device"]["ip"]: o for o in parsed["observations"]}
    assert "s7comm" in obs["10.10.1.10"]["evidence"]["observed_protocols"]
    assert "s7comm.job_request" in obs["10.10.1.10"]["evidence"]["protocol_messages"]
    assert "enip" in obs["10.10.1.11"]["evidence"]["observed_protocols"]
    assert "enip.list_identity" in obs["10.10.1.11"]["evidence"]["protocol_messages"]
    assert "opcua" in obs["10.10.1.12"]["evidence"]["observed_protocols"]
    assert "opcua.hel" in obs["10.10.1.12"]["evidence"]["protocol_messages"]
    assert all(o["source"] == "pcap" for o in parsed["observations"])
    comms = {c["destination_port"]: c for c in parsed["communications"]}
    assert comms[102]["protocol"] == "s7comm" and comms[102]["protocol_confidence"] == "observed"


def _pcap_file(pkts: list[bytes]) -> bytes:
    import struct

    out = struct.pack("<IHHiIII", 0xA1B2C3D4, 2, 4, 0, 0, 65535, 1)
    for idx, p in enumerate(pkts, start=1):
        out += struct.pack("<IIII", 1700000000 + idx, 0, len(p), len(p)) + p
    return out


def _tcp(src_ip: str, dst_ip: str, sport: int, dport: int, payload: bytes = b"", dst_mac="001b1b112233") -> bytes:
    import socket
    import struct

    eth = bytes.fromhex(dst_mac + "000e8c445566" + "0800")
    ip = struct.pack("!BBHHHBBH4s4s", 0x45, 0, 40 + len(payload), 1, 0, 64, 6, 0,
                     socket.inet_aton(src_ip), socket.inet_aton(dst_ip))
    tcp = struct.pack("!HHIIBBHHH", sport, dport, 1, 1, (5 << 4), 0x18, 8192, 0, 0)
    return eth + ip + tcp + payload


def test_pcap_packets_aggregated_into_flows_not_counted_as_connections():
    """Gerçek PCAP: 118 paket paket sayısı olarak değil, akış sayısı olarak raporlanmalı."""
    from sensor.parsers.pcap_binary import parse_pcap_bytes

    pcap = Path(__file__).resolve().parents[2] / "sample-data" / "pcap" / "MODBUS-TestDataPart1.pcap"
    parsed = parse_pcap_bytes(pcap.read_bytes(), "s")
    total = sum(c["connection_count"] for c in parsed["communications"])
    assert parsed["packets_parsed"] > total
    assert total == parsed["flows_parsed"]
    # Zeek aynı PCAP için 4 cihaz görüyor; DPI ile en az bir akış gözlenmiş Modbus olmalı
    assert {o["device"]["ip"] for o in parsed["observations"]} == {"10.0.0.3", "10.0.0.8", "10.0.0.9", "10.0.0.57"}
    assert any(c["protocol_confidence"] == "observed" for c in parsed["communications"])


def test_pcap_port_only_traffic_is_port_hint_not_observed():
    from sensor.parsers.pcap_binary import parse_pcap_bytes

    # Port 3389'a gelen ama RDP imzası doğrulanmayan payload -> protokol 'observed' sayılmaz
    parsed = parse_pcap_bytes(_pcap_file([_tcp("10.1.1.5", "10.1.1.6", 50000, 3389, b"\x01\x02\x03\x04")]), "s")
    c = parsed["communications"][0]
    assert c["protocol_confidence"] != "observed"
    # Modbus portuna payload'sız (SYN benzeri) paket -> yalnızca port ipucu
    parsed = parse_pcap_bytes(_pcap_file([_tcp("10.1.1.5", "10.1.1.7", 50001, 502)]), "s")
    assert parsed["communications"][0]["protocol_confidence"] == "port_hint"
    assert all(o["evidence"]["observed_protocols"] == [] for o in parsed["observations"])


def test_pcap_modbus_write_function_attributed_to_server_with_source():
    import struct

    from sensor.parsers.pcap_binary import parse_pcap_bytes

    # MBAP (tid=1, pid=0, len=6, unit=1) + FC 6 WRITE_SINGLE_REGISTER
    write = struct.pack("!HHHB", 1, 0, 6, 1) + bytes([0x06, 0x00, 0x01, 0x00, 0x2A])
    parsed = parse_pcap_bytes(_pcap_file([_tcp("10.2.0.50", "10.2.0.10", 49000, 502, write)]), "s")
    obs = {o["device"]["ip"]: o["evidence"] for o in parsed["observations"]}
    assert obs["10.2.0.10"]["modbus_functions"] == ["WRITE_SINGLE_REGISTER"]
    assert obs["10.2.0.10"]["modbus_write_sources"] == ["10.2.0.50"]
    assert obs["10.2.0.10"]["modbus_roles"] == ["server"]
    assert "modbus_functions" not in obs["10.2.0.50"]


def test_zeek_modbus_write_functions_exposed_in_evidence():
    n = Normalizer("s")
    base = {"ts": 1.0, "id.orig_h": "10.0.0.57", "id.orig_p": 2000, "id.resp_h": "10.0.0.3", "id.resp_p": 502}
    n.add_conn({**base, "uid": "c1", "proto": "tcp", "service": "modbus"})
    n.add_modbus({**base, "func": "READ_COILS"})
    n.add_modbus({**base, "func": "WRITE_MULTIPLE_REGISTERS_EXCEPTION"})
    ev = {o["device"]["ip"]: o["evidence"] for o in n.observations()}
    assert ev["10.0.0.3"]["modbus_functions"] == ["READ_COILS", "WRITE_MULTIPLE_REGISTERS"]
    assert ev["10.0.0.3"]["modbus_write_sources"] == ["10.0.0.57"]
    assert ev["10.0.0.57"]["modbus_roles"] == ["client"]


def test_multicast_and_broadcast_are_not_devices():
    n = Normalizer("s")
    n.add_conn({"uid": "m", "ts": 1.0, "id.orig_h": "10.0.0.5", "id.resp_h": "224.0.0.251", "id.resp_p": 5353, "proto": "udp"})
    n.add_conn({"uid": "b", "ts": 1.0, "id.orig_h": "0.0.0.0", "id.resp_h": "255.255.255.255", "id.resp_p": 67, "proto": "udp"})
    n.add_dhcp({"ts": 1.0, "client_addr": "0.0.0.0", "mac": "00:11:22:33:44:55"})
    assert n.devices == {} and n.comms == {}
    assert n.non_unicast_skipped == 3


def test_zeek_duration_extends_last_seen():
    n = Normalizer("s")
    n.add_conn({"uid": "a", "ts": 100.0, "duration": 60.0, "id.orig_h": "10.0.0.1", "id.resp_h": "10.0.0.2",
                "id.resp_p": 502, "proto": "tcp", "service": "modbus"})
    c = n.communications()[0]
    assert c["first_seen_at"] < c["last_seen_at"]
    assert c["last_seen_at"].startswith("1970-01-01T00:02:40")


def test_pcap_dpi_bacnet_dnp3_and_profinet_signatures():
    import socket
    import struct
    from sensor.parsers.pcap_binary import parse_pcap_bytes

    def _udp(src_ip: str, dst_ip: str, sport: int, dport: int, payload: bytes) -> bytes:
        eth = bytes.fromhex("001b1b112233" "000e8c445566" "0800")
        udp_len = 8 + len(payload)
        ip = struct.pack("!BBHHHBBH4s4s", 0x45, 0, 20 + udp_len, 1, 0, 64, 17, 0,
                         socket.inet_aton(src_ip), socket.inet_aton(dst_ip))
        udp = struct.pack("!HHHH", sport, dport, udp_len, 0)
        return eth + ip + udp + payload

    # 1. BACnet/IP Original-Unicast-NPDU (0x81 0x0a + length + NPDU version 0x01)
    bacnet_payload = bytes([0x81, 0x0A, 0x00, 0x08, 0x01, 0x00, 0x10, 0x08])
    # 2. DNP3 Data Link Frame (0x05 0x64 + len + ctrl + dst + src + crc)
    dnp3_payload = bytes([0x05, 0x64, 0x05, 0xC4, 0x01, 0x00, 0x02, 0x00, 0xAA, 0xBB])
    # 3. PROFINET IO CM DCE/RPC Request (version 0x04, pkt_type 0x00, 20+ bytes)
    profinet_payload = bytes([0x04, 0x00, 0x20, 0x00]) + b"\x00" * 20

    parsed = parse_pcap_bytes(
        _pcap_file([
            _udp("10.30.0.50", "10.30.0.10", 47808, 47808, bacnet_payload),
            _tcp("10.30.0.50", "10.30.0.11", 51000, 20000, dnp3_payload),
            _udp("10.30.0.50", "10.30.0.12", 49155, 34964, profinet_payload),
        ]),
        "snr-dpi-ext",
    )
    obs = {o["device"]["ip"]: o["evidence"] for o in parsed["observations"]}
    assert "bacnet" in obs["10.30.0.10"]["observed_protocols"]
    assert "bacnet.original_unicast_npdu" in obs["10.30.0.10"]["protocol_messages"]
    assert "dnp3" in obs["10.30.0.11"]["observed_protocols"]
    assert "dnp3.dl_fc_4" in obs["10.30.0.11"]["protocol_messages"]
    assert "profinet" in obs["10.30.0.12"]["observed_protocols"]
    assert "profinet.dcerpc_request" in obs["10.30.0.12"]["protocol_messages"]


