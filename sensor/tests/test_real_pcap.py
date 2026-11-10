from pathlib import Path

from sensor.cli import run

REAL = Path(__file__).resolve().parents[2] / "sample-data" / "zeek" / "real-modbus-testdata-part1"


def test_real_zeek_output_end_to_end():
    """Zeek 9.0.1 ile gerçek PCAP'ten (MODBUS-TestDataPart1.pcap) üretilmiş loglar."""
    res = run(REAL, "lab-001")
    ips = {o["device"]["ip"] for o in res["observations"]}
    assert ips == {"10.0.0.3", "10.0.0.8", "10.0.0.9", "10.0.0.57"}
    assert res["stats"]["rejected_records"] == 0
    modbus = [c for c in res["communications"] if c["destination_port"] == 502]
    assert len(modbus) == 3 and all(c["protocol_confidence"] == "observed" for c in modbus)
