# PROJECT STATUS

**Güncel aşama:** Aşama 1 — Uygulama Altyapısı ✅ TAMAMLANDI · Sıradaki: Aşama 2 · Son güncelleme: 2026-11-10

## Ortam
| Bileşen | Sürüm / durum |
|---|---|
| Windows 11 Pro + WSL2 | Ubuntu-24.04, Docker Engine 29.9.3, Compose v5.7.0 ✅ |
| Zeek | `zeek/zeek:latest` → 9.0.1 ✅ |
| PostgreSQL | `postgres:16` → 16.15, healthy (`127.0.0.1:5432`) ✅ |
| Backend | Python 3.13, FastAPI 0.162, SQLAlchemy 2.1, Alembic 1.20, Argon2-cffi (`127.0.0.1:8000`) ✅ |
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS v4, Nginx (`127.0.0.1:3000`) ✅ |

## Aşama 1 başarı kriteri — karşılandı
Kullanıcı giriş yapabiliyor, fabrika (`sites`) ve üretim hattı/bölge (`zones`) kaydı oluşturabiliyor, veritabanı üzerinden tenant-izole şekilde veri okuyup yazabiliyor ve tüm yazma işlemleri `audit_logs` tablosuna kaydediliyor.

## Tamamlananlar (Aşama 0 + Aşama 1)
- **Aşama 0:** Zeek JSON/TSV parser, normalizer, CLI, Docker tabanlı gerçek PCAP doğrulaması (13 test).
- **Aşama 1 Veritabanı & Migration:** `organizations`, `sites`, `zones`, `users`, `memberships`, `refresh_tokens`, `audit_logs` tabloları ve `20261110_238a86522076_initial_tenancy_auth_audit` Alembic migration'ı (upgrade + downgrade test edildi).
- **Aşama 1 Backend Modülleri (`/api/v1/`):**
  - `auth`: `POST /login`, `POST /refresh`, `POST /logout`, `GET /me` + `python -m app.cli create-owner`.
  - `organizations`: listeleme, oluşturma, detay, güncelleme, üye listesi.
  - `sites`: CRUD + bağlı bölge varken silmeyi engelleme (409).
  - `zones`: CRUD + kritiklik doğrulaması + bileşik `(site_id, organization_id)` FK ile tenant koruması.
  - `audit`: tüm yazma ve kritik auth olaylarını kaydetme + `GET /audit-logs`.
- **Aşama 1 Frontend:** Türkçe B2B endüstriyel arayüz; Giriş, Genel Bakış (yalnızca gerçek backend verisi; Aşama 2–4 metrikleri dürüstçe aşama etiketiyle işaretli) ve Ayarlar (Organizasyon, Fabrika ekle/sil, Bölge ekle/sil, Kullanıcılar, Denetim Kayıtları).
- **Dağıtım:** `deployment/compose.yaml` içinde `postgres`, `backend` ve `frontend` (Nginx `/api` reverse proxy ile aynı origin).

## Bilinen sınırlamalar
- Giriş hız sınırlayıcısı (`LoginThrottle`) süreç içi bellekte çalışır; tek süreçli local-first kurulum için yeterlidir, çok işçili (multi-worker) dağıtımda paylaşımlı depoya taşınmalıdır.
- Henüz kullanıcı davet/parola sıfırlama ekranı yok; ilk sahip kullanıcı CLI (`app.cli create-owner`) ile oluşturulur.
- HTTPS sonlandırma Aşama 6'da eklenecek; geliştirme ortamında servisler yalnızca `127.0.0.1` üzerinde dinler.

## Son test sonuçları
- Sensör testleri: `pytest sensor -q` → **13 passed**.
- Backend testleri (gerçek PostgreSQL `factoryguard_test` üzerinde): `pytest` → **33 passed**.
- Frontend tip kontrolü ve üretim derlemesi: `npm run build` (`tsc -b && vite build`) → **başarılı**.

## Sonraki hedef (Aşama 2 — Sensör ve veri aktarımı)
- `sensors` ve `discovery_runs` tabloları + Alembic migration.
- Sensör kayıt (`POST /api/v1/sensors/enroll`), listeleme, detay, sağlık/heartbeat (`GET /api/v1/sensors/{id}/health`) ve sensör kimlik doğrulaması (credential + fingerprint).
- `POST /api/v1/ingest/observations` ve `POST /api/v1/ingest/communications` + tekrarlanan kayıt kontrolü.
- Sensör exporter modülü (`sensor/exporter/`).
