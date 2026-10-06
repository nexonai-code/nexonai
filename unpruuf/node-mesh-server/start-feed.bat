@echo off
setlocal
cd /d "%~dp0"

if not exist dist (
  echo Noch nicht installiert - bitte zuerst install.bat ausfuehren.
  pause
  exit /b 1
)

echo.
echo unpruuf LISTEN-DIENST: gibt Ihren Mitarbeitern die aktuellen Node-Listen.
echo Seine Onion-Adresse aendert sich regelmaessig, nur die Apps rechnen sie aus.
echo Die Einrichtungsseite oeffnet sich gleich im Browser: http://localhost:8841
echo Dieses Fenster offen lassen - schliessen stoppt den Dienst.
start "" /b cmd /c "timeout /t 4 /nobreak >nul & start http://localhost:8841"
node dist\feedIndex.js
pause
