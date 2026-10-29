$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
python -c "import sys; assert sys.version_info >= (3,11), 'Python 3.11+ is required'"
if ($LASTEXITCODE -ne 0) { throw "Python 3.11+ is required." }
if (!(Test-Path ".venv\Scripts\python.exe")) {
    python -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw "Cannot create the virtual environment." }
}
& .\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed." }
& .\.venv\Scripts\python.exe -m pytest -q
if ($LASTEXITCODE -ne 0) { throw "Tests failed." }
Write-Host "Setup complete. Start with: .\scripts\start.ps1"
