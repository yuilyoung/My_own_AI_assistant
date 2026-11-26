@echo off
call "%~dp0Start.cmd" -Pet %*
exit /b %ERRORLEVEL%
