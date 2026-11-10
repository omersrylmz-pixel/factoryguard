# SECURITY MODEL (Aşama 1)

## OT güvenlik sınırları (tüm sürümler)
- Yalnızca pasif gözlem (izinli SPAN/TAP veya PCAP dosyası). Aktif tarama, probe, PLC komutu YOK.
- Otomatik müdahale YOK. HMI/SCADA yapılandırması değiştirilmez.
- Pilot öncesi fabrika yetkilisinden yazılı izin.

## Sensör
- Dinleme arayüzü (IP'siz, promiscuous) ile yönetim arayüzü ayrı.
- Backend'e yalnızca normalize metadata gönderilir; payload gönderilmez. Lab script'i `zeek -r` ve `--network none` ile sadece dosya okur.
- Ham PCAP/log saklama süresi sınırlı olacak (Aşama 2'de yapılandırılabilir retention).
- Kimlik doğrulama: Aşama 2'de sensör başına credential + fingerprint, HTTPS.

## Kimlik doğrulama (Aşama 1 — uygulandı)
- Açık kayıt (self-signup) endpoint'i **yoktur**; ilk sahip kullanıcı `python -m app.cli create-owner` ile oluşturulur.
- Parolalar **Argon2id** ile hash'lenir; en az 12 karakter zorunludur.
- Var olmayan e-posta ile yapılan giriş denemelerinde de sahte bir Argon2 doğrulaması çalıştırılarak zamanlama farkı azaltılır ve aynı hata mesajı döndürülür.
- E-posta başına ardışık başarısız girişlerde geçici kilitleme (429) uygulanır.
- Access token (15 dk JWT) yalnızca bellekte tutulur; refresh token (7 gün) veritabanında SHA-256 hash olarak saklanır, `HttpOnly; SameSite=Strict; Path=/api/v1/auth` cookie ile taşınır, her kullanımda döndürülür ve tekrar kullanımda (çalınma şüphesi) tüm oturumlar iptal edilir.
- `FG_ENV=production` olduğunda varsayılan/kısa `FG_JWT_SECRET` veya `FG_COOKIE_SECURE=false` ile uygulama başlamayı reddeder.

## Yetkilendirme ve Tenant İzolasyonu (Aşama 1 — uygulandı)
- Roller: `owner > admin > analyst > viewer`.
- Yazma işlemleri (`sites`, `zones`, `organizations` güncelleme) ve `audit-logs` okuma en az `admin` rolü gerektirir.
- Her tenant isteği `get_tenant` bağımlılığından geçer; kullanıcının üyesi olmadığı organizasyon için `403`/`404` döner.
- Tüm sorgular `organization_id` ile filtrelenir; ayrıca `zones -> sites` bileşik FK'sı (`(site_id, organization_id)`) veritabanı seviyesinde tenantlar arası bağlanmayı engeller.
- Frontend'de aktif organizasyon değiştiğinde tüm sorgu önbelleği (`queryClient.clear()`) temizlenir.

## Denetim Kaydı — Audit Log (Aşama 1 — uygulandı)
- Giriş başarılı/başarısız/kilitli, çıkış, refresh token tekrar kullanım tespiti, organizasyon/fabrika/bölge oluşturma, güncelleme (eski/yeni değer farklarıyla) ve silme işlemleri ana veritabanı işlemiyle aynı transaction içinde `audit_logs` tablosuna yazılır.

## Sensör Kimlik Doğrulaması ve Veri Aktarımı (Aşama 2 — uygulandı)
- Sensörler yönetici tarafından fabrikaya (`site_id`) özel kaydedilir (`POST /api/v1/sensors/enroll`).
- Üretilen `fg_snr_...` anahtarı yalnızca kayıt anında bir kez döndürülür; veritabanında yalnızca SHA-256 özeti (`credential_fingerprint`) tutulur.
- `status='revoked'` olan sensörlerin tüm ingestion ve heartbeat istekleri `401 Unauthorized` ile reddedilir.
- Ingestion uç noktaları (`/api/v1/ingest/observations`, `/api/v1/ingest/communications`) yalnızca doğrulanmış sensörün kendi `organization_id` ve `site_id` kapsamına yazabilir; istemci yükünden (payload) tenant bilgisi alınmaz.
- `asset_observations` ve `asset_communications` tabloları `(asset_id, organization_id)` ve `(sensor_id, organization_id)` bileşik foreign key'leri ile veritabanı seviyesinde de tenant sızıntısına karşı korunur.
