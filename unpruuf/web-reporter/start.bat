@echo off
setlocal
cd /d "%~dp0"

if not exist public\bundle.js (
  echo Nu este inca construit - ruleaza install.bat mai intai.
  pause
  exit /b 1
)

echo Pornesc pagina web-reporter - deschide http://localhost:5173 intr-un browser.
echo Oricine din aceasta retea o poate accesa si la http://ADRESA-TA-IP:5173
node serve.js
pause
