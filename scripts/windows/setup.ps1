<#
  One-time setup for running Game Central on a Windows PC.

  Easiest: double-click windows-setup.cmd in the project folder.
  Or from PowerShell in the project folder:
    powershell -ExecutionPolicy Bypass -File scripts\windows\setup.ps1

  It checks the tools you need, creates .env with a random secret, installs packages,
  starts the database and Redis in Docker, creates the tables and loads demo data.
  Safe to run again: every step skips work that's already done.
#>

# Native tools (pnpm, docker) write progress to stderr. With 'Stop', Windows PowerShell 5.1
# would treat that as a failure, so exit codes are checked by hand instead.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root

function Step([string]$msg) {
  Write-Host ''
  Write-Host "==> $msg" -ForegroundColor Cyan
}

function Fail([string]$msg) {
  Write-Host ''
  Write-Host "Setup stopped: $msg" -ForegroundColor Red
  exit 1
}

function Invoke-Checked([string]$what, [scriptblock]$cmd) {
  & $cmd
  if ($LASTEXITCODE -ne 0) { Fail "$what failed (exit code $LASTEXITCODE). See the messages above." }
}

Step 'Checking Node.js'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Fail 'Node.js is not installed. Install it with:  winget install OpenJS.NodeJS.LTS  then close and reopen this window.'
}
$nodeVersion = (& node --version).Trim()
$major = [int]($nodeVersion.TrimStart('v').Split('.')[0])
if ($major -lt 22) { Fail "Node.js 22 or newer is needed (you have $nodeVersion). Install it with:  winget install OpenJS.NodeJS.LTS" }
Write-Host "Node.js $nodeVersion"

Step 'Checking pnpm'
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Host 'Installing pnpm...'
  Invoke-Checked 'Installing pnpm' { npm install -g pnpm@10 }
  if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Fail 'pnpm was installed but this window cannot see it yet. Close this window, open a new one and run setup again.'
  }
}
Write-Host ('pnpm ' + (& pnpm --version))

Step 'Checking Docker'
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Fail 'Docker is not installed. Install Docker Desktop with:  winget install Docker.DockerDesktop  then start it and run setup again.'
}
& docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Fail 'Docker Desktop is not running. Start it, wait until it says "Engine running", then run setup again.'
}
Write-Host 'Docker is running'

Step 'Creating .env'
$envFile = Join-Path $root '.env'
$placeholder = 'change-me-to-a-long-random-string'
if (-not (Test-Path $envFile)) {
  Copy-Item (Join-Path $root '.env.example') $envFile
  Write-Host 'Copied .env.example to .env'
}
$text = [System.IO.File]::ReadAllText($envFile)
if ($text.Contains($placeholder)) {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  $rng.Dispose()
  $secret = [Convert]::ToBase64String($bytes)
  $text = $text.Replace($placeholder, $secret)
  # UTF-8 without a byte order mark: Node would read a BOM as part of the first variable name.
  [System.IO.File]::WriteAllText($envFile, $text, (New-Object System.Text.UTF8Encoding $false))
  Write-Host 'Generated a random BETTER_AUTH_SECRET'
} else {
  Write-Host '.env already has a secret'
}

Step 'Installing packages (the first time takes a few minutes)'
Invoke-Checked 'pnpm install' { pnpm install }

Step 'Starting Postgres and Redis in Docker'
Invoke-Checked 'Starting the Docker services' { docker compose up -d --wait postgres redis-queue redis-cache mailpit }

Step 'Creating database tables'
Invoke-Checked 'Database migration' { pnpm db:migrate }

Step 'Loading demo data'
Invoke-Checked 'Seeding' { pnpm db:seed }

Write-Host ''
Write-Host 'All set!' -ForegroundColor Green
Write-Host 'Start Game Central by double-clicking windows-start.cmd (or run: pnpm dev), then open http://localhost:3000'
Write-Host 'Demo logins: alice, bob or carol with the password gamecentral-demo-1234'
