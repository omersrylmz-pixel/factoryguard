"""FactoryGuard sensör CLI.

Kullanım:
  python -m sensor.cli normalize --logs <zeek_log_dizini> --sensor-id sensor-001 --out out.json
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

from sensor.normalizer.normalize import Normalizer
from sensor.parsers.zeek import discover_logs, read_zeek_log

# Sıra önemli: DNS hostname eşlemesi cihazlar oluştuktan sonra yapılır.
ORDER = ("conn", "dhcp", "modbus", "dns")


def run(log_dir: Path, sensor_id: str) -> dict:
    logs = discover_logs(log_dir)
    if "conn" not in logs:
        raise FileNotFoundError(f"{log_dir} içinde conn.log bulunamadı")
    n = Normalizer(sensor_id)
    for name in ORDER:
        if name in logs:
            handler = getattr(n, f"add_{name}")
            for rec in read_zeek_log(logs[name]):
                handler(rec)
    return {
        "sensor_id": sensor_id,
        "schema_version": "0.1",
        "logs_used": sorted(logs),
        "observations": n.observations(),
        "communications": n.communications(),
        "stats": {"devices": len(n.devices), "communications": len(n.comms), "rejected_records": n.rejected},
    }


def main(argv=None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    p = argparse.ArgumentParser(prog="factoryguard-sensor")
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("normalize", help="Zeek loglarını normalize JSON'a çevir")
    s.add_argument("--logs", required=True, type=Path)
    s.add_argument("--sensor-id", required=True)
    s.add_argument("--out", type=Path)
    a = p.parse_args(argv)
    result = run(a.logs, a.sensor_id)
    text = json.dumps(result, ensure_ascii=False, indent=2)
    if a.out:
        a.out.write_text(text, encoding="utf-8")
        logging.info("Yazıldı: %s  %s", a.out, result["stats"])
    else:
        sys.stdout.write(text + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
