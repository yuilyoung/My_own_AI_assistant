param(
    [switch]$DiagnosticsOnly,
    [switch]$SkipTests
)
$ErrorActionPreference = "Stop"
Push-Location (Join-Path $PSScriptRoot "..")
try {
    $Python = Join-Path (Get-Location) ".venv\Scripts\python.exe"
    if (!(Test-Path $Python)) {
        if (Test-Path ".venv") { throw "Existing .venv is not usable on Windows. Preserve or move it, then run setup again." }
        $Launcher = Get-Command py -ErrorAction SilentlyContinue
        $LauncherArgs = @("-3")
        if (!$Launcher) {
            $Launcher = Get-Command python -ErrorAction SilentlyContinue
            $LauncherArgs = @()
        }
        if (!$Launcher) { throw "Install Python 3.11 or newer, then run setup again." }
        & $Launcher.Source @LauncherArgs -c "import sys; sys.exit(0 if sys.version_info >= (3,11) else 'Python 3.11 or newer is required.')"
        if ($LASTEXITCODE -ne 0) { throw "Python 3.11 or newer is required." }
        & $Launcher.Source @LauncherArgs -m venv .venv
        if ($LASTEXITCODE -ne 0) { throw "Cannot create the virtual environment." }
    }
    & $Python -c "import sys; sys.exit(0 if sys.version_info >= (3,11) else 'The existing .venv requires Python 3.11 or newer.')"
    if ($LASTEXITCODE -ne 0) { throw "The existing .venv requires Python 3.11 or newer." }
    if (!$DiagnosticsOnly) {
        $Node = Get-Command node -ErrorAction SilentlyContinue
        $Npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
        if (!$Node -or !$Npm) { throw "Install Node.js 22 or newer (including npm), or use -DiagnosticsOnly." }
        & $Node.Source -e "if (Number(process.versions.node.split('.')[0]) < 22) { console.error('Node.js 22 or newer is required.'); process.exit(1); }"
        if ($LASTEXITCODE -ne 0) { throw "Node.js 22 or newer is required." }
    }
    & $Python -m pip install -r requirements-dev.txt
    if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed." }
    if (!$SkipTests) {
        & $Python -m pytest -q
        if ($LASTEXITCODE -ne 0) { throw "Python tests failed." }
    }
    if (!$DiagnosticsOnly) {
        Push-Location "apps\web"
        try {
            & $Npm.Source ci --no-audit --no-fund
            if ($LASTEXITCODE -ne 0) { throw "Web dependency installation failed." }
            if (!$SkipTests) {
                & $Npm.Source test
                if ($LASTEXITCODE -ne 0) { throw "Web tests failed." }
            }
            & $Npm.Source run build
            if ($LASTEXITCODE -ne 0) { throw "Web build failed." }
        } finally { Pop-Location }
        if (!$SkipTests) {
            $VoiceTests = Get-ChildItem "apps\diagnostics\tests\*.test.mjs" | ForEach-Object { $_.FullName }
            & $Node.Source --test @VoiceTests
            if ($LASTEXITCODE -ne 0) { throw "Voice module tests failed." }
        }
    }
    Write-Host "Setup complete. Start with: .\scripts\start.ps1"
    Write-Host "Default mode is fixed-response demo. Use -Provider ollama for an installed local model."
} finally { Pop-Location }
