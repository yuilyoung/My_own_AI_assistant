param(
    [ValidateSet("claude", "demo", "ollama", "cloud")][string]$Provider = "claude",
    [switch]$NoBrowser,
    [switch]$Pet,
    [switch]$Voice,
    [switch]$Microphone
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false

function Find-Application([string]$Name) {
    $Command = Get-Command -Name $Name -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($Command) { $Command.Source }
}

function Test-PythonExecutable([string]$Executable) {
    if (!$Executable -or $Executable -match '\\Microsoft\\WindowsApps\\python\.exe$' -or
        !(Test-Path -LiteralPath $Executable -PathType Leaf)) { return $false }
    $VersionProbe = "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)"
    try {
        & $Executable -c $VersionProbe 2>$null | Out-Null
        return ($LASTEXITCODE -eq 0)
    } catch {
        return $false
    }
}

function Find-Python {
    $Commands = Get-Command -Name "python.exe" -CommandType Application -All -ErrorAction SilentlyContinue
    foreach ($Command in $Commands) {
        if (Test-PythonExecutable $Command.Source) { return $Command.Source }
    }

    $InstallRoots = @($env:ProgramFiles, ${env:ProgramFiles(x86)})
    if ($env:LOCALAPPDATA) {
        $InstallRoots += (Join-Path $env:LOCALAPPDATA "Programs/Python")
    }
    foreach ($InstallRoot in $InstallRoots) {
        if ($InstallRoot -and (Test-Path -LiteralPath $InstallRoot -PathType Container)) {
            $Directories = Get-ChildItem -LiteralPath $InstallRoot -Directory -Filter "Python3*" -ErrorAction SilentlyContinue
            foreach ($Directory in $Directories) {
                $Executable = Join-Path $Directory.FullName "python.exe"
                if (Test-PythonExecutable $Executable) { return $Executable }
            }
        }
    }

    $Launcher = Find-Application "py.exe"
    if ($Launcher) {
        try {
            # Listing installed runtimes avoids the install manager's automatic
            # installation when no Python has been installed yet.
            $Installed = & $Launcher -0p 2>$null
            if ($LASTEXITCODE -eq 0) {
                foreach ($Line in $Installed) {
                    if ($Line -match '^\s*-\S+\s+\*?\s*((?:[A-Za-z]:\\|\\\\).+\.exe)\s*$') {
                        $Executable = $Matches[1]
                        if (Test-PythonExecutable $Executable) { return $Executable }
                    }
                }
            }
        } catch {
            # Ignore an unavailable Python launcher and allow the install prompt.
        }
    }
}

function Invoke-Checked([string]$Command, [string[]]$Arguments, [string]$Failure) {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Failure (exit code $LASTEXITCODE)." }
}

function Install-Python {
    $ManualInstall = "Install Python 3.12 from https://www.python.org/downloads/windows/ and run Start.cmd again."
    $WinGet = Find-Application "winget.exe"
    if (!$WinGet -and $env:LOCALAPPDATA) {
        $WinGetAlias = Join-Path $env:LOCALAPPDATA "Microsoft/WindowsApps/winget.exe"
        if (Test-Path -LiteralPath $WinGetAlias -PathType Leaf) { $WinGet = $WinGetAlias }
    }
    if (!$WinGet) { throw "Python 3.11 or later is required and WinGet was not found. $ManualInstall" }
    $InteractiveInstall = "Python is required. Run Start.cmd in an interactive terminal to approve installation. $ManualInstall"
    if ([Console]::IsInputRedirected) { throw $InteractiveInstall }
    try {
        $Consent = Read-Host "Python 3.11 or later was not found. Install official Python 3.12 for this account using WinGet? [y/N]"
    } catch {
        throw $InteractiveInstall
    }
    if (([string]$Consent).Trim() -notin @("y", "yes")) { throw "Python was not installed. $ManualInstall" }
    $InstallerOptions = @(
        "install", "--exact", "--id", "Python.Python.3.12", "--source", "winget",
        "--scope", "user", "--interactive", "--override", "InstallAllUsers=0 InstallLauncherAllUsers=0 PrependPath=0"
    )
    try {
        Invoke-Checked $WinGet $InstallerOptions "WinGet returned an error"
    } catch {
        throw "WinGet did not finish installing Python. $ManualInstall $_"
    }
}

function Test-ClaudeSubscription([string]$Executable) {
    try {
        $StatusJson = & $Executable auth status --json 2>$null
        if ($LASTEXITCODE -ne 0 -or !$StatusJson) { return $false }
        $Status = ($StatusJson -join "`n") | ConvertFrom-Json
        return ($Status.loggedIn -is [bool] -and $Status.loggedIn -and $Status.authMethod -ceq "claude.ai")
    } catch {
        return $false
    }
}

function Find-ClaudeCode {
    $Executable = Find-Application "claude.exe"
    if (!$Executable) {
        $NativeInstall = Join-Path $HOME ".local/bin/claude.exe"
        if (Test-Path -LiteralPath $NativeInstall -PathType Leaf) { $Executable = $NativeInstall }
    }
    if (!$Executable) {
        throw "Install Claude Code with 'winget install --exact --id Anthropic.ClaudeCode', then reopen PowerShell."
    }
    return $Executable
}

function Connect-ClaudeSubscription([string]$Executable) {
    # Match the Gateway subprocess environment. Account selection must not
    # inherit API credentials or use a different Claude configuration folder.
    $ProfileVariables = @(
        "APPDATA", "HOME", "HOMEDRIVE", "HOMEPATH", "LANG", "LC_ALL", "LC_CTYPE",
        "LOCALAPPDATA", "PATH", "SYSTEMROOT", "TEMP", "TMP", "TMPDIR", "USERPROFILE", "WINDIR"
    )
    $Removed = [Environment]::GetEnvironmentVariables("Process").GetEnumerator() |
        Where-Object { $ProfileVariables -notcontains $_.Key }
    try {
        foreach ($Entry in $Removed) {
            [Environment]::SetEnvironmentVariable($Entry.Key, [NullString]::Value, "Process")
        }
        $Version = & $Executable --version 2>$null
        if ($LASTEXITCODE -ne 0 -or $Version -notmatch '^(\d+\.\d+\.\d+)(\s|$)' -or
            [version]$Matches[1] -lt [version]"2.1.248") {
            throw "Claude Code 2.1.248 or newer is required. Run 'winget upgrade --exact --id Anthropic.ClaudeCode' or update your official install."
        }
        if (!(Test-ClaudeSubscription $Executable)) {
            Write-Host "Sign in to Claude Code with the Claude account that holds your subscription."
            Invoke-Checked $Executable @("auth", "login") "Claude Code sign-in failed"
            if (!(Test-ClaudeSubscription $Executable)) {
                throw "Claude Code did not report a Claude subscription login. Sign in using the Claude account option and retry."
            }
        }
    } finally {
        foreach ($Entry in $Removed) {
            [Environment]::SetEnvironmentVariable($Entry.Key, $Entry.Value, "Process")
        }
    }
}

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Archive = Join-Path $Root "windows/web-dist.zip"
if (!(Test-Path -LiteralPath $Archive -PathType Leaf)) {
    throw "The Windows web bundle is missing. Update your Git checkout and run Start.cmd again."
}
$VenvPython = Join-Path $Root ".venv/Scripts/python.exe"
$Dist = $null
$OriginalPath = $env:PATH
$RefreshedPath = $false

Push-Location $Root
try {
    if (!(Test-Path -LiteralPath $VenvPython -PathType Leaf)) {
        $Python = Find-Python
        if (!$Python) {
            Install-Python
            $Python = Find-Python
            if (!$Python) {
                $RefreshedPath = $true
                $MachinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
                $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
                $env:PATH = (@($OriginalPath, $MachinePath, $UserPath) |
                    Where-Object { $_ }) -join [System.IO.Path]::PathSeparator
                $Python = Find-Python
            }
            if (!$Python) {
                throw "WinGet finished but Python is still unavailable. Open a new PowerShell window and run Start.cmd again."
            }
        }
        Invoke-Checked $Python @("-m", "venv", ".venv") "Could not create the virtual environment"
    }
    Invoke-Checked $VenvPython @("-m", "pip", "install", "--disable-pip-version-check", "-r", "requirements.txt") "Could not install Gateway dependencies"

    if ($Pet) {
        Invoke-Checked $VenvPython @("-m", "pip", "install", "--disable-pip-version-check", "-r", "requirements-pet.txt") "Could not install the desktop pet runtime"
    }

    $Dist = Join-Path ([System.IO.Path]::GetTempPath()) ("assistant-web-" + [guid]::NewGuid().ToString("N"))
    try {
        [void][System.IO.Directory]::CreateDirectory($Dist)
        Invoke-Checked $VenvPython @("-m", "zipfile", "-e", $Archive, $Dist) "Could not unpack the Windows web bundle"
    } catch {
        throw "Could not unpack windows/web-dist.zip. Update your Git checkout and retry. $_"
    }
    $Assets = Join-Path $Dist "assets"
    if (!(Test-Path -LiteralPath (Join-Path $Dist "index.html") -PathType Leaf) -or
        !(Test-Path -LiteralPath $Assets -PathType Container) -or
        [System.IO.Directory]::GetFiles($Assets, "*.js").Length -eq 0 -or
        [System.IO.Directory]::GetFiles($Assets, "*.mjs").Length -eq 0) {
        throw "The Windows web bundle is incomplete. Update your Git checkout and retry."
    }

    $Claude = $null
    if ($Provider -eq "claude") {
        $Claude = Find-ClaudeCode
        Connect-ClaudeSubscription $Claude
    }
    $Variables = @("ASSISTANT_HOST", "ASSISTANT_PUBLIC_ORIGIN", "ASSISTANT_WEB_DIR", "CLAUDE_CLI", "PYTHONPATH", "LLM_PROVIDER", "STT_PROVIDER", "TTS_PROVIDER")
    $Previous = @{}
    foreach ($Name in $Variables) { $Previous[$Name] = [Environment]::GetEnvironmentVariable($Name, "Process") }
    try {
        $env:ASSISTANT_HOST = "127.0.0.1"
        $env:ASSISTANT_PUBLIC_ORIGIN = $null
        $env:ASSISTANT_WEB_DIR = $Dist
        if ($Claude) { $env:CLAUDE_CLI = $Claude }
        & (Join-Path $PSScriptRoot "start.ps1") -Provider $Provider -Pet:$Pet -Voice:$Voice -Microphone:$Microphone -OpenBrowser:(!$NoBrowser -and !$Pet)
        exit $LASTEXITCODE
    } finally {
        foreach ($Name in $Variables) {
            $Value = $Previous[$Name]
            if ($null -eq $Value) { $Value = [NullString]::Value }
            [Environment]::SetEnvironmentVariable($Name, $Value, "Process")
        }
    }
} finally {
    if ($Dist -and (Test-Path -LiteralPath $Dist -PathType Container)) {
        Remove-Item -LiteralPath $Dist -Recurse -Force -ErrorAction SilentlyContinue
    }
    if ($RefreshedPath) { $env:PATH = $OriginalPath }
    Pop-Location
}
