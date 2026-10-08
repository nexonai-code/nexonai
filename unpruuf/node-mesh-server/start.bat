@echo off
setlocal
cd /d "%~dp0"

if not exist dist (
  echo Noch nicht installiert - bitte zuerst install.bat ausfuehren.
  pause
  exit /b 1
)

rem Profil und Slot werden beim ersten Start abgefragt und in node.env.bat gemerkt
rem ^(nicht in git - siehe .gitignore^). Zum Aendern node.env.bat loeschen.
if exist node.env.bat call node.env.bat

if "%NODE_SLOT%"=="" (
  echo.
  echo Welcher deiner Nodes ist das? ^(bis zu 3 eigene Nodes, jeder auf eigenem Geraet^)
  choice /c 123 /n /m "Slot 1, 2 oder 3: "
  if errorlevel 3 (set NODE_SLOT=3) else if errorlevel 2 (set NODE_SLOT=2) else (set NODE_SLOT=1)
)

if "%NODE_PROFILE%"=="" (
  echo.
  echo Wie lange sollen Nachrichten auf dem Node liegen?
  echo   1 = standard          ^(6 Stunden - empfohlen^)
  echo   2 = high-security     ^(1 Stunde - am wenigsten Daten gespeichert^)
  echo   3 = offline-tolerant  ^(24 Stunden - fuer oft offline Kontakte^)
  choice /c 123 /n /m "Profil 1, 2 oder 3: "
  if errorlevel 3 (set NODE_PROFILE=offline-tolerant) else if errorlevel 2 (set NODE_PROFILE=high-security) else (set NODE_PROFILE=standard)
)

if "%NODE_MESH_STORE%"=="" (
  echo.
  echo Wo sollen wartende Pakete liegen?
  echo   1 = auf der Platte      ^(ueberleben einen Neustart bis zum Ablauf der Zeit - Standard^)
  echo   2 = nur im Arbeitsspeicher ^(Neustart oder Stromausfall leert alles, nichts wird geschrieben^)
  choice /c 12 /n /m "Speicher 1 oder 2: "
  if errorlevel 2 (set NODE_MESH_STORE=ram) else (set NODE_MESH_STORE=disk)
)

(
  echo @echo off
  echo set NODE_SLOT=%NODE_SLOT%
  echo set NODE_PROFILE=%NODE_PROFILE%
  echo set NODE_MESH_STORE=%NODE_MESH_STORE%
) > node.env.bat

set /a ADMIN_PORT_DEFAULT=8790 + (%NODE_SLOT% - 1) * 10
echo.
echo Starte Server %NODE_SLOT%, Profil %NODE_PROFILE%, Pakete: %NODE_MESH_STORE% ...
echo Die Zahl der Nodes steckt in der Lizenz - sie startet automatisch mit allen lizenzierten Nodes.
echo Die Einrichtungsseite oeffnet sich gleich im Browser: http://localhost:%ADMIN_PORT_DEFAULT%
echo Beim ersten Start fragt die Seite nach dem Lizenzcode von NexonAI.
echo Dieses Fenster offen lassen - schliessen stoppt den Node.
start "" /b cmd /c "timeout /t 4 /nobreak >nul & start http://localhost:%ADMIN_PORT_DEFAULT%"
node dist\index.js
pause
