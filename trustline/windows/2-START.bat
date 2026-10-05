@echo off
setlocal
title TrustLine Relay
call "%~dp0_node.bat" || exit /b 1
cd /d "%~dp0..\server"
if not defined TL_PORT set "TL_PORT=8080"

echo.
echo  Starting the TrustLine relay on port %TL_PORT% ...
echo.
echo  Open in this PC's browser:   http://localhost:%TL_PORT%/
echo  Open from the Android phone (same Wi-Fi), try one of these addresses:
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /C:"IPv4"') do echo      http://%%A:%TL_PORT%/
echo.
echo  First start only: admin passwords are written to  server\data\ADMIN-CREDENTIALS.txt
echo  Keep this window open. Close it (or press Ctrl+C) to stop the relay.
echo.
"%NODE_EXE%" index.js
echo.
echo  The relay has stopped.
pause
