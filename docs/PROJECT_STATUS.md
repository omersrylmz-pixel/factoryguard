# PROJECT STATUS

**Güncel aşama:** Aşama 0 — Laboratuvar ✅ TAMAMLANDI · Sıradaki: Aşama 1 · Son güncelleme: 2026-11-10

## Ortam (2026-11-10 doğrulandı)
| Bileşen | Sürüm / durum |
|---|---|
| Windows 11 Pro | build 26300 |
| WSL | Ubuntu-24.04 (WSL2), docker-desktop (WSL2) ✅ |
| Docker Engine / Compose | 29.9.3 / v5.7.0 ✅ (`hello-world` geçti) |
| Zeek | resmî `zeek/zeek:latest` → **zeek 9.0.1** ✅ |
| PostgreSQL | `postgres:16` → 16.15, healthy, yalnızca 127.0.0.1:5432 ✅ |
| Python | 3.13 (.venv) · Node 22 |

## Aşama 0 başarı kriteri — karşılandı
Gerçek PCAP (`MODBUS-TestDataPart1.pcap`, SHA-256 `94942B3D…213D`) → Zeek (Docker, `--network none`, salt-okunur) →
conn.log (5 bağlantı) + modbus.log (35 kayıt) → normalizer → **4 cihaz, 4 iletişim, 0 reddedilen kayıt**.

| Kaynak | Hedef | Port | Protokol | Güven | Bağlantı |
|---|---|---|---|---|---|
| 10.0.0.57 | 10.0.0.3 | 502 | modbus | observed | 2 |
| 10.0.0.57 | 10.0.0.8 | 502 | modbus | observed | 2 |
| 10.0.0.9 | 10.0.0.3 | 502 | modbus | observed | 1 |
| 10.0.0.8 | 10.0.0.57 | 4446 | — | none | 1 |

## Tamamlanan
- Zeek JSON+TSV parser, normalizer, CLI (Aşama 0 ilk oturum).
- Docker lab: `deployment/scripts/lab_zeek_docker.ps1`, `deployment/compose.yaml` (çalıştırıldı ve doğrulandı).
- Gerçek veriyle bulunan hata düzeltildi: aynı akış, payload'sız bağlantı yüzünden iki iletişim kaydına bölünüyordu
  (port_hint + observed). Artık anahtar protokolü içermiyor; güven yalnızca yükseltiliyor.
- Lab script'i: Python INFO loglarını PowerShell'in hata saymasına neden olan sorun düzeltildi.
- Gerçek Zeek çıktısı regresyon testi olarak saklandı (`sample-data/zeek/real-modbus-testdata-part1/`).

## Bilinen sınırlamalar / gözlemler
- **Gerçek veride iki IP (10.0.0.8, 10.0.0.9) aynı MAC'i (00:50:04:93:70:67) paylaşıyor** → muhtemelen gateway/çok IP'li cihaz.
  Normalizer birleştirmiyor (doğru). Aşama 3'te MAC'e tek başına dayanarak cihaz birleştirme YAPILMAMALI.
- Zeek varsayılan olarak ARP logu üretmez; MAC'ler `mac-logging` policy ve DHCP'den geliyor.
- Test PCAP'i 2004 tarihli, küçük; DHCP/DNS içermiyor → hostname yolu yalnızca sentetik veriyle test edildi.
- PCAP lisansı kaynakta belirtilmemiş → yalnızca lab amaçlı, git'e eklenmedi.

## Son test sonuçları
`pytest sensor -q` → **13 passed** (10 eski + 2 yeni birim + 1 gerçek veri E2E).

## Sonraki hedef
Aşama 1: FastAPI + SQLAlchemy + Alembic (PostgreSQL container'ı), auth, organizations/sites/zones, React iskeleti.
