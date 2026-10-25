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
echo Die Einrichtungsseite oeffnet sich gleich im Browser (mit einem Zugangs-Schluessel, der bei jedem Start neu ist).
echo Falls nicht: den Link beginnend mit http://localhost:8841/?t= aus diesem Fenster in den Browser kopieren.
echo Dieses Fenster offen lassen - schliessen stoppt den Dienst.
set NODE_MESH_OPEN_BROWSER=1
node dist\feedIndex.js
pause
