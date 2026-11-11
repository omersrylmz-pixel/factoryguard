# PROJECT STATUS

**Güncel aşama:** Aşama 5 — Frontend Tamamlama ve CSV/PDF Raporlama ✅ TAMAMLANDI · Sıradaki: Aşama 6 (Sertleştirme ve Pilot Hazırlığı) · Son güncelleme: 2026-11-11

## Ortam
| Bileşen | Sürüm / durum |
|---|---|
| Windows 11 Pro + WSL2 | Ubuntu-24.04, Docker Engine 29.9.3, Compose v5.7.0 ✅ |
| Zeek | `zeek/zeek:latest` → 9.0.1 ✅ |
| PostgreSQL | `postgres:16` → 16.15, healthy (`127.0.0.1:5432`) ✅ |
| Backend | Python 3.13, FastAPI 0.162, SQLAlchemy 2.1, Alembic 1.20, Argon2-cffi (`127.0.0.1:8000`) ✅ |
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS v4, Nginx (`127.0.0.1:3000`) ✅ |

## Aşama 5 başarı kriteri — karşılandı
Kullanıcı arayüzdeki tüm 8 ana ekranı (Giriş, Genel Bakış, Cihaz Envanteri, Cihaz Detayı, Ağ Görünümü, Risk Merkezi, Sensörler, Raporlar + Ayarlar) sahte veri olmadan gerçek API'lerle kullanabiliyor; cihaz envanterini ve açıklanabilir yönetici/teknik risk bulgularını CSV (UTF-8 BOM) ve çok sayfalı A4 PDF olarak dışa aktarabiliyor.

## Tamamlananlar (Aşama 0 – Aşama 5)
- **Aşama 0:** Zeek JSON/TSV parser, normalizer, CLI, Docker tabanlı gerçek PCAP doğrulaması.
- **Aşama 1:** FastAPI modüler monolith (`auth`, `organizations`, `sites`, `zones`, `audit`), Argon2id + refresh rotasyonu, bileşik tenant FK, React arayüzü.
- **Aşama 2:** Sensör kayıt (`enroll`), SHA-256 fingerprint kimlik doğrulaması, heartbeat/sağlık kontrolü, ingestion + dedup + IP değişim geçmişi, `SensorExporter`, `SensorsPage`.
- **Aşama 3:** Kanıta dayalı cihaz sınıflandırma (`discovery/classifier.py`), merkezi cihaz envanteri API'si (`GET/PATCH /api/v1/assets`, `POST /api/v1/assets/import` CSV), `AssetsPage` ve `AssetDetailPage`.
- **Aşama 4:** `risk_findings`, `vulnerability_catalog`, `asset_vulnerabilities` modelleri + Alembic migration (`c41e77d29a04`); `/api/v1/communications` ve `/graph`; merkezi 100 puanlık risk puanlama modeli ve 5 temel açıklanabilir risk kuralı; `NetworkPage` ve `RisksPage`.
- **Aşama 5:**
  - **Saf Python PDF Üreticisi (`backend/app/modules/reports/pdf_writer.py`):** İşletim sistemi C kütüphanelerine (GTK/Cairo/wkhtmltopdf) bağımlı olmadan çok sayfalı A4 PDF 1.4 belgesi üretir.
  - **Raporlama API (`backend/app/modules/reports/router.py`):**
    - `GET /api/v1/reports/summary`: Varlık, açık risk, bölgeler arası iletişim ve sensör sağlık özeti.
    - `GET /api/v1/reports/inventory?format=csv|pdf`: Filtreli OT cihaz envanteri dışa aktarma + `audit_logs` (`report.export_inventory`) kaydı.
    - `GET /api/v1/reports/risks?format=csv|pdf`: Yönetici özeti + açıklanabilir teknik risk bulguları dışa aktarma + `audit_logs` (`report.export_risks`) kaydı.
  - **Frontend (`ReportsPage.tsx`, `apiDownload`):** Fabrika kapsamlı canlı yönetici özeti önizlemesi, filtreli CSV ve PDF indirme kartları.

## Bilinen sınırlamalar
- Giriş hız sınırlayıcısı (`LoginThrottle`) süreç içi bellekte çalışır.

## Son test sonuçları
- Sensör testleri: `pytest sensor/tests -v` → **16 passed**.
- Backend testleri (gerçek PostgreSQL `factoryguard_test` üzerinde): `pytest -v` → **49 passed**.
- Frontend tip kontrolü ve üretim derlemesi: `npm run build` (`tsc -b && vite build`) → **0 hata**.

## Sonraki hedef (Aşama 6 — Sertleştirme, Güvenlik Doğrulaması ve Pilot Hazırlığı)
- Kapsamlı güvenlik, tenant sızıntı, yetkisiz erişim (RBAC), bozuk girdi ve performans/yük testleri.
- Kurulum (`install`), sağlık kontrolü (`healthcheck`), yedekleme ve temiz kaldırma (`uninstall`) betikleri (`deployment/scripts/`).
- Pilot saha kontrol listesi ve nihai uçtan uca doğrulama.
