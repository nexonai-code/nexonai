@echo off
cd /d "%~dp0"

if not exist node_modules (
  echo Installing dependencies (first run only)...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed. Is Node.js installed? https://nodejs.org
    pause
    exit /b 1
  )
)

node server.js
pause
