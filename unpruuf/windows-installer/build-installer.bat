@echo off
setlocal
cd /d "%~dp0"
rem Builds unpruuf-Setup-<version>.exe on a Windows PC. Needs: Node.js 22 LTS (nodejs.org) and Inno Setup 6 (jrsoftware.org/isdl.php).
where node >nul 2>nul || (echo Node.js fehlt. Bitte von https://nodejs.org installieren. & pause & exit /b 1)
set "ISCC=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" set "ISCC=%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" (echo Inno Setup 6 fehlt. Bitte von https://jrsoftware.org/isdl.php installieren. & pause & exit /b 1)
powershell -NoProfile -ExecutionPolicy Bypass -File build-stage.ps1 -Out "%~dp0build"
if errorlevel 1 (echo Aufbau fehlgeschlagen. & pause & exit /b 1)
for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy.MM.dd"') do set VERSION=%%d
"%ISCC%" /DAppVersion=%VERSION% /DStageDir="%~dp0build\stage" /DOutDir="%~dp0build" unpruuf.iss
if errorlevel 1 (echo Installer fehlgeschlagen. & pause & exit /b 1)
echo.
echo Fertig: %~dp0build\unpruuf-Setup-%VERSION%.exe
pause
