# FactoryGuard Lite — Teknik Denetim (2026-11-16)

Bu belge, mevcut kod tabanının uçtan uca incelenmesi sonucunda hazırlanmıştır. Her bulgu kod okuması
**ve** gerçek örnek veriyle (`sample-data/pcap/MODBUS-TestDataPart1.pcap`, `sample-data/zeek/real-modbus-testdata-part1`)
çalıştırılan doğrulama betiğiyle teyit edilmiştir. Denetim öncesi başlangıç durumu: 56 backend + 17 sensör testi geçiyor.

## 1. Mevcut mimari

```
Ağ trafiği (SPAN/TAP) ─► Zeek (conn/dns/dhcp/modbus.log) ─► sensor/parsers/zeek.py ─► sensor/normalizer
                                                                                         │
   Web'den .pcap/.pcapng yükleme ─► sensor/parsers/pcap_binary.py (saf Python DPI) ──────┤
                                                                                         ▼
      SensorExporter (X-Sensor-Token) / analyze-upload ─► FastAPI ingestion ─► PostgreSQL
                                                                                         │
      discovery/classifier (kanıt etiketi) ◄── risk_engine (kural + 100 puan modeli) ◄──┘
                                                                                         ▼
                         REST API (/api/v1/*) ─► React (Dashboard, Assets, Network, Risks, Sensors, Reports)
```

Modüler monolit (FastAPI + SQLAlchemy 2 + Alembic + PostgreSQL 16), bileşik `(id, organization_id)` FK'larla
veritabanı seviyesinde tenant izolasyonu, Argon2id + kısa ömürlü JWT + refresh rotasyonu, sensörler için
yalnızca SHA-256 parmak izi saklanan opak token. Mimari hedeflerle uyumlu; yeniden yazım gerekmiyor.

## 2. Özellik durumu

| Özellik | Durum | Not |
|---|---|---|
| Kimlik doğrulama, RBAC, tenant izolasyonu | ✅ Çalışıyor | Testlerle kapsanmış |
| Fabrika / bölge yönetimi, denetim kaydı | ✅ Çalışıyor | |
| Sensör kaydı, heartbeat, bağlantı durumu | ✅ Çalışıyor | |
| Zeek `conn`/`dhcp`/`dns`/`modbus` ayrıştırma (JSON+TSV) | ✅ Çalışıyor | `duration` alanı yok sayılıyordu → `last_seen` hep bağlantı başlangıcı |
| Cihaz envanteri + mükerrer önleme + IP geçmişi | ✅ Çalışıyor | Liste ve detay ekranında sınıflandırma etiketi **tutarsız** |
| PCAP yükleme ve analiz | ⚠️ Güvenilmez | `connection_count` aslında **paket sayısı** (gerçek PCAP: 118); portla tahmin edilen servisler "gözlendi" olarak işaretleniyordu |
| "Sentetik Zeek" örnek analizi | ❌ Bozuk | Var olmayan `sample-data/zeek/sample` dizinine işaret ediyor → 404 |
| Tehlikeli Modbus yazma tespiti (Faz 2) | ❌ Ölü kod | Kural `evidence.modbus_functions` okuyor, normalizer bu alanı **hiç üretmiyor** |
| Protokol güven seviyesi (`observed` / `port_hint`) | ⚠️ Kayboluyor | Sensör üretiyor, backend kaydetmiyor. Port 502'ye yalnızca SYN bile "modbus" sayılıp `UNKNOWN_OT_ASSET` tetikliyor |
| Baseline onayı (Faz 3) | ⚠️ Teknik olarak sorunlu | Ayrı bir alan yerine **sahte "accepted" risk bulguları** üretiyor; raporları ve sayaçları kirletiyor |
| Risk bulgu yaşam döngüsü | ⚠️ Eksik | Koşul ortadan kalkınca iletişim kurallarının bulguları açık kalıyor; çözülen bulgu tekrar oluşunca yeniden açılmıyor |
| Multicast/broadcast adresleri | ⚠️ Yanlış | `224.0.0.251`, `255.255.255.255` gibi adresler "cihaz" oluyor; multicast "public IP" sayılıp `UNAPPROVED_REMOTE_PATH` üretiyor |
| Görülmeyen cihaz kuralı | ❌ Eksik | |
| Kural kataloğu / tetiklenme koşulu açıklaması | ⚠️ Kısmi | Kanıt ve puan kırılımı var; kural adı, koşul, değerlendirme zamanı, bulgu türü yok |
| İletişim ↔ sensör ilişkisi | ❌ Eksik | Hangi sensörün akışı raporladığı tutulmuyor |
| Raporlar (CSV/PDF/CEF) | ✅ Gerçek veriden | Protokol listesi port tahminlerini de içeriyordu |
| Docker Compose ile backend | ❌ Bozuk | İmaj `sensor/` paketini içermiyor → `ModuleNotFoundError: sensor`, konteyner açılmıyor |
| CSV içe aktarma | ⚠️ Küçük hata | Mevcut cihazın `last_seen_at` alanını "şimdi" yapıyor (ağda görülmüş gibi) |

## 3. Önceliklendirme

| Öncelik | İş | Gerekçe |
|---|---|---|
| Kritik | Docker backend imajına `sensor/` paketini ekle | Önerilen kurulum yolu hiç açılmıyor |
| Kritik | Modbus yazma tespitini gerçek veriye bağla | İddia edilen özellik çalışmıyor |
| Kritik | PCAP'te akış birleştirme (paket ≠ bağlantı) | Raporlanan metrik yanlış |
| Kritik | Protokol güven seviyesini sakla ve kurallarda kullan | Port tahmini kanıt gibi sunuluyor |
| Kritik | Örnek veri yolunu düzelt | Arayüzdeki buton 404 veriyor |
| Yüksek | Baseline onayını gerçek kolonlara taşı | Sahte bulgular veri tutarlılığını bozuyor |
| Yüksek | Bulgu yaşam döngüsü (otomatik çözme / yeniden açma) | Eski bulgular güncel durumu yansıtmıyor |
| Yüksek | Multicast/broadcast filtreleme, `is_global` ile dış IP tespiti | Yanlış pozitifler |
| Yüksek | Kural kataloğu ve tetiklenme koşulu | Açıklanabilirlik gereksinimi |
| Yüksek | Tek kaynaklı protokol yardımcısı (liste = detay = rapor = risk) | Veri tutarlılığı |
| Yüksek | `ASSET_NOT_SEEN` kuralı | Envanter hijyeni; açıkça istenen kategori |
| Orta | İletişime sensör ilişkisi; Zeek `duration` | İzlenebilirlik ve doğruluk |
| Orta | Duruş notu formülünü yanıt içinde açıkla | Keyfi puanlamadan kaçınma |
| Gelecek | İnternet uç noktalarını envanterden ayırma, asenkron PCAP işleme, Zeek canlı takip (tail) servisi | MVP dışı / mimari değişiklik |
