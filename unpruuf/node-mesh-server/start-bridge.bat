@echo off
setlocal
cd /d "%~dp0"

if not exist dist (
  echo Noch nicht installiert - bitte zuerst install.bat ausfuehren.
  pause
  exit /b 1
)

if exist bridge.env.bat call bridge.env.bat

echo.
echo unpruuf FIRMEN-BRIDGE
echo Ein kleiner, nirgends gelisteter Server, ueber den eure Handys ins Tor-Netz kommen,
echo auch wenn ein Land oder ein Firmennetz Tor sperrt. Am besten auf einem eigenen,
echo kleinen Server ^(ein paar Euro im Monat^), nicht auf dem Node-Server.
echo.

if "%NODE_MESH_BRIDGE_ADDRESS%"=="" (
  echo Unter welcher Adresse ist dieser Rechner aus dem Internet erreichbar?
  set /p NODE_MESH_BRIDGE_ADDRESS="Oeffentliche IP oder DNS-Name: "
)
if "%NODE_MESH_BRIDGE_ADDRESS%"=="" (
  echo Ohne Adresse geht es nicht.
  pause
  exit /b 1
)
if "%NODE_MESH_BRIDGE_PORT%"=="" set NODE_MESH_BRIDGE_PORT=443

(
  echo @echo off
  echo set NODE_MESH_BRIDGE_ADDRESS=%NODE_MESH_BRIDGE_ADDRESS%
  echo set NODE_MESH_BRIDGE_PORT=%NODE_MESH_BRIDGE_PORT%
) > bridge.env.bat

echo.
echo Starte die Bridge auf %NODE_MESH_BRIDGE_ADDRESS%:%NODE_MESH_BRIDGE_PORT% ...
echo Beim ersten Start wird Tor geladen. Gleich erscheint die Bridge-Zeile in diesem Fenster.
echo Den Port %NODE_MESH_BRIDGE_PORT% ^(TCP^) in der Windows-Firewall und beim Hoster freigeben.
echo Dieses Fenster offen lassen - schliessen stoppt die Bridge.
node dist\bridgeIndex.js
pause
