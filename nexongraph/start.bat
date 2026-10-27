@echo off
setlocal
chcp 65001 >nul
title NexonGraph
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo  NexonGraph ist noch nicht installiert. Bitte zuerst install.bat starten.
  pause
  exit /b 1
)
echo.
echo  NexonGraph startet, der Browser oeffnet sich gleich.
echo  Dieses Fenster offen lassen, solange du NexonGraph benutzt.
echo  Beenden: in der Oberflaeche "Beenden" oder dieses Fenster schliessen.
echo.
".venv\Scripts\python.exe" -m nexongraph serve
if errorlevel 1 pause
