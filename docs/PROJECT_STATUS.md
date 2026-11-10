# PROJECT STATUS

**Güncel aşama:** Aşama 3 — Cihaz Keşfi ve Merkezi Envanter ✅ TAMAMLANDI · Sıradaki: Aşama 4 · Son güncelleme: 2026-11-10

## Ortam
| Bileşen | Sürüm / durum |
|---|---|
| Windows 11 Pro + WSL2 | Ubuntu-24.04, Docker Engine 29.9.3, Compose v5.7.0 ✅ |
| Zeek | `zeek/zeek:latest` → 9.0.1 ✅ |
| PostgreSQL | `postgres:16` → 16.15, healthy (`127.0.0.1:5432`) ✅ |
| Backend | Python 3.13, FastAPI 0.162, SQLAlchemy 2.1, Alembic 1.20, Argon2-cffi (`127.0.0.1:8000`) ✅ |
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS v4, Nginx (`127.0.0.1:3000`) ✅ |

## Aşama 3 başarı kriteri — karşılandı
Test trafiğinde görülen cihazlar kanıta dayalı güven puanıyla (`confidence`) envantere ekleniyor, tüm filtrelerle sorgulanabiliyor, kullanıcı tarafından düzenlenip doğrulanabiliyor (`PATCH /api/v1/assets/{id}`) ve CSV üzerinden toplu içe aktarılabiliyor (`POST /api/v1/assets/import`).

## Tamamlananlar (Aşama 0 – Aşama 3)
- **Aşama 0:** Zeek JSON/TSV parser, normalizer, CLI, Docker tabanlı gerçek PCAP doğrulaması.
- **Aşama 1:** FastAPI modüler monolith (`auth`, `organizations`, `sites`, `zones`, `audit`), Argon2id + refresh rotasyonu, bileşik tenant FK, React arayüzü (Giriş, Genel Bakış, Ayarlar).
- **Aşama 2:** Sensör kayıt (`enroll`), SHA-256 fingerprint kimlik doğrulaması, heartbeat/sağlık kontrolü, ingestion + dedup + IP değişim geçmişi, `SensorExporter`, `SensorsPage`.
- **Aşama 3:**
  - **Kanıta Dayalı Sınıflandırma (`backend/app/modules/discovery/classifier.py`):** Tahmini üretici/model atamadan, gözlemlenen protokol ve hostname kanıtlarına göre `"Bilinmeyen cihaz"`, `"Muhtemel endüstriyel cihaz (MODBUS gözlendi)"`, `"Üretici bilgisi doğrulanmadı"` etiketleri ve `confidence` hesaplama.
  - **Merkezi Envanter API (`/api/v1/assets`):**
    - `GET /assets`: IP, MAC, cihaz türü, üretici, bölge, kritiklik, doğrulama durumu (`is_verified`) ve metin arama filtreleri.
    - `GET /assets/{id}`: Cihaz detayı + sınıflandırma gerekçeleri + kimlik geçmişi (`identifiers`) + gözlem geçmişi (`observations`) + iletişim ilişkileri (`communications`).
    - `PATCH /assets/{id}`: En az `analyst` rolüyle manuel düzenleme, bölge atama, doğrulama (`is_verified=True` → `confidence=1.0`) ve eski/yeni değer farklarıyla `audit_logs` kaydı.
    - `POST /assets/import`: CSV ile toplu cihaz ekleme/güncelleme ve satır bazlı hata raporlama.
  - **Frontend (`AssetsPage.tsx`, `AssetDetailPage.tsx`):** Filtreli cihaz envanteri tablosu, CSV içe aktarma arayüzü, cihaz detay ve düzenleme/doğrulama ekranı.

## Bilinen sınırlamalar
- Giriş hız sınırlayıcısı (`LoginThrottle`) süreç içi bellekte çalışır.
- Ağ topoloji/graf görünümü (`GET /api/v1/communications/graph`) ve kural tabanlı risk motoru (`/api/v1/risks`) Aşama 4'te eklenecek.

## Son test sonuçları
- Sensör testleri: `pytest sensor -q` → **16 passed**.
- Backend testleri (gerçek PostgreSQL `factoryguard_test` üzerinde): `pytest` → **45 passed**.
- Frontend tip kontrolü ve üretim derlemesi: `npm run build` (`tsc -b && vite build`) → **0 hata**.

## Sonraki hedef (Aşama 4 — Ağ İlişkileri ve Risk Motoru)
- `risk_findings`, `vulnerability_catalog`, `asset_vulnerabilities` tabloları + Alembic migration.
- `GET /api/v1/communications` ve `GET /api/v1/communications/graph`.
- Açıklanabilir kural tabanlı risk motoru (`NEW_ASSET`, `UNKNOWN_OT_ASSET`, `UNEXPECTED_COMMUNICATION`, `UNAPPROVED_REMOTE_PATH`, `KNOWN_VULNERABILITY`) + merkezi değiştirilebilir 100 puanlık risk puanlama modeli + durum yönetimi (`Open`, `Investigating`, `Accepted`, `Resolved`, `False Positive`).
