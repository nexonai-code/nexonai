@echo off
setlocal
title TrustLine - Load demo data
call "%~dp0_node.bat" || exit /b 1
cd /d "%~dp0..\server"
if not defined TL_PORT set "TL_PORT=8080"
echo.
echo  Loading the demo network into the RUNNING relay (2-START.bat must be open).
echo  Creates two fictional operators, connections, two agents and some history.
echo.
"%NODE_EXE%" tools\seed-demo.js http://127.0.0.1:%TL_PORT%
if errorlevel 1 (
  echo.
  echo  The demo could not be loaded. Is the relay running? Was the demo loaded already?
  echo  To start from scratch: stop the relay, run 5-RESET-DATA.bat, start again.
  echo.
  pause
  exit /b 1
)
echo.
echo  Done. Logins, activation codes and key backup passphrases are in:
echo      server\data\DEMO-ACCESS.txt
echo.
start "" notepad "%CD%\data\DEMO-ACCESS.txt"
pause
