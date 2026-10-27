@echo off
setlocal
chcp 65001 >nul
title NexonGraph - Ordner bauen
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo  Bitte zuerst install.bat starten.
  pause
  exit /b 1
)
set "ZIEL=%~1"
if "%ZIEL%"=="" (
  echo  Tipp: Du kannst einen Ordner direkt auf diese Datei ziehen.
  set /p "ZIEL= Ordner-Pfad eingeben: "
)
if "%ZIEL%"=="" exit /b 1
".venv\Scripts\python.exe" -m nexongraph build "%ZIEL%" --open
pause
