@echo off
setlocal
cd /d "%~dp0"

if not exist public\bundle.js (
  echo Not built yet - run install.bat first.
  pause
  exit /b 1
)

echo Starting the web-reporter page - open http://localhost:5173 in a browser.
echo Anyone on this network can also reach it at http://YOUR-IP-ADDRESS:5173
node serve.js
pause
