# NEXT SESSION

## En son ne yapıldı (2026-11-09)
Ortam incelendi (yalnızca README vardı; Docker/WSL yok). Aşama 0 için sensör normalizer kuruldu ve test edildi.

## Değişen dosyalar
- `sensor/parsers/zeek.py`, `sensor/normalizer/normalize.py`, `sensor/cli.py`, `sensor/tests/test_normalizer.py`
- `sample-data/zeek/lab-basic/*` (SENTETİK), `sample-data/README.md`, `sample-data/zeek/lab-basic.normalized.json`
- `deployment/scripts/lab_zeek.sh`, `docs/*`, `README.md`, `.gitignore`

## Çalıştırılan testler
`.venv\Scripts\python -m pytest sensor -q` → **10 passed**.
CLI: sentetik loglardan 7 cihaz, 4 iletişim, 1 reddedilen kayıt, 1 bozuk JSON satırı atlandı.

## Kalan
- Zeek gerçek ortamda çalıştırılmadı (Ubuntu VM gerekiyor).

## Bir sonraki oturumda ilk iş
1. Kullanıcının Docker Desktop (WSL2) veya Ubuntu VM kurup kurmadığını sor.
2. Aşama 1: `backend/` FastAPI + SQLAlchemy + Alembic iskeleti, organizations/sites/zones/users/memberships modelleri, auth.
   PostgreSQL yoksa geçici olarak testler için SQLite KULLANMA (JSONB/RLS farkı) — PostgreSQL kurulumu gerekli.
