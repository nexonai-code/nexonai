@echo off
set "PATH=%~dp0runtime;%PATH%"
if not exist "%~dp0license-tool\private-key.json" (
  echo.
  echo Hier fehlt der Lizenzschluessel: %~dp0license-tool\private-key.json
  echo Kopiere deine bestehende private-key.json in diesen Ordner und starte das Programm erneut.
  echo Nur wenn du ein NEUES Schluesselpaar willst: im Ordner "license-tool" mit "node keygen.js" erzeugen.
  echo Achtung: Dann passt der oeffentliche Schluessel in den Apps nicht mehr zu den neuen Codes.
  echo.
  echo The licence key is missing: copy your existing private-key.json into the license-tool folder.
  pause
  exit /b 1
)
call "%~dp0license-tool\gui\start-windows.bat"
