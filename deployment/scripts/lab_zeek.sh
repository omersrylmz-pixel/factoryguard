#!/usr/bin/env bash
# FactoryGuard Lab — Ubuntu Server LTS VM üzerinde bir PCAP'i Zeek ile analiz eder.
# YALNIZCA PASİF: dosyadan okur (zeek -r). Ağa paket göndermez.
# Kullanım: ./lab_zeek.sh <dosya.pcap> [sensor-id]
set -euo pipefail
PCAP="${1:?PCAP dosyası verin}"
SENSOR="${2:-lab-sensor-001}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/lab-output/$(basename "$PCAP" .pcap)"

if ! command -v zeek >/dev/null; then
  cat <<'EOF'
Zeek bulunamadı. Ubuntu 22.04/24.04 için resmi OpenSUSE Build Service deposu:
  https://software.opensuse.org/download.html?project=security:zeek&package=zeek
Kurulumdan sonra: export PATH=/opt/zeek/bin:$PATH
EOF
  exit 1
fi

mkdir -p "$OUT"
( cd "$OUT" && zeek -C -r "$(realpath "$PCAP")" LogAscii::use_json=T \
    policy/protocols/conn/mac-logging )
python3 -m sensor.cli normalize --logs "$OUT" --sensor-id "$SENSOR" --out "$OUT/normalized.json"
echo "Çıktı: $OUT/normalized.json"
