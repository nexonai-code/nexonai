@echo off
setlocal
cd /d "%~dp0"

if not exist dist\unpruuf-node-mesh.exe (
  echo dist\unpruuf-node-mesh.exe fehlt - den ganzen Ordner zusammen lassen.
  pause
  exit /b 1
)

rem Temp Node: alles nur im Arbeitsspeicher, jeder Start = neue Adresse.
rem Laeuft auf eigenen Ports ^(Slot 3^), damit er neben einem normalen Node auf demselben
rem Rechner laufen kann.
set NODE_SLOT=3
set EPHEMERAL=1
echo.
echo TEMP NODE fuer genau EINEN Chat. Fenster schliessen = Node und Adresse sind weg.
echo Die Einrichtungsseite oeffnet sich gleich: http://localhost:8810
start "" /b cmd /c "timeout /t 4 /nobreak >nul & start http://localhost:8810"
dist\unpruuf-node-mesh.exe
pause
