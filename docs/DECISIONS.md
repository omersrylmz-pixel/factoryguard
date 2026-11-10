# DECISIONS

## D-001 Modüler monolith (2026-11-09)
FastAPI tek uygulama, `app/modules/*`. Mikroservis yok: tek sunuculu fabrika kurulumunda operasyonel yük gereksiz.

## D-002 Sensör normalizer saf Python, bağımlılıksız (2026-11-09)
Zeek logları stdlib ile okunuyor. Neden: sensör cihazında minimal saldırı yüzeyi ve kolay kurulum. pandas vb. gereksiz.

## D-003 Hem JSON hem TSV Zeek formatı desteklenir
Zeek varsayılanı TSV; biz `LogAscii::use_json=T` öneriyoruz ama müşteri kurulumlarında TSV ile karşılaşılabilir.

## D-004 Protokol güven seviyesi
`observed` = Zeek `service` alanı (dinamik protokol tespiti) veya protokole özel log (modbus.log).
`port_hint` = yalnızca port eşleşmesi (ör. 102 → "s7comm?"). Port ipucu cihaz kanıtına eklenmez.

## D-005 Normalizer cihaz türü/üretici tahmini YAPMAZ
Sınıflandırma backend'de, kanıt + confidence ile yapılacak (Aşama 3).

## D-006 Geliştirme ortamında Zeek yok
Docker/WSL yok. Zeek Ubuntu VM'de çalışır; normalizer, Zeek formatında sentetik loglarla test edilir.

## D-007 Lab ortamı: Docker Desktop + WSL2, resmî zeek/zeek imajı (2026-11-10)
D-006'yı değiştirir. Zeek container'ı `--network none` ve PCAP salt-okunur bağlanarak çalışır → ağa paket gönderemez.

## D-008 İletişim kaydı anahtarı (src, dst, transport, dst_port) (2026-11-10)
Gerçek veride payload'sız TCP bağlantıları `service` alanı almıyor; protokol anahtarda olunca aynı akış ikiye bölünüyordu.
Protokol güveni akış bazında en yüksek seviyeye yükseltilir.

## D-009 MAC tek başına cihaz kimliği değildir (2026-11-10)
Gerçek PCAP'te iki IP aynı MAC'i paylaştı. Aşama 3 eşleştirmesi MAC+IP+bağlam ile, confidence ile yapılacak.
