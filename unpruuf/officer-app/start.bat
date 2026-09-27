@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
cd /d "%~dp0"

if not exist dist (
  echo Nu este inca construit - ruleaza install.bat mai intai.
  pause
  exit /b 1
)

rem Codul de conectare al releului este retinut in officer.env.bat langa acest script (nu
rem este trimis in git - vezi .gitignore), asa ca il lipesti o singura data. Parola ofiterului
rem NU este retinuta niciodata aici - vezi README.md pentru motiv.
if exist officer.env.bat call officer.env.bat

if "%RELAY_CONNECTION_STRING%"=="" (
  echo.
  echo Lipeste codul de conectare al releului ^(unpruuf-relay:v1:...^) - afisat de aplicatia
  echo de releu pe tableta/laptopul pe care ruleaza:
  set /p RELAY_CONNECTION_STRING=^>
)

(
  echo @echo off
  echo set RELAY_CONNECTION_STRING=%RELAY_CONNECTION_STRING%
  if not "%RELAY_REACHABLE_BASE_URL%"=="" echo set RELAY_REACHABLE_BASE_URL=%RELAY_REACHABLE_BASE_URL%
) > officer.env.bat

echo.
echo Introdu parola ta de ofiter. Aceasta protejeaza baza de date a cazurilor si cheia ta de
echo identitate stocate local - tine-o minte, nu exista recuperare daca o pierzi. ATENTIE:
echo aceasta fereastra simpla Windows nu ascunde ce scrii - asigura-te ca nimeni nu se uita.
set /p OFFICER_PASSWORD=^>

echo.
if "%RELAY_REACHABLE_BASE_URL%"=="" (
  echo Pornesc Tor - la prima rulare se descarca ^(o singura data, ~30-50 MB^), apoi se
  echo stabileste o conexiune reala catre adresa onion a releului. Dureaza de la cateva
  echo secunde pana la un minut.
) else (
  echo RELAY_REACHABLE_BASE_URL este setat - Tor este omis, se comunica direct cu %RELAY_REACHABLE_BASE_URL%.
)
echo Cand apare "Panoul asculta", deschide http://localhost:3000 in browser.
node dist\index.js
pause
