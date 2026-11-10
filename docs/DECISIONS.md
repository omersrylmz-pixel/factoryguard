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

## D-006 Geliştirme ortamında Zeek yok (iptal → D-007)
Docker/WSL yok. Zeek Ubuntu VM'de çalışır; normalizer, Zeek formatında sentetik loglarla test edilir.

## D-007 Lab ortamı: Docker Desktop + WSL2, resmî zeek/zeek imajı (2026-11-10)
D-006'yı değiştirir. Zeek container'ı `--network none` ve PCAP salt-okunur bağlanarak çalışır → ağa paket gönderemez.

## D-008 İletişim kaydı anahtarı (src, dst, transport, dst_port) (2026-11-10)
Gerçek veride payload'sız TCP bağlantıları `service` alanı almıyor; protokol anahtarda olunca aynı akış ikiye bölünüyordu.
Protokol güveni akış bazında en yüksek seviyeye yükseltilir.

## D-009 MAC tek başına cihaz kimliği değildir (2026-11-10)
Gerçek PCAP'te iki IP aynı MAC'i paylaştı. Aşama 3 eşleştirmesi MAC+IP+bağlam ile, confidence ile yapılacak.

## D-010 Parola hash'leme ve token stratejisi (2026-11-10)
- Parola: **Argon2id** (`argon2-cffi`). Bcrypt'in 72-bayt sınırına takılmaz ve GPU saldırılarına daha dayanıklıdır.
- Access token: kısa ömürlü (15 dk) HS256 JWT; frontend'de **yalnızca bellekte** tutulur (`localStorage` kullanılmaz).
- Refresh token: 48 bayt kriptografik rastgele değer; veritabanında yalnızca **SHA-256 hash'i** saklanır, istemciye `HttpOnly`, `SameSite=Strict`, `Path=/api/v1/auth` cookie olarak verilir. Her yenilemede döndürülür (rotation); iptal edilmiş bir token tekrar kullanılırsa kullanıcının tüm oturumları iptal edilir (reuse detection).

## D-011 Veritabanı seviyesinde bileşik tenant FK (2026-11-10)
`zones` tablosu `sites(id, organization_id)` üzerine bileşik foreign key (`fk_zones_site_org`) içerir. Uygulama katmanında bir hata olsa bile bir bölgenin başka bir tenant'ın fabrikasına bağlanması PostgreSQL tarafından reddedilir.

## D-012 Frontend veri yönetimi: TanStack Query + React Context (2026-11-10)
Sunucu durumu için `@tanstack/react-query`, kimlik/aktif organizasyon için küçük bir `AuthContext` kullanıldı. Redux/Zustand eklenmedi; organizasyon değiştiğinde `queryClient.clear()` ile tüm önbellek temizlenerek tenant sızıntısı önlenir.

## D-013 Sensör kimlik doğrulaması ve tekrar kontrolü (2026-11-10)
- Sensör kaydı (`POST /api/v1/sensors/enroll`) tek seferlik `fg_snr_...` anahtarı üretir; veritabanında yalnızca SHA-256 parmak izi (`credential_fingerprint`) saklanır.
- Sensörün son görülme zamanı (`last_seen_at`) 180 saniyeyi aşarsa `connectivity_status` otomatik olarak `offline` raporlanır.
- Gözlem tekrarı (`dedup_hash` = SHA-256(kanonik gözlem)) veritabanı seviyesinde `UNIQUE(sensor_id, dedup_hash)` ile engellenir.
- Cihaz IP değiştirdiğinde (DHCP kanıtı veya sitedeki tekil MAC eşleşmesi) mevcut `Asset` güncellenir ve eski/yeni IP `asset_identifiers` tablosunda korunur; ancak birden fazla IP aynı MAC'i paylaşıyorsa (gateway durumu — D-009) yanlış birleştirme yapılmaz.

## D-014 Kanıta dayalı cihaz sınıflandırması ve doğrulama durumu (2026-11-10)
- `is_verified=False` olan hiçbir cihaza tahmini üretici (`vendor`) atanmaz; üretici alanı boşsa arayüzde açıkça `"Üretici bilgisi doğrulanmadı"` gösterilir.
- Yalnızca IP/MAC bilgisi varsa `"Bilinmeyen cihaz"`, gözlemlenen protokol `modbus` vb. ise `"Muhtemel endüstriyel cihaz (MODBUS gözlendi)"`, hostname deseni eşleşirse `"Muhtemel HMI/PLC/SCADA (Doğrulanmadı)"` etiketi üretilir.
- Kullanıcı cihazı manuel olarak düzenleyip `is_verified=True` yaptığında veya doğrulanmış CSV içe aktardığında `confidence=1.0` olur.
