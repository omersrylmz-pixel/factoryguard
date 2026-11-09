# NEXT SESSION

## En son ne yapıldı (2026-11-09 18:31)
- Ortam kontrol edildi: WSL ve Docker **kurulu değil**; sanallaştırma açık; agent yönetici yetkisiz.
- Docker tabanlı lab script'i ve PostgreSQL compose dosyası hazırlandı (çalıştırılmadı).
- Mevcut normalizer kodu değiştirilmedi; regresyon: `pytest sensor -q` → 10 passed.

## Değişen dosyalar
- Yeni: `deployment/compose.yaml`, `deployment/scripts/lab_zeek_docker.ps1`
- Güncellendi: `docs/PROJECT_STATUS.md`, `docs/NEXT_SESSION.md`

## Kullanıcının yapması gereken (yönetici + yeniden başlatma)
1. Yönetici PowerShell: `wsl --install -d Ubuntu-24.04` → bilgisayarı yeniden başlat → Ubuntu kullanıcı adı/parola oluştur.
2. `wsl -l -v` → Ubuntu VERSION 2 olmalı.
3. `winget install -e --id Docker.DockerDesktop` (veya docker.com'dan) → Docker Desktop'ı aç, Settings > General > "Use WSL 2 based engine" açık; Resources > WSL integration > Ubuntu açık.
4. Oturumu kapat/aç (docker-users grubu), sonra agent'a "kurulum bitti" de.

## Bir sonraki oturumda ilk iş (sırayla, her adımı test et)
1. `wsl -l -v`, `docker version`, `docker compose version`, `docker run --rm hello-world`.
2. `docker pull zeek/zeek` + `docker run --rm zeek/zeek zeek --version`.
3. `docker compose -f deployment/compose.yaml up -d postgres` + `pg_isready`.
4. Herkese açık gerçek bir Modbus PCAP indir (Wireshark SampleCaptures), `sample-data/pcap/` altına, kaynak/lisans notuyla.
5. `lab_zeek_docker.ps1` ile analiz → conn.log/modbus.log ve normalized.json doğrula; bulgularla PROJECT_STATUS güncelle.
6. Ancak bundan sonra Aşama 1.
