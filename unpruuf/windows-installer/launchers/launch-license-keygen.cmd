@echo off
set "PATH=%~dp0runtime;%PATH%"
cd /d "%~dp0license-tool"
if exist private-key.json (
  echo Es gibt schon einen Lizenzschluessel: %~dp0license-tool\private-key.json
  echo Ein neuer wuerde alle bisherigen Lizenzen ungueltig machen. Abbruch.
  echo Oeffentlicher Schluessel / public key:
  node public-key.js
  pause
  exit /b 1
)
echo.
echo ACHTUNG: Ein neues Schluesselpaar macht ALLE bisher ausgestellten Lizenzen ungueltig.
echo Nur wenn dein alter Schluessel verloren ist. Die Apps, der Server und Control muessen dann
echo mit dem neuen oeffentlichen Schluessel neu gebaut werden.
echo.
set /p CONFIRM=Zum Fortfahren JA eingeben: 
if /i not "%CONFIRM%"=="JA" (echo Abgebrochen. & pause & exit /b 1)
node keygen.js
echo.
echo WICHTIG: private-key.json jetzt an ZWEI Orten sichern ^(USB-Stick, Passwortmanager^). Nie per E-Mail oder Chat senden.
pause
