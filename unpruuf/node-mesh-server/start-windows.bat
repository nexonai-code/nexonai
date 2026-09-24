@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found on PATH. Install it from https://nodejs.org and try again.
  echo Or use the standalone unpruuf-node-mesh.exe instead - see EXE_BUILD.md - it needs no
  echo separate Node.js install to run.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies (first run only)...
  call npm install
  if errorlevel 1 (
    echo npm install failed - see the error above.
    pause
    exit /b 1
  )
)

echo Building...
call npm run build
if errorlevel 1 (
  echo Build failed - see the error above.
  pause
  exit /b 1
)

node dist\index.js %*
pause
