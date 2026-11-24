param(
    [int]$Port = 8000,
    [string]$LanIP = ''
)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$pythonPath = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) {
    python -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Could not create virtual environment.' }
    & $pythonPath -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
}
& $pythonPath -c "import importlib.util, sys; sys.exit(0 if all(importlib.util.find_spec(name) for name in ['django', 'PIL', 'waitress', 'resvg_py']) else 1)"
if ($LASTEXITCODE -ne 0) {
    & $pythonPath -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
}
& $pythonPath manage.py migrate --noinput
if ($LASTEXITCODE -ne 0) { throw 'Database migration failed.' }
$listenAddress = '127.0.0.1'
if ($LanIP) {
    $env:DJANGO_ALLOWED_HOSTS = "localhost,127.0.0.1,$LanIP"
    $listenAddress = '0.0.0.0'
    Write-Host "Phone / LAN: http://${LanIP}:$Port"
}
Write-Host "Open: http://127.0.0.1:$Port"
& $pythonPath manage.py runserver "${listenAddress}:$Port"
