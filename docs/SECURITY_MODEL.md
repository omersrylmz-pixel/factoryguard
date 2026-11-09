# SECURITY MODEL (taslak — Aşama 0)

## OT güvenlik sınırları (tüm sürümler)
- Yalnızca pasif gözlem (izinli SPAN/TAP veya PCAP dosyası). Aktif tarama, probe, PLC komutu YOK.
- Otomatik müdahale YOK. HMI/SCADA yapılandırması değiştirilmez.
- Pilot öncesi fabrika yetkilisinden yazılı izin.

## Sensör
- Dinleme arayüzü (IP'siz, promiscuous) ile yönetim arayüzü ayrı.
- Backend'e yalnızca normalize metadata gönderilir; payload gönderilmez. Lab script'i `zeek -r` ile sadece dosya okur.
- Ham PCAP/log saklama süresi sınırlı olacak (Aşama 2'de yapılandırılabilir retention).
- Kimlik doğrulama: Aşama 2'de sensör başına credential + fingerprint, HTTPS.

## Planlanan (Aşama 1–2)
- Kullanıcı auth: parola hash (argon2/bcrypt), kısa ömürlü access + refresh token.
- RBAC: owner/admin/analyst/viewer. Tenant izolasyonu: tüm sorgular organization_id ile filtrelenir; RLS ikinci savunma hattı.
- Audit log: tüm kullanıcı yazma işlemleri.
