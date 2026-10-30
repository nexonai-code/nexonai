@echo off
setlocal
cd /d "%~dp0"
echo unpruuf Control - installation
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js 20 or newer is needed. Install it from https://nodejs.org and run this file again.
  pause
  exit /b 1
)
call npm ci
if errorlevel 1 ( echo npm ci failed & pause & exit /b 1 )
call npm run build
if errorlevel 1 ( echo build failed & pause & exit /b 1 )
if not exist bundle\node-server.tgz (
  echo.
  echo bundle\node-server.tgz is missing: the server software is part of a complete delivery.
  echo If you build it yourself: node scripts\build-bundle.js ..\node-mesh-server
)
echo.
echo Done. Start Control with start.bat
pause
