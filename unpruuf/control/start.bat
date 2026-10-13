@echo off
setlocal
cd /d "%~dp0"
if not exist dist\index.js (
  echo Not installed yet. Running install.bat first...
  call install.bat
)
echo unpruuf Control runs at http://127.0.0.1:8860  (close this window to stop it)
start "" http://127.0.0.1:8860
node dist\index.js
pause
