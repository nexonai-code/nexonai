@echo off
rem Startet nur den Relay-Server (direkt, ohne server\start-windows.bat).
cd /d "%~dp0\..\server"
if not exist dist\windows-start.js (
  echo Relay ist noch nicht gebaut - bitte zuerst install-all.bat ausfuehren.
  pause
  exit /b 1
)
start "NexonAI Relay" cmd /k "node dist\windows-start.js"
