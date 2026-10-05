@echo off
setlocal
title TrustLine - Self test
call "%~dp0_node.bat" || exit /b 1
cd /d "%~dp0..\server"
echo.
echo  Running the end-to-end self test (uses a temporary database, does not touch your data) ...
echo.
"%NODE_EXE%" --test test\e2e.test.js
echo.
pause
