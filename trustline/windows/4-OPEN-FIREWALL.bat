@echo off
setlocal
title TrustLine - Open firewall port
net session >nul 2>&1
if errorlevel 1 (
  echo.
  echo  This step needs administrator rights.
  echo  Right-click this file and choose "Run as administrator".
  echo.
  pause
  exit /b 1
)
if not defined TL_PORT set "TL_PORT=8080"
netsh advfirewall firewall delete rule name="TrustLine Relay" >nul 2>&1
netsh advfirewall firewall add rule name="TrustLine Relay" dir=in action=allow protocol=TCP localport=%TL_PORT% profile=private,domain
echo.
echo  Port %TL_PORT% is now open for private and domain networks (so the Android phone can reach the relay).
echo  On a VPS: also open the port in the provider's firewall, and use HTTPS for real operation.
echo.
pause
