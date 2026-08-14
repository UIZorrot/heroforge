param(
    [int]$BackendPort = 5544,
    [int]$FrontendPort = 5173,
    [ValidateSet('live', 'mock')]
    [string]$AppMode = 'live',
    [switch]$Install,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
if ($null -ne (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue)) {
    $PSNativeCommandUseErrorActionPreference = $false
}

function Write-Step {
    param([string]$Message)
    Write-Host "[hero-forge] $Message" -ForegroundColor Cyan
}

function Assert-Command {
    param(
        [string]$Name,
        [string]$InstallHint
    )

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name was not found. $InstallHint"
    }
}

function Sync-BackendDependencies {
    param([string]$BackendDir)

    Write-Step "Syncing backend Python dependencies with uv"
    Push-Location $BackendDir
    try {
        cmd.exe /c "uv sync 2>&1"
        if ($LASTEXITCODE -ne 0) {
            throw "uv sync failed with exit code $LASTEXITCODE"
        }
    }
    finally {
        Pop-Location
    }
}

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $Root "backend"
$FrontendDir = Join-Path $Root "frontend"

if (-not (Test-Path $BackendDir)) {
    throw "Backend directory not found: $BackendDir"
}

if (-not (Test-Path $FrontendDir)) {
    throw "Frontend directory not found: $FrontendDir"
}

Assert-Command "uv" "Install uv and add it to PATH."
Assert-Command "npm" "Install Node.js 20+ or add npm to PATH."

if ($Install) {
    Write-Step "Installing frontend npm dependencies"
    Push-Location $FrontendDir
    try {
        cmd.exe /c "npm install 2>&1"
        if ($LASTEXITCODE -ne 0) {
            throw "npm install failed with exit code $LASTEXITCODE"
        }
    }
    finally {
        Pop-Location
    }
}

Sync-BackendDependencies -BackendDir $BackendDir

$BackendCommand = @"
`$Host.UI.RawUI.WindowTitle = 'Hero Forge Backend :$BackendPort'
if (`$null -ne (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue)) {
    `$PSNativeCommandUseErrorActionPreference = `$false
}
Set-Location '$BackendDir'
# Force local development to read backend/.env instead of an inherited test DB URL.
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:SUB_URL -ErrorAction SilentlyContinue
Remove-Item Env:SUB_PASS -ErrorAction SilentlyContinue
Remove-Item Env:SUPABASE_DB_USER -ErrorAction SilentlyContinue
Remove-Item Env:SUPABASE_DB_NAME -ErrorAction SilentlyContinue
`$env:PORT = '$BackendPort'
Write-Host 'Backend starting on http://127.0.0.1:$BackendPort' -ForegroundColor Green
cmd.exe /c "uv run python main.py 2>&1"
"@

$FrontendCommand = @"
`$Host.UI.RawUI.WindowTitle = 'Hero Forge Frontend :$FrontendPort'
if (`$null -ne (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue)) {
    `$PSNativeCommandUseErrorActionPreference = `$false
}
Set-Location '$FrontendDir'
`$env:VITE_BACKEND_URL = 'http://127.0.0.1:$BackendPort'
`$env:VITE_APP_MODE = '$AppMode'
Write-Host 'Frontend starting on http://127.0.0.1:$FrontendPort ($AppMode mode)' -ForegroundColor Green
cmd.exe /c "npm run dev -- --host 127.0.0.1 --port $FrontendPort 2>&1"
"@

Write-Step "Starting backend process"
Start-Process powershell.exe -NoNewWindow -ArgumentList @(
    "-NoLogo",
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-Command", $BackendCommand
)

Write-Step "Starting frontend process"
Start-Process powershell.exe -NoNewWindow -ArgumentList @(
    "-NoLogo",
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-Command", $FrontendCommand
)

$FrontendUrl = "http://127.0.0.1:$FrontendPort"
Write-Step "Frontend URL: $FrontendUrl"
Write-Step "Backend health: http://127.0.0.1:$BackendPort/api/health"
Write-Step "App mode: $AppMode"

Start-Sleep -Seconds 2
try {
    $health = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$BackendPort/api/health" -TimeoutSec 4
    if ([int]$health.StatusCode -ne 200) {
        throw "Backend returned HTTP $([int]$health.StatusCode)"
    }
    Write-Step "Backend health check passed"
}
catch {
    Write-Warning "Backend is not healthy. Check backend/.env and the Supabase connection URL."
}

if (-not $NoBrowser) {
    Start-Process $FrontendUrl
}

Write-Host ""
Write-Host "Started. Press Ctrl+C or close this terminal to stop the dev servers." -ForegroundColor Yellow
Write-Host "Use './start-dev.ps1 -AppMode mock' only for isolated mock UI testing." -ForegroundColor Yellow
Write-Host "Use './start-dev.ps1 -Install' if dependencies are missing." -ForegroundColor Yellow
