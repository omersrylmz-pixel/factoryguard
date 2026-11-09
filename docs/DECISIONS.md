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
