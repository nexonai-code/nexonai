@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nicht gefunden. Bitte von https://nodejs.org installieren.
  pause
  exit /b 1
)
if not exist dist (
  echo Noch nicht installiert - bitte zuerst install.bat ausfuehren.
  pause
  exit /b 1
)
echo.
echo Optional: Fingerprint der Version von NexonAI eingeben (leer lassen zum Ueberspringen).
set /p FP=Fingerprint: 
if "%FP%"=="" (
  node tools\verify-release.js
) else (
  node tools\verify-release.js --fingerprint "%FP%"
)
echo.
pause
