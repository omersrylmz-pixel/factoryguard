# SECURITY MODEL (Aşama 1–5)

## OT güvenlik sınırları (tüm sürümler)
- Yalnızca pasif gözlem (izinli SPAN/TAP veya PCAP dosyası). Aktif tarama, probe, PLC komutu YOK.
- Otomatik müdahale YOK. HMI/SCADA yapılandırması değiştirilmez.
- Pilot öncesi fabrika yetkilisinden yazılı izin.

## Sensör
- Dinleme arayüzü (IP'siz, promiscuous) ile yönetim arayüzü ayrı.
- Backend'e yalnızca normalize metadata gönderilir; payload gönderilmez. Lab script'i `zeek -r` ve `--network none` ile sadece dosya okur.
- Ham PCAP/log saklama süresi sınırlı olacak.
- Kimlik doğrulama: Sensör başına tek seferlik `fg_snr_...` anahtarı + SHA-256 `credential_fingerprint`.

## Kimlik doğrulama (Aşama 1 — uygulandı)
- Açık kayıt (self-signup) endpoint'i **yoktur**; ilk sahip kullanıcı `python -m app.cli create-owner` ile oluşturulur.
- Parolalar **Argon2id** ile hash'lenir; en az 12 karakter zorunludur.
- Var olmayan e-posta ile yapılan giriş denemelerinde de sahte bir Argon2 doğrulaması çalıştırılarak zamanlama farkı azaltılır ve aynı hata mesajı döndürülür.
- E-posta başına ardışık başarısız girişlerde geçici kilitleme (429) uygulanır.
- Access token (15 dk JWT) yalnızca bellekte tutulur; refresh token (7 gün) veritabanında SHA-256 hash olarak saklanır, `HttpOnly; SameSite=Strict; Path=/api/v1/auth` cookie ile taşınır, her kullanımda döndürülür ve tekrar kullanımda (çalınma şüphesi) tüm oturumlar iptal edilir.
- `FG_ENV=production` olduğunda varsayılan/kısa `FG_JWT_SECRET` veya `FG_COOKIE_SECURE=false` ile uygulama başlamayı reddeder.

## Yetkilendirme ve Tenant İzolasyonu (Aşama 1–5 — uygulandı)
- Roller: `owner > admin > analyst > viewer`.
- Yazma işlemleri (`sites`, `zones`, `organizations`, `vulnerabilities/catalog`) en az `admin`; cihaz ve risk durumu güncelleme (`PATCH /assets/{id}`, `PATCH /risks/{id}`) en az `analyst` rolü gerektirir.
- Her tenant isteği `get_tenant` bağımlılığından geçer; kullanıcının üyesi olmadığı organizasyon için `403`/`404` döner.
- Tüm sorgular (rapor dışa aktarma uç noktaları `/api/v1/reports/*` dahil) `organization_id` ile filtrelenir; ayrıca `zones`, `sensors`, `assets`, `asset_observations`, `asset_communications` ve `risk_findings` tabloları bileşik foreign key'ler ile veritabanı seviyesinde tenantlar arası bağlanmayı engeller.
- Frontend'de aktif organizasyon değiştiğinde tüm sorgu önbelleği (`queryClient.clear()`) temizlenir.

## Denetim Kaydı — Audit Log (Aşama 1–5 — uygulandı)
- Giriş başarılı/başarısız/kilitli, çıkış, refresh token tekrar kullanım tespiti, organizasyon/fabrika/bölge oluşturma/güncelleme/silme, sensör kayıt/durum değişimi, cihaz düzenleme/CSV içe aktarma, risk bulgusu durum değişiklikleri (`PATCH /api/v1/risks/{id}`) ve rapor dışa aktarma işlemleri (`report.export_inventory`, `report.export_risks`) ana veritabanı işlemiyle aynı transaction içinde `audit_logs` tablosuna yazılır.

## Kanıta Dayalı Risk ve Zafiyet Değerlendirmesi (Aşama 4–5 — uygulandı)
- Risk motoru yalnızca pasif gözlemlere ve doğrulanmış envanter kayıtlarına dayanır; aktif zafiyet taraması yapmaz.
- Kesin CVE eşleşmesi (`KNOWN_VULNERABILITY`) için cihazın `is_verified=True` olması ve `vendor`, `model`, `firmware_version` alanlarının katalog kaydıyla birebir eşleşmesi şarttır.
