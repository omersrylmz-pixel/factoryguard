# PROJECT STATUS

**Güncel aşama:** Aşama 6 — Sertleştirme, Güvenlik Doğrulaması ve Pilot Hazırlığı ✅ TAMAMLANDI (MVP Aşama 0–6 Tamamlandı) · Son güncelleme: 2026-11-11

## Ortam
| Bileşen | Sürüm / durum |
|---|---|
| Windows 11 Pro + WSL2 | Ubuntu-24.04, Docker Engine 29.9.3, Compose v5.7.0 ✅ |
| Zeek | `zeek/zeek:latest` → 9.0.1 ✅ |
| PostgreSQL | `postgres:16` → 16.15, healthy (`127.0.0.1:5432`) ✅ |
| Backend | Python 3.13, FastAPI 0.162, SQLAlchemy 2.1, Alembic 1.20, Argon2-cffi (`127.0.0.1:8000`) ✅ |
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS v4, Nginx (`127.0.0.1:3000`) ✅ |

## Aşama 6 başarı kriteri — karşılandı
Gerçek Zeek 9.0.1 PCAP çıktısından (`MODBUS-TestDataPart1.pcap`) başlayıp sensör normalizer, HTTP exporter, PostgreSQL ingestion, kanıta dayalı cihaz envanteri, topoloji grafiği, 5 kurallı açıklanabilir risk motoru ve CSV/PDF raporlamaya kadar tüm akış uçtan uca otomatik testlerle doğrulandı; RBAC, tenant izolasyonu, bozuk girdi/SQLi dayanıklılığı ve toplu yük performansı (< 5 sn) kanıtlandı; kurulum, sağlık kontrolü, temiz kaldırma betikleri ve pilot kontrol listesi hazırlandı.

## Tamamlananlar (Aşama 0 – Aşama 6)
- **Aşama 0:** Zeek JSON/TSV parser, normalizer, CLI, Docker tabanlı gerçek PCAP doğrulaması.
- **Aşama 1:** FastAPI modüler monolith (`auth`, `organizations`, `sites`, `zones`, `audit`), Argon2id + refresh rotasyonu, bileşik tenant FK, React arayüzü.
- **Aşama 2:** Sensör kayıt (`enroll`), SHA-256 fingerprint kimlik doğrulaması, heartbeat/sağlık kontrolü, ingestion + dedup + IP değişim geçmişi, `SensorExporter`, `SensorsPage`.
- **Aşama 3:** Kanıta dayalı cihaz sınıflandırma (`discovery/classifier.py`), merkezi cihaz envanteri API'si (`GET/PATCH /api/v1/assets`, `POST /api/v1/assets/import` CSV), `AssetsPage` ve `AssetDetailPage`.
- **Aşama 4:** `risk_findings`, `vulnerability_catalog`, `asset_vulnerabilities` modelleri + Alembic migration (`c41e77d29a04`); `/api/v1/communications` ve `/graph`; merkezi 100 puanlık risk puanlama modeli ve 5 temel açıklanabilir risk kuralı; `NetworkPage` ve `RisksPage`.
- **Aşama 5:** Saf Python çok sayfalı PDF 1.4 üreticisi (`reports/pdf_writer.py`), `/api/v1/reports/summary`, `/api/v1/reports/inventory`, `/api/v1/reports/risks` ve `ReportsPage.tsx`.
- **Aşama 6:**
  - **Sertleştirme ve Uçtan Uca Pilot Testleri (`backend/tests/test_hardening.py`):** Gerçek PCAP → Normalizer → Exporter → Ingestion → Envanter → Topoloji → Risk → PDF/CSV E2E testi; tüm uç noktalarda RBAC (401/403) matrisi; SQLi/bozuk girdi dayanıklılık testi; 80 cihaz + 120 akış toplu yük performans testi.
  - **Canlı Demo & Saha Hazırlık Araçları:** `python -m app.cli seed-demo`, `deployment/scripts/healthcheck.ps1`, `deployment/scripts/uninstall.ps1`, `docs/PILOT_CHECKLIST.md`.

## Son test sonuçları
- Sensör testleri: `pytest sensor/tests -v` → **16 passed**.
- Backend testleri (gerçek PostgreSQL `factoryguard_test` üzerinde): `pytest -v` → **53 passed**.
- Frontend tip kontrolü ve üretim derlemesi: `npm run build` (`tsc -b && vite build`) → **0 hata**.
