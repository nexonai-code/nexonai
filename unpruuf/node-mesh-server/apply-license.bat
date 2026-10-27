@echo off
setlocal
cd /d "%~dp0"
if not exist dist (
  echo Noch nicht installiert - bitte zuerst install.bat ausfuehren.
  pause
  exit /b 1
)
rem Slot wie beim Start des Servers ^(node.env.bat^), sonst Slot 1.
if exist node.env.bat call node.env.bat
if "%NODE_SLOT%"=="" set NODE_SLOT=1
node apply-license.js
echo.
pause
