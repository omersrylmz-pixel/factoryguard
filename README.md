# FactoryGuard Lite

Pasif OT cihaz keşfi, merkezi envanter ve açıklanabilir risk yönetimi (KOBİ fabrikaları için).

Durum: **Aşama 1 (Uygulama Altyapısı) tamamlandı** — bkz. [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md).

## Hızlı başlangıç (Docker Compose ile tam yığın)
```powershell
docker compose -f deployment/compose.yaml up -d --build
# İlk sahip kullanıcıyı ve organizasyonu oluşturun:
docker compose -f deployment/compose.yaml exec -e FG_INITIAL_PASSWORD="guvenli-parola-123" backend `
  python -m app.cli create-owner --email admin@fabrika.com --full-name "Sistem Yöneticisi" --org-name "Örnek Fabrika A.Ş."
```
Web arayüzü: `http://127.0.0.1:3000` · API sağlık kontrolü: `http://127.0.0.1:8000/api/v1/health`

## Yerel geliştirme ve testler
```powershell
# Sensör (Aşama 0)
.\.venv\Scripts\python -m pytest sensor -q

# Backend (Aşama 1 — PostgreSQL container'ı çalışıyor olmalı)
cd backend
..\.venv\Scripts\python -m pytest

# Frontend
cd ..\frontend
npm run build
```

## Proje yapısı
- `backend/` — FastAPI modüler monolith (`auth`, `organizations`, `sites`, `zones`, `audit`), SQLAlchemy 2, Alembic
- `frontend/` — React 19 + TypeScript + Vite + Tailwind CSS v4 + TanStack Query
- `sensor/` — Zeek log parser + normalizer (yalnızca pasif)
- `sample-data/` — Sentetik demo logları ve gerçek Zeek regresyon çıktıları
- `deployment/` — Docker Compose ve lab script'leri
- `docs/` — Proje durumu, mimari kararlar, yol haritası, güvenlik modeli
