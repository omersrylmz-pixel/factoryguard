# CHANGELOG

## 2026-11-09
- Proje iskeleti, sensör Zeek parser + normalizer + CLI, sentetik örnek loglar, testler, lab script, proje dokümanları.

## 2026-11-10
- Docker Desktop + WSL2 ortamı doğrulandı; Zeek 9.0.1 (resmî imaj) ve PostgreSQL 16 container'ı.
- Gerçek PCAP ile Aşama 0 E2E doğrulaması; iletişim kaydı bölünme hatası düzeltildi; lab script stderr düzeltmesi.
- Aşama 1 tamamlandı: FastAPI modüler monolith (`auth`, `organizations`, `sites`, `zones`, `audit`), SQLAlchemy 2 modelleri, Alembic migration, Argon2id + refresh rotasyonu, bileşik tenant FK, 33 PostgreSQL entegrasyon testi, React + TypeScript + Tailwind v4 arayüzü (Giriş, Genel Bakış, Ayarlar) ve Docker Compose (`postgres` + `backend` + `frontend`).
