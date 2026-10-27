@echo off
set "PATH=%~dp0runtime;%PATH%"
if not exist "%~dp0license-tool\private-key.json" (
  echo.
  echo Hier fehlt der Lizenzschluessel: %~dp0license-tool\private-key.json
  echo Kopiere deine private-key.json in diesen Ordner und starte das Programm erneut.
  echo Ist der Schluessel verloren: Startmenue "unpruuf Licence key, create new" ^(macht alle bisherigen Lizenzen ungueltig^).
  echo.
  echo The licence key is missing: copy your private-key.json into the license-tool folder.
  pause
  exit /b 1
)
call "%~dp0license-tool\gui\start-windows.bat"
