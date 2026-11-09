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


def test_conn_without_ts_rejected():
    n = Normalizer("s")
    n.add_conn({"id.orig_h": "10.0.0.1", "id.resp_h": "10.0.0.2"})
    assert n.rejected == 1 and not n.devices
