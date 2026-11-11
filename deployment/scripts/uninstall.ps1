# FactoryGuard Lite — Temiz Kaldırma (Uninstall) Betiği
param(
    [switch]$PurgeData
)

$ErrorActionPreference = "Continue"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$composeFile = Join-Path $repoRoot "deployment\compose.yaml"

Write-Host "FactoryGuard Lite servisleri durduruluyor..." -ForegroundColor Cyan
if ($PurgeData) {
    Write-Host "DIKKAT: -PurgeData secildi, PostgreSQL kalici veri hacmi (fg_pgdata) silinecek." -ForegroundColor Yellow
    docker compose -f $composeFile down -v --remove-orphans
} else {
    docker compose -f $composeFile down --remove-orphans
    Write-Host "Not: Veritabani hacmi (fg_pgdata) korundu. Tamamen silmek icin -PurgeData parametresi kullanin." -ForegroundColor Gray
}
Write-Host "Tamamlandi." -ForegroundColor Green
