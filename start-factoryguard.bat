@echo off
chcp 65001 >nul
echo ========================================================
echo   FactoryGuard Lite - Tek Tikla Kalici Baslatici
echo ========================================================
cd /d "%~dp0"

echo [1/3] Docker Desktop kontrol ediliyor...
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo Docker Desktop baslatiliyor, lutfen bekleyin...
    docker desktop start >nul 2>&1
)

echo [2/3] FactoryGuard servisleri (PostgreSQL + Backend + Frontend) kalici olarak baslatiliyor...
docker compose -f deployment\compose.yaml up -d --build

echo [3/3] Tarayicida http://localhost:3000 aciliyor...
start http://localhost:3000
echo.
echo Hazir! Giris: admin@factoryguard.com / FactoryGuard2026!
echo (Konteynerler restart: unless-stopped ile calisir; bu pencereyi kapatabilirsiniz.)
pause
