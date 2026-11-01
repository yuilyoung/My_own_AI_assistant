param(
    [ValidateSet("demo", "ollama")][string]$Provider = "demo",
    [switch]$Voice,
    [switch]$Microphone,
    [switch]$Json
)
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Python = Join-Path $Root ".venv\Scripts\python.exe"
if (!(Test-Path $Python)) { throw "Run scripts\setup.ps1 first." }
$env:PYTHONPATH = Join-Path $Root "services"
$Options = @("--provider", $Provider)
if ($Voice) { $Options += "--voice" }
if ($Microphone) { $Options += "--microphone" }
if ($Json) { $Options += "--json" }
& $Python -m gateway.readiness_cli @Options
exit $LASTEXITCODE
