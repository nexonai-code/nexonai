@echo off
set "PATH=%~dp0runtime;%PATH%"
cd /d "%~dp0license-tool"
node public-key.js
pause
