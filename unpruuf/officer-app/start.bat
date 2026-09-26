@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

if not exist dist (
  echo Not built yet - run install.bat first.
  pause
  exit /b 1
)

rem Non-secret relay settings are remembered in officer.env.bat next to this script (not
rem committed to git - see .gitignore) so you only have to paste them once. The officer
rem password is NEVER remembered here - see README.md for why.
if exist officer.env.bat call officer.env.bat

if "%RELAY_CONNECTION_STRING%"=="" (
  echo.
  echo Paste the relay's connection string ^(unpruuf-relay:v1:...^) - printed by the relay
  echo app on the tablet/laptop it runs on:
  set /p RELAY_CONNECTION_STRING=^>
)
if "%RELAY_REACHABLE_BASE_URL%"=="" (
  echo.
  echo Enter the relay's reachable address on this network, e.g. http://192.168.1.50:8787
  set /p RELAY_REACHABLE_BASE_URL=^>
)

(
  echo @echo off
  echo set RELAY_CONNECTION_STRING=%RELAY_CONNECTION_STRING%
  echo set RELAY_REACHABLE_BASE_URL=%RELAY_REACHABLE_BASE_URL%
) > officer.env.bat

echo.
echo Enter your officer password. This protects the case database and your identity key at
echo rest - remember it, there is no recovery if you lose it. NOTE: this plain Windows
echo prompt does not hide what you type - make sure nobody is reading over your shoulder.
set /p OFFICER_PASSWORD=^>

echo.
echo Starting the officer dashboard - open http://localhost:3000 in your browser once it says "listening".
node dist\index.js
pause
