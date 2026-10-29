param(
    [ValidateSet("demo", "ollama")][string]$Provider = "demo",
    [switch]$Voice,
    [switch]$Microphone
)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
$Python = Join-Path (Get-Location) ".venv\Scripts\python.exe"
if (!(Test-Path $Python)) { throw "Run scripts\setup.ps1 first." }
$env:PYTHONPATH = Join-Path (Get-Location) "services"
$env:LLM_PROVIDER = $Provider
$env:STT_PROVIDER = if ($Microphone) { "whisper_cpp" } else { "none" }
if ($Microphone -and (!$env:WHISPER_CLI -or !$env:WHISPER_MODEL)) { throw "Set WHISPER_CLI and WHISPER_MODEL to existing local files first." }
$env:TTS_PROVIDER = if ($Voice) { "melo" } else { "none" }
if ($Voice -and $env:MELO_TOKEN.Length -lt 32) { throw "Set MELO_TOKEN and start the separate Melo worker first." }
& $Python -m gateway.cli
exit $LASTEXITCODE
