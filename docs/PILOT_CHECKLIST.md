# PILOT SAHA HAZIRLIK VE GÜVENLİK KONTROL LİSTESİ (Aşama 6)

Bu belge, **FactoryGuard Lite** platformunun bir üretim fabrikasında kontrollü pilota çıkması öncesinde tamamlanması zorunlu teknik ve operasyonel adımları tanımlar.

## 1. Operasyonel ve Hukuki Ön Koşullar
- [ ] Fabrika yönetiminden ve OT/Otomasyon sorumlusundan **yazılı pasif izleme izni** alındı.
- [ ] Sensörün bağlanacağı switch portunun yalnızca **SPAN / Mirror Port** veya donanımsal **Network TAP** olduğu doğrulandı.
- [ ] Üretim ağına hiçbir aktif paket (ARP, ICMP, Nmap, Modbus/S7 sorgusu) gönderilmeyeceği saha ekibiyle teyit edildi.

## 2. Sensör Güvenlik Sınırları
- [ ] Sensörün OT dinleme arayüzüne (`eth1` vb.) **IP adresi atanmadı** (`promiscuous` mod, yalnızca alıcı).
- [ ] Sensör yönetim arayüzü (`eth0`) yalnızca FactoryGuard Backend sunucusuna HTTPS/HTTP üzerinden bağlanabiliyor.
- [ ] Sensör anahtarı (`fg_snr_...`) panelden (`POST /api/v1/sensors/enroll`) üretildi ve yalnızca sensör yapılandırma dosyasına (`0600` izinle) yazıldı.

## 3. Sunucu ve Veritabanı Sertleştirmesi
- [ ] `FG_ENV=production`, en az 32 karakterlik kriptografik `FG_JWT_SECRET` ve güçlü `FG_DB_PASSWORD` tanımlandı.
- [ ] İlk yönetici hesabı `python -m app.cli create-owner` komutuyla oluşturuldu (sistemde açık kayıt endpoint'i yoktur).
- [ ] PostgreSQL portu (`5432`) dış ağa kapalı, yalnızca yerel loopback (`127.0.0.1`) veya iç container ağına açık.

## 4. Saha Doğrulama Adımları
1. `deployment/scripts/healthcheck.ps1` betiğini çalıştırarak PostgreSQL, Backend (`/api/v1/health`) ve Frontend servislerinin sağlıklı olduğunu doğrulayın.
2. Sensör ekranından (`/sensors`) sensörün `Aktif` olduğunu ve son görülme zamanının (`last_seen_at`) güncellendiğini kontrol edin.
3. Cihaz Envanteri (`/assets`) sayfasında keşfedilen cihazların kanıta dayalı etiketlerle (`Muhtemel endüstriyel cihaz (MODBUS gözlendi)` vb.) listelendiğini, doğrulanmamış cihazlara sahte üretici atanmadığını kontrol edin.
4. Bilinen kritik PLC ve SCADA varlıklarını saha otomasyon mühendisiyle birlikte doğrulayın (`is_verified=True`, bölge ve kritiklik ataması).
5. Raporlar (`/reports`) ekranından ilk gün **OT Cihaz Envanteri PDF** ve **Yönetici + Teknik Risk PDF** baz raporlarını indirip arşivleyin.

## 5. Geri Alma / Temiz Kaldırma (Rollback)
Pilot sonunda veya acil durumda:
- Yalnızca servisleri durdurmak (veriyi koruyarak): `.\deployment\scripts\uninstall.ps1`
- Tüm servisleri ve veritabanı hacmini tamamen kaldırmak: `.\deployment\scripts\uninstall.ps1 -PurgeData`
