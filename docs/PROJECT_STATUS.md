# PROJECT STATUS

**Güncel aşama:** Aşama 0 — Laboratuvar (kısmen tamamlandı) · Son güncelleme: 2026-11-09

## Ortam
- Windows geliştirme makinesi: Python 3.13, Node 22, git.
- **Docker yok, WSL yok → Zeek bu makinede çalıştırılamıyor.** Zeek, Ubuntu VM'de `deployment/scripts/lab_zeek.sh` ile çalıştırılacak.

## Tamamlanan
- Proje klasör iskeleti.
- `sensor/parsers/zeek.py`: Zeek JSON + TSV log okuyucu (bozuk satırları atlar, loglar).
- `sensor/normalizer/normalize.py`: conn/dhcp/dns/modbus → normalize gözlem + iletişim JSON.
  - uid ile tekrar kontrolü, IP/MAC doğrulama, protokol güveni (`observed` vs `port_hint`), tahmin yok.
- `sensor/cli.py`: `python -m sensor.cli normalize --logs DIR --sensor-id ID --out FILE`.
- Sentetik (DEMO işaretli) örnek loglar ve 10 birim testi.

## Devam eden / eksik (Aşama 0)
- [ ] Ubuntu Server VM + Zeek kurulumu (kullanıcı tarafında; Docker/WSL olmadığı için).
- [ ] Gerçek bir herkese açık Modbus PCAP'i ile uçtan uca doğrulama.
- [ ] ARP: Zeek varsayılan olarak ARP logu üretmez; MAC'ler `mac-logging` policy (orig_l2_addr/resp_l2_addr) ve DHCP'den alınıyor.

## Bilinen sınırlamalar
- conn.log'daki L2 adresi, yönlendirilmiş trafikte router'ın MAC'i olabilir. Normalizer ilk görülen MAC'i alır, DHCP MAC'i bunu ezer. Aşama 3'te asset eşleştirmede ele alınacak.

## Son test sonuçları
Bkz. `NEXT_SESSION.md`.

## Sonraki hedef
Aşama 0 doğrulaması (gerçek PCAP) → Aşama 1: FastAPI + PostgreSQL + Alembic + auth + org/site/zone.
