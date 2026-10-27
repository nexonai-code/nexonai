@echo off
setlocal
chcp 65001 >nul
title NexonGraph - Deinstallieren
cd /d "%~dp0"
echo.
choice /c JN /m " NexonGraph aus Claude/Cursor austragen und die Programmumgebung loeschen [J/N]"
if errorlevel 2 exit /b 0
if exist ".venv\Scripts\python.exe" ".venv\Scripts\python.exe" -m nexongraph uninstall
if exist ".venv" rmdir /s /q ".venv"
del "%USERPROFILE%\Desktop\NexonGraph.lnk" >nul 2>nul
echo.
echo  Erledigt. Deine Graphen (Ordner nexongraph-out) und Einstellungen
echo  (%%APPDATA%%\NexonGraph) bleiben erhalten und koennen von Hand geloescht werden.
pause
