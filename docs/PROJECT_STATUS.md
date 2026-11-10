# PROJECT STATUS

**Güncel aşama:** Aşama 4 — Ağ İlişkileri ve Kural Tabanlı Risk Motoru ✅ TAMAMLANDI · Sıradaki: Aşama 5 · Son güncelleme: 2026-11-11

## Ortam
| Bileşen | Sürüm / durum |
|---|---|
| Windows 11 Pro + WSL2 | Ubuntu-24.04, Docker Engine 29.9.3, Compose v5.7.0 ✅ |
| Zeek | `zeek/zeek:latest` → 9.0.1 ✅ |
| PostgreSQL | `postgres:16` → 16.15, healthy (`127.0.0.1:5432`) ✅ |
| Backend | Python 3.13, FastAPI 0.162, SQLAlchemy 2.1, Alembic 1.20, Argon2-cffi (`127.0.0.1:8000`) ✅ |
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS v4, Nginx (`127.0.0.1:3000`) ✅ |

## Aşama 4 başarı kriteri — karşılandı
Test verisindeki olaylar için açıklanabilir bulgular (`why_triggered`, `evidence_json`, `recommended_action`, `confidence`, `risk_score`, `score_breakdown`) üretiliyor; ağ ilişkileri tablo ve topoloji grafiği (`GET /api/v1/communications`, `GET /api/v1/communications/graph`) olarak sorgulanabiliyor; risk durumları (`open`, `investigating`, `accepted`, `resolved`, `false_positive`) denetim kaydıyla (`audit_logs`) yönetilebiliyor.

## Tamamlananlar (Aşama 0 – Aşama 4)
- **Aşama 0:** Zeek JSON/TSV parser, normalizer, CLI, Docker tabanlı gerçek PCAP doğrulaması.
- **Aşama 1:** FastAPI modüler monolith (`auth`, `organizations`, `sites`, `zones`, `audit`), Argon2id + refresh rotasyonu, bileşik tenant FK, React arayüzü (Giriş, Genel Bakış, Ayarlar).
- **Aşama 2:** Sensör kayıt (`enroll`), SHA-256 fingerprint kimlik doğrulaması, heartbeat/sağlık kontrolü, ingestion + dedup + IP değişim geçmişi, `SensorExporter`, `SensorsPage`.
- **Aşama 3:** Kanıta dayalı cihaz sınıflandırma (`discovery/classifier.py`), merkezi cihaz envanteri API'si (`GET/PATCH /api/v1/assets`, `POST /api/v1/assets/import` CSV), `AssetsPage` ve `AssetDetailPage`.
- **Aşama 4:**
  - **Veri Modeli (`backend/app/models/risk.py` + Alembic `c41e77d29a04`):** `risk_findings` (bileşik tenant FK + dedup anahtarı), `vulnerability_catalog` ve `asset_vulnerabilities` tabloları.
  - **Ağ İlişkileri API (`backend/app/modules/communications/router.py`):** `GET /api/v1/communications` (filtreli akış listesi) ve `GET /api/v1/communications/graph` (düğüm/kenar topoloji verisi + bölgeler arası bayrağı).
  - **Merkezi Risk Puanlama (`backend/app/modules/risk_engine/scoring.py`):** 0–100 puanlık açık ve değiştirilebilir model (Cihaz Kritikliği 30 + Ağ Maruziyeti 25 + Doğrulanmış Zafiyet 25 + Beklenmeyen Davranış 10 + Envanter Eksikliği 10). `risk_score` ile `confidence` (0.0–1.0) ayrı tutulur.
  - **Açıklanabilir Kural Tabanlı Risk Motoru (`backend/app/modules/risk_engine/service.py`):**
    1. `NEW_ASSET`: Doğrulanmamış yeni cihaz tespiti (cihaz doğrulandığında otomatik `resolved` olur).
    2. `UNKNOWN_OT_ASSET`: Endüstriyel protokol konuşan ancak kimliği doğrulanmamış cihaz.
    3. `UNEXPECTED_COMMUNICATION`: Bölgeler arası (cross-zone) veya OT protokolü üzerinden alışılmadık erişim.
    4. `UNAPPROVED_REMOTE_PATH`: OT/SCADA cihazlarına RDP/VNC/SSH/Telnet/TeamViewer/AnyDesk erişimi.
    5. `KNOWN_VULNERABILITY`: Yalnızca doğrulanmış üretici + model + tam firmware sürümü eşleştiğinde katalog zafiyeti üretir; eksik kanıtta kesin CVE iddiasında bulunmaz.
  - **Frontend (`NetworkPage.tsx`, `RisksPage.tsx`, `DashboardPage.tsx`, `AssetDetailPage.tsx`):** Etkileşimli SVG topoloji haritası + iletişim tablosu, açıklanabilir risk bulguları ekranı ve durum yönetimi.

## Bilinen sınırlamalar
- Giriş hız sınırlayıcısı (`LoginThrottle`) süreç içi bellekte çalışır.
- CSV ve PDF yönetici/teknik rapor dışa aktarma uç noktaları (`/api/v1/reports/*`) ve `ReportsPage.tsx` Aşama 5'te eklenecek.

## Son test sonuçları
- Sensör testleri: `pytest sensor/tests -v` → **16 passed**.
- Backend testleri (gerçek PostgreSQL `factoryguard_test` üzerinde): `pytest -v` → **47 passed**.
- Frontend tip kontrolü ve üretim derlemesi: `npm run build` (`tsc -b && vite build`) → **0 hata**.

## Sonraki hedef (Aşama 5 — Frontend Tamamlama ve CSV/PDF Raporlama)
- `GET /api/v1/reports/inventory` (CSV ve PDF envanter raporu).
- `GET /api/v1/reports/risks` (CSV ve PDF yönetici özeti + teknik risk bulguları raporu).
- `frontend/src/pages/ReportsPage.tsx` ve uçtan uca kullanıcı akışı doğrulaması.
