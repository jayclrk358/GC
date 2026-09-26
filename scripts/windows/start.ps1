<#
  Start Magnox on a Windows PC (after running setup once).

  Easiest: double-click windows-start.cmd in the project folder.
  Or: powershell -ExecutionPolicy Bypass -File scripts\windows\start.ps1

  Starts the Docker services, then the website, live-updates server and background worker,
  and opens http://localhost:3000 once it's ready. Press Ctrl+C to stop.
#>
param([switch]$NoBrowser)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root

if (-not (Test-Path (Join-Path $root '.env'))) {
  Write-Host 'Run windows-setup.cmd first (there is no .env yet).' -ForegroundColor Red
  exit 1
}

& docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Docker Desktop is not running. Start it, wait until it says "Engine running", then try again.' -ForegroundColor Red
  exit 1
}

Write-Host '==> Starting Postgres and Redis' -ForegroundColor Cyan
docker compose up -d --wait postgres redis-queue redis-cache mailpit
if ($LASTEXITCODE -ne 0) {
  Write-Host 'The Docker services did not start. See the messages above.' -ForegroundColor Red
  exit 1
}

$opener = $null
if (-not $NoBrowser) {
  # Open the browser once the site answers, without blocking the dev servers.
  $opener = Start-Job -ScriptBlock {
    for ($i = 0; $i -lt 150; $i++) {
      try {
        Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 'http://localhost:3000/api/health' | Out-Null
        Start-Process 'http://localhost:3000'
        return
      } catch {
        Start-Sleep -Seconds 2
      }
    }
  }
}

Write-Host '==> Starting Magnox on http://localhost:3000 (press Ctrl+C to stop)' -ForegroundColor Cyan
try {
  pnpm dev
} finally {
  if ($opener) {
    Stop-Job $opener -ErrorAction SilentlyContinue
    Remove-Job $opener -Force -ErrorAction SilentlyContinue
  }
}
