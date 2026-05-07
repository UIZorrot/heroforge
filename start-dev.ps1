param(
    [int]$BackendPort = 5544,
    [int]$FrontendPort = 5173,
    [switch]$Install,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

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

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $Root "backend"
$FrontendDir = Join-Path $Root "frontend"

if (-not (Test-Path $BackendDir)) {
    throw "Backend directory not found: $BackendDir"
}

if (-not (Test-Path $FrontendDir)) {
    throw "Frontend directory not found: $FrontendDir"
}

Assert-Command "python" "Install Python 3.12+ or add it to PATH."
Assert-Command "npm" "Install Node.js 20+ or add npm to PATH."

if ($Install) {
    Write-Step "Installing backend Python dependencies"
    Push-Location $BackendDir
    try {
        python -m pip install -r requirements.txt
    }
    finally {
        Pop-Location
    }

    Write-Step "Installing frontend npm dependencies"
    Push-Location $FrontendDir
    try {
        npm install
    }
    finally {
        Pop-Location
    }
}

$PythonExe = "python"
$VenvPython = Join-Path $BackendDir ".venv\Scripts\python.exe"
if (Test-Path $VenvPython) {
    $PythonExe = $VenvPython
}

$BackendCommand = @"
`$Host.UI.RawUI.WindowTitle = 'Hero Forge Backend :$BackendPort'
Set-Location '$BackendDir'
`$env:PORT = '$BackendPort'
Write-Host 'Backend starting on http://127.0.0.1:$BackendPort' -ForegroundColor Green
& '$PythonExe' main.py
"@

$FrontendCommand = @"
`$Host.UI.RawUI.WindowTitle = 'Hero Forge Frontend :$FrontendPort'
Set-Location '$FrontendDir'
`$env:VITE_BACKEND_URL = 'http://127.0.0.1:$BackendPort'
Write-Host 'Frontend starting on http://127.0.0.1:$FrontendPort' -ForegroundColor Green
npm run dev -- --host 127.0.0.1 --port $FrontendPort
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

if (-not $NoBrowser) {
    Start-Sleep -Seconds 2
    Start-Process $FrontendUrl
}

Write-Host ""
Write-Host "Started. Press Ctrl+C or close this terminal to stop the dev servers." -ForegroundColor Yellow
Write-Host "Use './start-dev.ps1 -Install' if dependencies are missing." -ForegroundColor Yellow
