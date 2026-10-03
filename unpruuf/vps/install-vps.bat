@echo off
setlocal
cd /d "%~dp0\.."

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js fehlt. Bitte von https://nodejs.org die LTS-Version installieren, dann dieses Skript erneut starten.
  pause
  exit /b 1
)

for %%D in (server node-mesh-server) do (
  echo.
  echo === %%D: installiere und baue ===
  pushd %%D
  call npm install
  if errorlevel 1 ( echo npm install in %%D fehlgeschlagen & popd & pause & exit /b 1 )
  call npm run build
  if errorlevel 1 ( echo Build in %%D fehlgeschlagen & popd & pause & exit /b 1 )
  popd
)

echo.
echo Firewall: Die Server lauschen nur auf 127.0.0.1 (Tor). Keine Port-Freigabe noetig.
echo Fertig. Jetzt start-all.bat starten.
pause
