# sample-data

> [!IMPORTANT]
> `zeek/lab-basic/` içindeki loglar **SENTETİKTİR (DEMO)**. Elle, Zeek'in gerçek alan adları ve
> formatları (JSON ve TSV) kullanılarak yazılmıştır. Gerçek bir ağdan alınmamıştır.
> Amaç: normalizer'ı Zeek kurulu olmayan ortamda test etmek.

İçerik (bilinçli olarak eklenmiş kenar durumlar):
- `conn.log` (JSON): Modbus (Zeek `service` ile), SSL, port-102 (servis tanınmamış → yalnızca port ipucu),
  DNS, **tekrarlanan uid C2**, geçersiz IP, bozuk JSON satırı.
- `dhcp.log` (JSON): hostname + MAC.
- `dns.log` (JSON): yerel A kaydı.
- `modbus.log` (TSV): Zeek varsayılan formatı.

Gerçek PCAP ile çalışmak için: `deployment/scripts/lab_zeek.sh` (Ubuntu VM).
Önerilen herkese açık örnek PCAP kaynakları (lisansını kontrol edin): Wireshark SampleCaptures (Modbus), 
Netresec "Publicly available PCAP files" listesi.
