@echo off
setlocal
title TrustLine - Install
cd /d "%~dp0.."
set "NODE_VER=v22.22.0"
set "NODE_DIR=%CD%\runtime"
set "NODE_ZIP=%TEMP%\trustline-node.zip"

echo.
echo  TrustLine installer
echo  ===================
echo  This downloads a private copy of Node.js %NODE_VER% into the folder "runtime".
echo  No administrator rights needed. Nothing is installed system-wide.
echo.

if exist "%NODE_DIR%\node.exe" (
  echo  Node.js is already installed here. Nothing to do.
  goto done
)

echo  Downloading Node.js ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri 'https://nodejs.org/dist/%NODE_VER%/node-%NODE_VER%-win-x64.zip' -OutFile '%NODE_ZIP%'"
if errorlevel 1 goto fail

echo  Unpacking ...
if exist "%CD%\runtime-tmp" rmdir /s /q "%CD%\runtime-tmp"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Force -Path '%NODE_ZIP%' -DestinationPath '%CD%\runtime-tmp'"
if errorlevel 1 goto fail
for /d %%D in ("%CD%\runtime-tmp\node-*") do move "%%D" "%NODE_DIR%" >nul
rmdir /s /q "%CD%\runtime-tmp" 2>nul
del "%NODE_ZIP%" 2>nul
if not exist "%NODE_DIR%\node.exe" goto fail

:done
echo.
"%NODE_DIR%\node.exe" --version
echo.
echo  Installation finished.
echo  Next: double-click 2-START.bat
echo.
pause
exit /b 0

:fail
echo.
echo  ERROR: The download or unpacking failed.
echo  Check your internet connection and try again.
echo  Alternative: install Node.js 22 or newer from https://nodejs.org and run 2-START.bat.
echo.
pause
exit /b 1
