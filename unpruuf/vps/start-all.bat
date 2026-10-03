@echo off
setlocal
cd /d "%~dp0\.."

rem === Konfiguration ===
rem Relay-Server laeuft auf 8787. Jede Node-Mesh-Instanz bekommt einen eigenen Port + eigene Datenbank.
set RELAY_PORT=8787
set MESH_PORTS=8788 8789 8790

echo Starte Relay-Server auf Port %RELAY_PORT% ...
start "NexonAI Relay %RELAY_PORT%" /D "%CD%\server" cmd /k "set PORT=%RELAY_PORT%&& node dist\windows-start.js"

for %%P in (%MESH_PORTS%) do (
  if not exist "%CD%\vps\data\mesh-%%P" mkdir "%CD%\vps\data\mesh-%%P"
  echo Starte Node-Mesh auf Port %%P ...
  start "NexonAI Mesh %%P" /D "%CD%\node-mesh-server" cmd /k "set PORT=%%P&& set NODE_MESH_DATA_DIR=%CD%\vps\data\mesh-%%P&& node dist\index.js"
)

echo.
echo Alle Server gestartet (je ein eigenes Fenster). Fenster schliessen = Server stoppt.
timeout /t 5 >nul
