# Gerçek PCAP'ler

PCAP dosyaları git'e eklenmez (`.gitignore`). İndirip bu klasöre koyun.

| Dosya | Kaynak | SHA-256 | Not |
|---|---|---|---|
| MODBUS-TestDataPart1.pcap (10181 B) | https://github.com/automayt/ICS-pcap/raw/master/MODBUS/MODBUS-TestDataPart1/MODBUS-TestDataPart1.pcap | 94942B3D014810710F50836C95D3FAF6DF6E6370A6560BAE541397C1DF50213D | Herkese açık ICS örnek trafiği (2004). Lisans repo'da açıkça belirtilmemiş → yalnızca lab/test amaçlı; ürünle dağıtılmaz. |

Zeek 9.0.1 çıktısı (conn.log, modbus.log) `../zeek/real-modbus-testdata-part1/` altında regresyon testi için saklanır.
