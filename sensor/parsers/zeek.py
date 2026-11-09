"""Zeek log okuyucu.

Zeek iki formatta log yazabilir:
  * JSON (LogAscii::use_json=T) — satır başına bir JSON nesnesi
  * TSV (varsayılan) — '#fields' başlığıyla sekmeyle ayrılmış

Bu modül yalnızca okur; hiçbir ağ işlemi yapmaz.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Iterator

log = logging.getLogger(__name__)

SUPPORTED_LOGS = ("conn", "dns", "dhcp", "modbus")


def _parse_tsv_value(value: str, unset: str, empty: str):
    if value == unset:
        return None
    if value == empty:
        return ""
    return value


def read_zeek_log(path: Path) -> Iterator[dict]:
    """Bir Zeek log dosyasındaki kayıtları dict olarak döndürür.

    Bozuk satırlar atlanır ve loglanır (pipeline durmaz).
    """
    path = Path(path)
    fields: list[str] | None = None
    types: list[str] | None = None
    sep, unset, empty = "\t", "-", "(empty)"
    with path.open("r", encoding="utf-8", errors="replace") as fh:
        for lineno, raw in enumerate(fh, 1):
            line = raw.rstrip("\r\n")
            if not line:
                continue
            if line.startswith("#"):
                if line.startswith("#separator"):
                    sep = line.split(" ", 1)[1].encode().decode("unicode_escape")
                elif line.startswith("#unset_field"):
                    unset = line.split(sep, 1)[1]
                elif line.startswith("#empty_field"):
                    empty = line.split(sep, 1)[1]
                elif line.startswith("#fields"):
                    fields = line.split(sep)[1:]
                elif line.startswith("#types"):
                    types = line.split(sep)[1:]
                continue
            if line.lstrip().startswith("{"):
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError as exc:
                    log.warning("%s:%d geçersiz JSON atlandı: %s", path.name, lineno, exc)
                    continue
                if isinstance(rec, dict):
                    yield rec
                continue
            if fields is None:
                log.warning("%s:%d başlıksız TSV satırı atlandı", path.name, lineno)
                continue
            parts = line.split(sep)
            if len(parts) != len(fields):
                log.warning("%s:%d alan sayısı uyumsuz, atlandı", path.name, lineno)
                continue
            rec = {}
            for i, (k, v) in enumerate(zip(fields, parts)):
                val = _parse_tsv_value(v, unset, empty)
                t = types[i] if types and i < len(types) else ""
                if val not in (None, ""):
                    if t in ("count", "port", "int"):
                        try:
                            val = int(val)
                        except ValueError:
                            pass
                    elif t in ("time", "interval", "double"):
                        try:
                            val = float(val)
                        except ValueError:
                            pass
                    elif t.startswith(("set[", "vector[")):
                        val = val.split(",")
                rec[k] = val
            yield rec


def discover_logs(log_dir: Path) -> dict[str, Path]:
    """Dizindeki desteklenen Zeek loglarını bulur (conn.log veya conn.json)."""
    found: dict[str, Path] = {}
    for name in SUPPORTED_LOGS:
        for ext in (".log", ".json"):
            p = Path(log_dir) / f"{name}{ext}"
            if p.exists():
                found[name] = p
                break
    return found
