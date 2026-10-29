param(
    [ValidateSet("demo", "ollama")][string]$Provider = "demo",
    [switch]$Voice,
    [switch]$Microphone,
    [switch]$Check
)
$ErrorActionPreference = "Stop"
Push-Location (Join-Path $PSScriptRoot "..")
try {
    $Python = Join-Path (Get-Location) ".venv\Scripts\python.exe"
    if (!(Test-Path $Python)) { throw "Run scripts\setup.ps1 first." }
    $env:PYTHONPATH = Join-Path (Get-Location) "services"
    if ($PSBoundParameters.ContainsKey("Provider") -or !$env:LLM_PROVIDER) { $env:LLM_PROVIDER = $Provider }
    if ($PSBoundParameters.ContainsKey("Microphone")) { $env:STT_PROVIDER = if ($Microphone) { "whisper_cpp" } else { "none" } }
    elseif (!$env:STT_PROVIDER) { $env:STT_PROVIDER = "none" }
    if ($PSBoundParameters.ContainsKey("Voice")) { $env:TTS_PROVIDER = if ($Voice) { "melo" } else { "none" } }
    elseif (!$env:TTS_PROVIDER) { $env:TTS_PROVIDER = "none" }
    & $Python -m gateway.doctor
    if ($LASTEXITCODE -ne 0) { throw "Prerequisite checks failed. Resolve the reported items and try again." }
    if (!$Check) {
        & $Python -m gateway.cli
        if ($LASTEXITCODE -ne 0) { throw "Gateway exited with code $LASTEXITCODE." }
    }
} finally { Pop-Location }
