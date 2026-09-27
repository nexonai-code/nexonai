@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nu a fost gasit. Instaleaza-l de pe https://nodejs.org si incearca din nou.
  pause
  exit /b 1
)

echo Instalez dependintele...
call npm install
if errorlevel 1 (
  echo npm install a esuat - vezi eroarea de mai sus.
  pause
  exit /b 1
)

echo Construiesc aplicatia...
call npm run build
if errorlevel 1 (
  echo Build-ul a esuat - vezi eroarea de mai sus.
  pause
  exit /b 1
)

echo.
echo Gata. Ruleaza start.bat pentru a porni panoul ofiterului.
pause
