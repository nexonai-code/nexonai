@echo off
rem Internal helper: sets NODE_EXE to the private runtime or to a Node.js 22+ found on PATH.
set "NODE_EXE="
if exist "%~dp0..\runtime\node.exe" set "NODE_EXE=%~dp0..\runtime\node.exe"
if not defined NODE_EXE (
  where node >nul 2>nul
  if not errorlevel 1 set "NODE_EXE=node"
)
if not defined NODE_EXE (
  echo.
  echo  Node.js was not found. Please run 1-INSTALL.bat first.
  echo.
  pause
  exit /b 1
)
exit /b 0
