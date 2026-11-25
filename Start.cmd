@echo off
setlocal
rem Let Windows PowerShell find its own modules when launched from PowerShell 7.
set "PSModulePath="
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launch.ps1" %*
set "assistant_exit=%ERRORLEVEL%"
if not "%assistant_exit%"=="0" pause
exit /b %assistant_exit%
