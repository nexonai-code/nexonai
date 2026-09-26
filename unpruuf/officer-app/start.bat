@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

if not exist dist (
  echo Not built yet - run install.bat first.
  pause
  exit /b 1
)

rem The relay's connection string is remembered in officer.env.bat next to this script (not
rem committed to git - see .gitignore) so you only have to paste it once. The officer password
rem is NEVER remembered here - see README.md for why.
if exist officer.env.bat call officer.env.bat

if "%RELAY_CONNECTION_STRING%"=="" (
  echo.
  echo Paste the relay's connection string ^(unpruuf-relay:v1:...^) - printed by the relay
  echo app on the tablet/laptop it runs on:
  set /p RELAY_CONNECTION_STRING=^>
)

(
  echo @echo off
  echo set RELAY_CONNECTION_STRING=%RELAY_CONNECTION_STRING%
  if not "%RELAY_REACHABLE_BASE_URL%"=="" echo set RELAY_REACHABLE_BASE_URL=%RELAY_REACHABLE_BASE_URL%
) > officer.env.bat

echo.
echo Enter your officer password. This protects the case database and your identity key at
echo rest - remember it, there is no recovery if you lose it. NOTE: this plain Windows
echo prompt does not hide what you type - make sure nobody is reading over your shoulder.
set /p OFFICER_PASSWORD=^>

echo.
if "%RELAY_REACHABLE_BASE_URL%"=="" (
  echo Starting Tor - first run downloads it ^(one-time, ~30-50 MB^), then bootstraps a real
  echo connection to the relay's onion address. Takes a few seconds to under a minute.
) else (
  echo RELAY_REACHABLE_BASE_URL is set - skipping Tor, talking directly to %RELAY_REACHABLE_BASE_URL%.
)
echo Once it says "Dashboard listening", open http://localhost:3000 in your browser.
node dist\index.js
pause
