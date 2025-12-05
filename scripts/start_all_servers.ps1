$ErrorActionPreference = "Stop"

Write-Host "Starting local TTS server must be done separately at http://127.0.0.1:9880/tts (SoVITS)." -ForegroundColor Yellow
Write-Host "This script will start the Python backend and Vite frontend." -ForegroundColor Cyan

# Determine repo root relative to script
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir "..")

# Backend
$BackendDir = Join-Path $RepoRoot "backend"
Push-Location $BackendDir
if (!(Test-Path ".venv")) {
  Write-Host "Creating venv..."
  python -m venv .venv
}

Write-Host "Activating venv and installing backend requirements..."
& .\.venv\Scripts\Activate.ps1
python -m pip install -U pip | Out-Null
python -m pip install -r requirements.txt | Out-Null

if (!(Test-Path ".env")) {
  Write-Host "Creating .env ..."
  @"
GROQ_API_KEY=$env:GROQ_API_KEY
GROQ_MODEL=llama-4-mavrik
WHISPER_MODEL=small
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
TTS_URL=http://127.0.0.1:9880/tts
HOST=127.0.0.1
PORT=8000
"@ | Out-File -Encoding UTF8 .env
}

Write-Host "Starting backend on http://127.0.0.1:8000" -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit","-Command","`"cd `"$BackendDir`"; . .\.venv\Scripts\Activate.ps1; uvicorn app:app --host 127.0.0.1 --port 8000 --reload`""

Pop-Location

# Frontend
Push-Location $RepoRoot
Write-Host "Installing frontend deps..."
npm install | Out-Null

Write-Host "Starting Vite dev server on http://127.0.0.1:5173" -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit","-Command","`"cd `"$RepoRoot`"; npm run dev`""

Pop-Location

Write-Host "All servers started. Ensure SoVITS is running at http://127.0.0.1:9880/tts" -ForegroundColor Yellow

