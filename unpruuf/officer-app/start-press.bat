@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
cd /d "%~dp0"

echo unpruuf Press - redactie / newsroom

if not exist dist (
  echo Nu este inca construit - ruleaza install.bat mai intai. / Not built yet - run install.bat first.
  pause
  exit /b 1
)

rem Codul de conectare al releului este retinut in press.env.bat. Parola NU este retinuta niciodata.
rem The relay connection code is remembered in press.env.bat. The password is never stored.
if exist press.env.bat call press.env.bat

if "%RELAY_CONNECTION_STRING%"=="" (
  echo.
  echo Lipeste codul de conectare al releului ^(unpruuf-relay:v1:...^) / Paste the relay connection code:
  set /p RELAY_CONNECTION_STRING=^>
)

rem Doar forma unpruuf-relay:v1:... cu litere, cifre si : . _ - = este acceptata. Valoarea este scrisa
rem intre ghilimele, deci nimic din ce a fost lipit nu poate rula vreodata ca o comanda.
rem Only unpruuf-relay:v1:... with letters, digits and : . _ - = is accepted, and it is written quoted,
rem so nothing that was pasted can ever run as a command.
echo(!RELAY_CONNECTION_STRING!| findstr /r /c:"^unpruuf-relay:v1:[A-Za-z0-9:._=-]*$" >nul || (
  echo Codul nu are forma asteptata / The code does not look like unpruuf-relay:v1:... - nothing was saved.
  pause
  exit /b 1
)
(
  echo @echo off
  echo set "RELAY_CONNECTION_STRING=!RELAY_CONNECTION_STRING!"
  if not "!RELAY_REACHABLE_BASE_URL!"=="" echo set "RELAY_REACHABLE_BASE_URL=!RELAY_REACHABLE_BASE_URL!"
) > press.env.bat

echo.
echo Introdu parola ta. Ea protejeaza mesajele primite si cheia ta. Nu exista recuperare daca o pierzi.
echo Enter your password. It protects the tips you receive and your key. There is no recovery if you lose it.
set /p OFFICER_PASSWORD=^>

set OFFICER_EDITION=press
if "%PORT%"=="" set PORT=3001
if "%POLL_INTERVAL_MS%"=="" set POLL_INTERVAL_MS=4000

echo.
echo Cand apare "Panoul asculta", se deschide singur in browser ^(cu o cheie de acces noua la fiecare pornire^).
echo Daca nu, copiaza linkul care incepe cu http://localhost:%PORT%/?t= din aceasta fereastra. / If not, copy the link starting with http://localhost:%PORT%/?t= from this window.
echo Tine aceasta fereastra deschisa: mesajele asteapta pe server cel mult 24 de ore.
echo Keep this window open: tips wait on the server for 24 hours at most.
node dist\index.js
pause
