@echo off
setlocal
cd /d "%~dp0"

if not exist dist\unpruuf-node-mesh.exe (
  echo dist\unpruuf-node-mesh.exe fehlt - den ganzen Ordner zusammen lassen.
  pause
  exit /b 1
)

rem Slot wie bei start.bat aus node.env.bat; der Server muss laufen.
if exist node.env.bat call node.env.bat
if "%NODE_SLOT%"=="" set NODE_SLOT=1

echo Hole die Node-Liste von Server %NODE_SLOT% ^(der Server muss laufen^) ...
dist\unpruuf-node-mesh.exe --export-list "%~dp0."
echo.
pause
