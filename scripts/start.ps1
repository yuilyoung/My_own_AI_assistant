param(
    [ValidateSet("demo", "ollama")][string]$Provider = "demo",
    [switch]$Voice
)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
$Python = Join-Path (Get-Location) ".venv\Scripts\python.exe"
if (!(Test-Path $Python)) { throw "Run scripts\setup.ps1 first." }
$env:PYTHONPATH = Join-Path (Get-Location) "services"
$env:LLM_PROVIDER = $Provider
$env:TTS_PROVIDER = if ($Voice) { "melo" } else { "none" }
if ($Voice -and $env:MELO_TOKEN.Length -lt 32) { throw "Set MELO_TOKEN and start the separate Melo worker first." }
& $Python -m gateway.cli
exit $LASTEXITCODE
