# FactoryGuard Lab — Docker (WSL2) üzerinde gerçek PCAP'i resmî Zeek imajıyla analiz eder.
# YALNIZCA PASİF: dosyadan okur (zeek -r), container ağsız çalışır (--network none).
# Kullanım: .\deployment\scripts\lab_zeek_docker.ps1 -Pcap sample-data\pcap\x.pcap [-SensorId lab-001]
param(
  [Parameter(Mandatory=$true)][string]$Pcap,
  [string]$SensorId = "lab-sensor-001",
  [string]$ZeekImage = "zeek/zeek:latest"
)
$ErrorActionPreference = "Stop"
$root = Resolve-Path "$PSScriptRoot\..\.."
$pcapFull = Resolve-Path $Pcap
$name = [IO.Path]::GetFileNameWithoutExtension($pcapFull)
$out = Join-Path $root "lab-output\$name"
New-Item -ItemType Directory -Force $out | Out-Null

docker run --rm --network none `
  -v "$(Split-Path $pcapFull):/pcap:ro" -v "${out}:/out" -w /out $ZeekImage `
  zeek -C -r "/pcap/$(Split-Path $pcapFull -Leaf)" LogAscii::use_json=T policy/protocols/conn/mac-logging
if ($LASTEXITCODE -ne 0) { throw "Zeek başarısız (exit $LASTEXITCODE)" }

# Python INFO logları stderr'e yazar; PowerShell bunu hata saymasın, exit code'a bak.
$ErrorActionPreference = "Continue"
Push-Location $root
try { & "$root\.venv\Scripts\python.exe" -m sensor.cli normalize --logs $out --sensor-id $SensorId --out "$out\normalized.json" 2>&1 | ForEach-Object { "$_" } }
finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { throw "Normalizer başarısız (exit $LASTEXITCODE)" }
Write-Host "Çıktı: $out\normalized.json"
