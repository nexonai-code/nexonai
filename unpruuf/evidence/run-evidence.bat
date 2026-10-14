@echo off
setlocal
cd /d "%~dp0"
echo Building the node server once ...
pushd ..\node-mesh-server
if not exist node_modules call npm install || goto :fail
call npm run build || goto :fail
popd
echo.
echo Running all checks (this compares the Tor hashes online and runs the node server tests) ...
node 00-run-all.js --online --tests
echo.
echo Report: %~dp0REPORT.md
pause
exit /b 0
:fail
echo Build failed. Is Node.js 20 or newer installed?
pause
exit /b 1
