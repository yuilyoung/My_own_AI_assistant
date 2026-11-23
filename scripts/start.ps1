param(
    [ValidateSet("demo", "ollama", "cloud")][string]$Provider = "demo",
    [switch]$LocalModel,
    [switch]$Voice,
    [ValidateSet("none", "melo", "supertonic")][string]$TtsProvider,
    [switch]$Microphone
)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
$Python = Join-Path (Get-Location) ".venv\Scripts\python.exe"
if (!(Test-Path $Python)) { throw "Run scripts\setup.ps1 first." }
$env:PYTHONPATH = Join-Path (Get-Location) "services"
$env:LLM_PROVIDER = $Provider
if ($LocalModel) { $env:LOCAL_LLM_ENABLED = "true" }
$env:STT_PROVIDER = if ($Microphone) { "whisper_cpp" } else { "none" }
if ($Microphone -and (!$env:WHISPER_CLI -or !$env:WHISPER_MODEL)) { throw "Set WHISPER_CLI and WHISPER_MODEL to existing local files first." }
if ($TtsProvider) { $env:TTS_PROVIDER = $TtsProvider }
elseif ($Voice -and (!$env:TTS_PROVIDER -or $env:TTS_PROVIDER -eq "none")) {
    $env:TTS_PROVIDER = if ($env:SUPERTONIC_TOKEN) { "supertonic" } else { "melo" }
}
elseif (!$env:TTS_PROVIDER) { $env:TTS_PROVIDER = "none" }
if ($env:TTS_PROVIDER -eq "supertonic" -and $env:SUPERTONIC_TOKEN.Length -lt 32) { throw "Set SUPERTONIC_TOKEN and start the separate Supertonic 2 worker first." }
if ($env:TTS_PROVIDER -eq "melo" -and $env:MELO_TOKEN.Length -lt 32) { throw "Set MELO_TOKEN and start the separate Melo worker first." }
& $Python -m gateway.cli
exit $LASTEXITCODE
