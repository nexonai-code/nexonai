@echo off
setlocal
title TrustLine - Reset data
cd /d "%~dp0..\server"
echo.
echo  WARNING: This permanently deletes ALL relay data (operators, agents, logs, keys).
echo  Stop the relay first (close the 2-START window).
echo.
set /p ANSWER=Type DELETE to continue: 
if /i not "%ANSWER%"=="DELETE" (
  echo  Cancelled.
  pause
  exit /b 0
)
if exist data rmdir /s /q data
echo.
echo  All data deleted. The next start creates a fresh relay.
echo.
pause
