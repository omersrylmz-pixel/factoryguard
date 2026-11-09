# FactoryGuard Lite

Pasif OT cihaz keşfi, merkezi envanter ve açıklanabilir risk yönetimi (KOBİ fabrikaları için).

Durum: Aşama 0 (Laboratuvar) — bkz. `docs/PROJECT_STATUS.md`.

## Hızlı başlangıç (sensör normalizer)
```powershell
python -m venv .venv
.\.venv\Scripts\pip install -r sensor\requirements-dev.txt
.\.venv\Scripts\python -m pytest sensor -q
.\.venv\Scripts\python -m sensor.cli normalize --logs sample-data\zeek\lab-basic --sensor-id lab-001
```
Gerçek PCAP (Ubuntu VM + Zeek): `deployment/scripts/lab_zeek.sh dosya.pcap`

## Yapı
- `sensor/` — Zeek log parser + normalizer (yalnızca pasif)
- `sample-data/` — SENTETİK demo Zeek logları
- `deployment/` — lab ve kurulum script'leri
- `docs/` — durum, kararlar, yol haritası, güvenlik modeli
