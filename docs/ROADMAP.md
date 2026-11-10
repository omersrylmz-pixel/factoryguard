# ROADMAP

| Aşama | İçerik | Tamamlanma kriteri | Durum |
|---|---|---|---|
| 0 Laboratuvar | Zeek, PCAP analizi, normalizer | Örnek trafikten IP/port/protokol/bağlantı çıkarılır | ✅ Gerçek PCAP + Zeek 9.0.1 ile doğrulandı |
| 1 Altyapı | FastAPI, PostgreSQL, Alembic, auth, org/site/zone, React iskeleti, Compose | Giriş + fabrika kaydı + DB okuma/yazma | ✅ Tamamlandı |
| 2 Sensör aktarımı | Sensör kimliği, ingestion, heartbeat, dedup | Sensör verisi PostgreSQL'e yazılır | ✅ Tamamlandı |
| 3 Cihaz keşfi | Asset eşleştirme, identifiers, confidence, manuel düzenleme, CSV | Görülen cihazlar envanterde, düzenlenebilir | ✅ Tamamlandı |
| 4 İlişkiler + risk | Communications, 5 kural, puanlama, durumlar | Olaydan açıklanabilir bulgu | ⬜ Sıradaki |
| 5 Frontend + rapor | Tüm sayfalar, CSV/PDF | Panelde cihaz/risk/rapor | ⬜ |
| 6 Sertleştirme | Güvenlik/tenant/performans testleri, kurulum/kaldırma, pilot | Kontrollü pilota hazır | ⬜ |

Gelecek (MVP dışı): Growth, Partner, Intelligence, Enterprise; S7, EtherNet/IP, OPC UA ayrıştırma.
