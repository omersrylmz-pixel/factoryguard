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

## 2026-11-15
- Faz 1: Web Arayüzünden Tek Tıkla PCAP / Zeek Log Yükleme (`sensor/parsers/pcap_binary.py`, `POST /api/v1/sensors/{id}/analyze-upload`, `SensorsPage.tsx`).
- Faz 2: Endüstriyel MAC OUI üretici sözlüğü (`Siemens`, `Rockwell`, `Schneider`, `Beckhoff`, `ABB`, `Moxa`, `Phoenix Contact` vb.) ve tehlikeli Modbus yazma fonksiyonları (`WRITE_SINGLE_COIL`, `WRITE_MULTIPLE_REGISTERS` vb.) tespiti.
- Faz 3: İletişim Baseline Onaylama (`POST /api/v1/communications/{id}/approve-baseline`, `POST /api/v1/communications/approve-all-baseline`) ve SIEM CEF (Common Event Format) Syslog dışa aktarma (`GET /api/v1/reports/siem-cef`).
- Faz 4: `pcap_binary.py` derin paket imza analizi (Siemens S7comm `0x32` ROSCTR, EtherNet/IP CIP `ListIdentity`/`RegisterSession`/`SendRRData` ve OPC UA `HEL`/`ACK`/`OPN`/`MSG`), Fabrika Siber Güvenlik Duruş Notu (`GET /api/v1/risks/posture`, `A`–`F` derecesi) ve Toplu Risk Durumu Güncelleme (`POST /api/v1/risks/bulk-status`).

## 2026-11-16
- Teknik Denetim, Mimari İnceleme ve Çekirdek Veri Hattı İyileştirmeleri (`docs/TECHNICAL_AUDIT.md`):
  - `sensor/normalizer/normalize.py` ve `sensor/parsers/pcap_binary.py`: Zeek `modbus.log` ve PCAP DPI üzerinden Modbus fonksiyon kodlarının (`evidence.modbus_functions`, `modbus_write_sources`, `modbus_roles`) uçtan uca bağlanması; PCAP paketlerinin 5'li anahtara göre akışlara birleştirilmesi (`connection_count` paket sayısı yerine gerçek akış sayısı); yalnızca port eşleşmelerinin `port_hint` olarak korunması; multicast/broadcast/loopback adreslerinin cihaz envanterinden filtrelenmesi; Zeek `duration` alanının `last_seen_at` hesabına katılması.
  - Veritabanı ve Alembic migration (`20261116_d92f31a84b01`): `asset_communications` tablosuna `sensor_id`, `protocol_confidence`, `is_baseline_approved`, `baseline_approved_at` kolonlarının eklenmesi; `risk_findings` kural kısıtına `ASSET_NOT_SEEN` (`FG-RULE-006`) eklenmesi.
  - Baseline onaylama düzeltmesi (`communications/router.py`): Sahte `RiskFinding` üretmek yerine doğrudan `AssetCommunication.is_baseline_approved` kolonunun güncellenmesi.
  - Tek kaynaklı protokol ve kanıt yardımcısı (`assets/router.py:collect_asset_evidence_maps`): Cihaz listesi (`GET /api/v1/assets`), cihaz detayı (`GET /api/v1/assets/{id}`), ağ topolojisi (`GET /api/v1/communications/graph`) ve raporlar (`GET /api/v1/reports/inventory`) arasında %100 sınıflandırma ve protokol tutarlılığı.
  - Açıklanabilir risk motoru (`risk_engine/service.py`, `risk_engine/router.py`): 6 kurallı katalog (`GET /api/v1/risks/rules`), `ASSET_NOT_SEEN` kuralı, yapılandırılmış kanıt alanları (`rule_id`, `finding_category`, `triggering_condition`, `evaluated_at`), koşulu ortadan kalkan bulguların otomatik `resolved` yapılması ve tekrar oluştuğunda yeniden açılması.
  - Dağıtım ve örnek veri düzeltmeleri: `backend/Dockerfile` ve `deployment/compose.yaml` içine `sensor/` ve `sample-data/` dahil edilmesi; `synthetic-zeek` örnek veri yolunun `sample-data/zeek/lab-basic` olarak düzeltilmesi.
  - Test doğrulaması: **23 sensör testi** + **57 PostgreSQL backend entegrasyon testi** + **Frontend derlemesi** başarılı.

## 2026-11-18
- Faz 5:
  - `sensor/parsers/pcap_binary.py` ve `sensor/normalizer/normalize.py`: **BACnet/IP** (UDP 47808 BVLC `0x81`), **DNP3** (Port 20000 Data Link `0x05 0x64`) ve **PROFINET IO CM** (Port 34964 DCE/RPC `0x04`) pasif derin paket imza analizi (DPI).
  - `backend/app/modules/discovery/classifier.py` ve `backend/app/modules/assets/router.py`: ISA-95 / **Purdue Referans Modeli** (`L1`, `L2`, `L3`, `L4/L5`) katman sınıflandırması, Dış Ağ (`is_external`) tespiti ve Toplu Cihaz Doğrulama (`POST /api/v1/assets/bulk-verify`) API uç noktası.
  - `frontend/src/pages/AssetsPage.tsx` ve `AssetDetailPage.tsx`: Purdue katman rozetleri, Dış Ağ uyarı etiketi ve tek tıkla toplu cihaz doğrulama aksiyonu (**24 sensör testi** + **57 PostgreSQL testi** başarılı).
