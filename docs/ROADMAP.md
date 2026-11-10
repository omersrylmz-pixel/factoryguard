# ROADMAP

| AÅŸama | Ä°Ã§erik | Tamamlanma kriteri | Durum |
|---|---|---|---|
| 0 Laboratuvar | Zeek, PCAP analizi, normalizer | Ã–rnek trafikten IP/port/protokol/baÄŸlantÄ± Ã§Ä±karÄ±lÄ±r | ğŸŸ¡ Normalizer hazÄ±r, gerÃ§ek PCAP doÄŸrulamasÄ± bekliyor |
| 1 AltyapÄ± | FastAPI, PostgreSQL, Alembic, auth, org/site/zone, React iskeleti, Compose | GiriÅŸ + fabrika kaydÄ± + DB okuma/yazma | â¬œ |
| 2 SensÃ¶r aktarÄ±mÄ± | SensÃ¶r kimliÄŸi, ingestion, heartbeat, dedup | SensÃ¶r verisi PostgreSQL'e yazÄ±lÄ±r | â¬œ |
| 3 Cihaz keÅŸfi | Asset eÅŸleÅŸtirme, identifiers, confidence, manuel dÃ¼zenleme, CSV | GÃ¶rÃ¼len cihazlar envanterde, dÃ¼zenlenebilir | â¬œ |
| 4 Ä°liÅŸkiler + risk | Communications, 5 kural, puanlama, durumlar | Olaydan aÃ§Ä±klanabilir bulgu | â¬œ |
| 5 Frontend + rapor | TÃ¼m sayfalar, CSV/PDF | Panelde cihaz/risk/rapor | â¬œ |
| 6 SertleÅŸtirme | GÃ¼venlik/tenant/performans testleri, kurulum/kaldÄ±rma, pilot | KontrollÃ¼ pilota hazÄ±r | â¬œ |

Gelecek (MVP dÄ±ÅŸÄ±): Growth, Partner, Intelligence, Enterprise; S7, EtherNet/IP, OPC UA ayrÄ±ÅŸtÄ±rma.
