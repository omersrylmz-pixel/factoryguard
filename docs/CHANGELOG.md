# CHANGELOG

## 2026-11-09
- Proje iskeleti, sensör Zeek parser + normalizer + CLI, sentetik örnek loglar, testler, lab script, proje dokümanları.

## 2026-11-10
- Docker Desktop + WSL2 ortamı doğrulandı; Zeek 9.0.1 (resmî imaj) ve PostgreSQL 16 container'ı.
- Gerçek PCAP ile Aşama 0 E2E doğrulaması; iletişim kaydı bölünme hatası düzeltildi; lab script stderr düzeltmesi.
- Aşama 1 tamamlandı: FastAPI modüler monolith (`auth`, `organizations`, `sites`, `zones`, `audit`), SQLAlchemy 2 modelleri, Alembic migration, Argon2id + refresh rotasyonu, bileşik tenant FK, 33 PostgreSQL entegrasyon testi, React + TypeScript + Tailwind v4 arayüzü (Giriş, Genel Bakış, Ayarlar) ve Docker Compose (`postgres` + `backend` + `frontend`).
- Aşama 2 tamamlandı: `sensors`, `discovery_runs`, `assets`, `asset_identifiers`, `asset_observations`, `asset_communications` modelleri ve Alembic migration'ı; sensör kayıt (`enroll`), SHA-256 fingerprint kimlik doğrulaması, heartbeat/sağlık kontrolü, ingestion + dedup + IP değişim geçmişi, `sensor/exporter/http_exporter.py` ve frontend `SensorsPage`.
- Aşama 3 tamamlandı: Kanıta dayalı cihaz sınıflandırma (`discovery/classifier.py`), merkezi cihaz envanteri API'si (`GET /api/v1/assets`, `GET /api/v1/assets/{id}`, `PATCH /api/v1/assets/{id}`, `POST /api/v1/assets/import` CSV içe aktarma), Frontend `AssetsPage` ve `AssetDetailPage`.

## 2026-11-11
- Aşama 4 tamamlandı: `risk_findings`, `vulnerability_catalog`, `asset_vulnerabilities` modelleri ve Alembic migration (`c41e77d29a04`); ağ iletişimleri ve topoloji grafiği API'si (`GET /api/v1/communications`, `GET /api/v1/communications/graph`); merkezi 100 puanlık risk puanlama modeli (`risk_engine/scoring.py`) ve 5 temel açıklanabilir risk kuralı (`NEW_ASSET`, `UNKNOWN_OT_ASSET`, `UNEXPECTED_COMMUNICATION`, `UNAPPROVED_REMOTE_PATH`, `KNOWN_VULNERABILITY`); risk yönetimi ve zafiyet kataloğu uç noktaları (`/api/v1/risks`, `/api/v1/vulnerabilities/catalog`); Frontend `NetworkPage.tsx` ve `RisksPage.tsx`.
- Aşama 5 tamamlandı: Saf Python çok sayfalı PDF 1.4 üreticisi (`reports/pdf_writer.py`), yönetici özeti ve CSV/PDF dışa aktarma uç noktaları (`GET /api/v1/reports/summary`, `GET /api/v1/reports/inventory`, `GET /api/v1/reports/risks`), denetim kaydı entegrasyonu, kimlik doğrulamalı `apiDownload` istemcisi ve `ReportsPage.tsx`.
- Aşama 6 tamamlandı: Gerçek PCAP'ten PDF rapora E2E doğrulama, RBAC matrisi, SQLi/bozuk girdi dayanıklılığı ve 80 cihaz + 120 akış performans testleri (`backend/tests/test_hardening.py`); `python -m app.cli seed-demo`, `deployment/scripts/healthcheck.ps1`, `deployment/scripts/uninstall.ps1` ve `docs/PILOT_CHECKLIST.md`; toplam 53 PostgreSQL backend testi + 16 sensör testi başarılı.
