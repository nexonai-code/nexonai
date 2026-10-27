@echo off
setlocal
chcp 65001 >nul
title NexonGraph - KI-Assistenten verbinden
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo  Bitte zuerst install.bat starten.
  pause
  exit /b 1
)
echo.
echo  Traegt NexonGraph in Claude Code (Skill + MCP), Claude Desktop und Cursor (MCP) ein.
echo  Bestehende Einstellungen werden vorher gesichert.
echo.
".venv\Scripts\python.exe" -m nexongraph install
echo.
echo  Claude Desktop und Cursor danach einmal neu starten.
pause
