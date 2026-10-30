@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js wurde nicht gefunden. Bitte von https://nodejs.org installieren ^(LTS^) und install.bat erneut starten.
  pause
  exit /b 1
)

echo Installiere Abhaengigkeiten ...
call npm install
if errorlevel 1 (
  echo npm install ist fehlgeschlagen - siehe Fehlermeldung oben.
  pause
  exit /b 1
)

echo Baue den Node ...
call npm run build
if errorlevel 1 (
  echo Build ist fehlgeschlagen - siehe Fehlermeldung oben.
  pause
  exit /b 1
)

echo.
echo Fertig. Jetzt start.bat doppelklicken.
echo Tor wird beim ersten Start automatisch heruntergeladen ^(einmalig, ca. 30-50 MB^).
pause
