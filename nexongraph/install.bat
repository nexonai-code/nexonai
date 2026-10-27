@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title NexonGraph - Installation
cd /d "%~dp0"
echo.
echo  ============================================
echo   NexonGraph - Installation
echo   NexonAI Consulting SRL
echo  ============================================
echo.

rem --- Python suchen: zuerst der Python-Launcher "py", dann "python"
set "PY="
where py >nul 2>nul && (py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)" >nul 2>nul && set "PY=py -3")
if not defined PY (
  where python >nul 2>nul && (python -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)" >nul 2>nul && set "PY=python")
)
if not defined PY (
  echo  Python 3.10 oder neuer wurde nicht gefunden.
  echo.
  where winget >nul 2>nul
  if errorlevel 1 (
    echo  Bitte Python von https://www.python.org/downloads/ installieren.
    echo  WICHTIG: beim Installieren "Add python.exe to PATH" ankreuzen.
    echo  Danach install.bat erneut starten.
    pause
    exit /b 1
  )
  choice /c JN /m " Python 3.12 jetzt automatisch mit winget installieren [J/N]"
  if errorlevel 2 exit /b 1
  winget install -e --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements
  echo.
  echo  Python wurde installiert. Bitte dieses Fenster schliessen und install.bat noch einmal starten.
  pause
  exit /b 0
)
for /f "delims=" %%v in ('%PY% -c "import sys; print(sys.version.split()[0])"') do set "PYV=%%v"
echo  Python gefunden: %PYV%

rem --- eigene Umgebung im Programmordner
if not exist ".venv\Scripts\python.exe" (
  echo  Lege die Programmumgebung an ...
  %PY% -m venv .venv
  if errorlevel 1 (
    echo  FEHLER: Die Umgebung konnte nicht angelegt werden.
    pause
    exit /b 1
  )
)
set "VPY=%~dp0.venv\Scripts\python.exe"
echo  Installiere Bausteine, das dauert beim ersten Mal 1 bis 3 Minuten ...
"%VPY%" -m pip install --upgrade pip --quiet --disable-pip-version-check
"%VPY%" -m pip install -r requirements.txt --quiet --disable-pip-version-check
if errorlevel 1 (
  echo  FEHLER beim Installieren der Bausteine. Internetverbindung pruefen und erneut starten.
  pause
  exit /b 1
)
"%VPY%" -m pip install -e . --quiet --disable-pip-version-check
if errorlevel 1 (
  echo  FEHLER beim Installieren von NexonGraph.
  pause
  exit /b 1
)

rem --- Selbsttest
"%VPY%" -c "import nexongraph, networkx, pypdf, docx; from nexongraph.extract_treesitter import treesitter_available as t; print('  Selbsttest ok, tree-sitter:', 'ja' if t() else 'nein (Regex-Fallback)')"
if errorlevel 1 (
  echo  FEHLER: Selbsttest fehlgeschlagen.
  pause
  exit /b 1
)

rem --- Verknuepfung auf dem Desktop
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\NexonGraph.lnk'); $s.TargetPath='%~dp0start.bat'; $s.WorkingDirectory='%~dp0'; $s.Description='NexonGraph starten'; $s.Save()" >nul 2>nul
if not errorlevel 1 echo  Verknuepfung "NexonGraph" auf dem Desktop angelegt.

echo.
echo  ============================================
echo   Fertig. Starten mit start.bat
echo   oder ueber "NexonGraph" auf dem Desktop.
echo  ============================================
echo.
choice /c JN /m " NexonGraph jetzt starten [J/N]"
if errorlevel 2 exit /b 0
start "" "%~dp0start.bat"
exit /b 0
