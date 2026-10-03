@echo off
setlocal
cd /d "%~dp0\.."

rem === Konfiguration ===
rem Welche Node-Mesh-Slots starten (1, 2 und/oder 3). Jeder Slot hat eigene Ports + eigene Daten.
rem Slot 1: Einrichtungsseite http://localhost:8790   Slot 2: 8800   Slot 3: 8810
set MESH_SLOTS=1 2
rem Profil: standard (6h), high-security (1h), offline-tolerant (24h)
set MESH_PROFILE=standard
rem Anzahl Nodes pro Slot (1 bis 500)
set MESH_NODES=10

echo Starte Relay-Server ...
start "NexonAI Relay" /D "%CD%\server" cmd /k "start-windows.bat"

for %%S in (%MESH_SLOTS%) do (
  echo Starte Node-Mesh Slot %%S ...
  start "NexonAI Mesh Slot %%S" /D "%CD%\node-mesh-server" cmd /k "set NODE_SLOT=%%S&& set NODE_PROFILE=%MESH_PROFILE%&& set NODE_MESH_NODES=%MESH_NODES%&& node dist\index.js"
)

echo Starte Web-Reporter (Port 5173) ...
start "NexonAI Web-Reporter" /D "%CD%\web-reporter" cmd /k "node serve.js"

echo.
echo Gestartet: Relay, Node-Mesh, Web-Reporter - je ein eigenes Fenster.
echo Die Officer-App startest du separat mit start-officer.bat, sobald der Relay seinen
echo Verbindungscode (unpruuf-relay:v1:...) im Relay-Fenster anzeigt.
timeout /t 8 >nul
