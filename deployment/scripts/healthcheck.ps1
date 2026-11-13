# FactoryGuard Lite — Sistem Sağlık Kontrolü (Healthcheck)
param(
    [string]$ApiUrl = "http://127.0.0.1:8000/api/v1/health",
    [string]$FrontendUrl = "http://127.0.0.1:3000"
)

$ErrorActionPreference = "Continue"
Write-Host "=== FactoryGuard Lite Saglik Kontrolu ===" -ForegroundColor Cyan

# 1. PostgreSQL kontrolü
docker exec deployment-postgres-1 pg_isready -U factoryguard -d factoryguard > $null 2>&1
if ($LASTEXITCODE -ne 0) {
    docker exec factoryguard-postgres pg_isready -U factoryguard -d factoryguard > $null 2>&1
}
if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] PostgreSQL veritabani hazir (127.0.0.1:5432)" -ForegroundColor Green
} else {
    Write-Host "[UYARI] PostgreSQL container erisilemez" -ForegroundColor Yellow
}

# 2. Backend API kontrolü
try {
    $resp = Invoke-RestMethod -Uri $ApiUrl -Method Get -TimeoutSec 5
    if ($resp.status -eq "ok") {
        Write-Host "[OK] Backend API saglikli ($ApiUrl) - Surum: $($resp.version), DB: $($resp.database)" -ForegroundColor Green
    } else {
        Write-Host "[HATA] Backend API durumu: $($resp.status)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "[HATA] Backend API erisilemez ($ApiUrl): $_" -ForegroundColor Red
    exit 1
}

# 3. Frontend kontrolü
try {
    $fe = Invoke-WebRequest -Uri $FrontendUrl -Method Get -TimeoutSec 5 -UseBasicParsing
    if ($fe.StatusCode -eq 200) {
        Write-Host "[OK] Frontend web arayuzu erisilebilir ($FrontendUrl)" -ForegroundColor Green
    }
} catch {
    Write-Host "[HATA] Frontend arayuzu erisilemez ($FrontendUrl): $_" -ForegroundColor Red
    exit 1
}
