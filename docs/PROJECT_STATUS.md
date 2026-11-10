# PROJECT STATUS

**Güncel aşama:** Aşama 2 — Sensör ve Veri Aktarımı ✅ TAMAMLANDI · Sıradaki: Aşama 3 · Son güncelleme: 2026-11-10

## Ortam
| Bileşen | Sürüm / durum |
|---|---|
| Windows 11 Pro + WSL2 | Ubuntu-24.04, Docker Engine 29.9.3, Compose v5.7.0 ✅ |
| Zeek | `zeek/zeek:latest` → 9.0.1 ✅ |
| PostgreSQL | `postgres:16` → 16.15, healthy (`127.0.0.1:5432`) ✅ |
| Backend | Python 3.13, FastAPI 0.162, SQLAlchemy 2.1, Alembic 1.20, Argon2-cffi (`127.0.0.1:8000`) ✅ |
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS v4, Nginx (`127.0.0.1:3000`) ✅ |

## Aşama 2 başarı kriteri — karşılandı
Sensörden gelen normalize Zeek gözlem ve iletişim verileri (`sample-data/zeek/real-modbus-testdata-part1` dahil), `SensorExporter` üzerinden kimlik doğrulamalı (`X-Sensor-Token`) olarak FastAPI backend'e aktarılıp tekrarlanan kayıt kontrolünden (dedup) geçerek PostgreSQL'e (`assets`, `asset_identifiers`, `asset_observations`, `asset_communications`, `discovery_runs`) kaydedilebiliyor.

## Tamamlananlar (Aşama 0 + Aşama 1 + Aşama 2)
- **Aşama 0:** Zeek JSON/TSV parser, normalizer, CLI, Docker tabanlı gerçek PCAP doğrulaması.
- **Aşama 1:** FastAPI modüler monolith (`auth`, `organizations`, `sites`, `zones`, `audit`), Argon2id + refresh rotasyonu, bileşik tenant FK, React arayüzü (Giriş, Genel Bakış, Ayarlar) ve Docker Compose.
- **Aşama 2:**
  - **Veritabanı & Migration (`8f4c19a0b312`):** `sensors`, `discovery_runs`, `assets`, `asset_identifiers`, `asset_observations`, `asset_communications` tabloları ve bileşik tenant FK kısıtları.
  - **Sensör Yönetimi (`/api/v1/sensors`):**
    - `POST /enroll`: tek seferlik `fg_snr_...` anahtarı üretir, veritabanında yalnızca SHA-256 `credential_fingerprint` saklar ve audit log'a yazar.
    - `GET /sensors`, `GET /sensors/{id}` (son keşif çalışmalarıyla birlikte), `GET /sensors/{id}/health` ve `POST /sensors/heartbeat`.
    - Son görülme süresi eşik değeri (180 sn) aşan sensörlerin otomatik olarak `offline` raporlanması.
  - **Backend Ingestion (`/api/v1/ingest`):**
    - `POST /observations` ve `POST /communications`: `dedup_hash` ile mükerrer gözlem engelleme, aynı cihaz tekrar görüldüğünde mükerrer `Asset` üretmeme, IP değişiminde geçmişi `asset_identifiers` tablosunda koruma, paylaşılan MAC (gateway) durumunda yanlış birleştirme yapmama ve bilinmeyen cihaza tahmini üretici/tür atamama.
  - **Sensör Exporter (`sensor/exporter/http_exporter.py` & `sensor/cli.py export`):** Saf Python (stdlib `urllib`) HTTP aktarıcısı.
  - **Frontend (`SensorsPage.tsx`):** Sensör listesi, çevrimiçi/çevrimdışı durumu, yeni sensör kaydı (tek seferlik anahtar kutusu) ve keşif çalışmaları tablosu.

## Bilinen sınırlamalar
- Giriş hız sınırlayıcısı (`LoginThrottle`) süreç içi bellekte çalışır.
- Cihaz envanter listeleme, detay, manuel düzenleme ve CSV içe aktarma uç noktaları Aşama 3'te eklenecek.

## Son test sonuçları
- Sensör testleri: `pytest sensor -q` → **16 passed**.
- Backend testleri (gerçek PostgreSQL `factoryguard_test` üzerinde): `pytest` → **41 passed**.
- Frontend tip kontrolü ve üretim derlemesi: `npm run build` (`tsc -b && vite build`) → **0 hata**.

## Sonraki hedef (Aşama 3 — Cihaz Keşfi ve Envanter)
- `GET /api/v1/assets` (IP, MAC, tür, üretici, bölge, kritiklik, doğrulama durumu filtreleriyle), `GET /api/v1/assets/{id}` (kimlik geçmişi + gözlem geçmişi ile).
- `PATCH /api/v1/assets/{id}` (kullanıcı tarafından manuel düzenleme, doğrulama durumu `is_verified` ve audit log).
- `POST /api/v1/assets/import` (CSV üzerinden envanter içe aktarma).
- Kanıta dayalı, confidence puanlı cihaz sınıflandırma yardımcısı (`discovery` modülü).
- Frontend `AssetsPage` ve `AssetDetailPage`.
