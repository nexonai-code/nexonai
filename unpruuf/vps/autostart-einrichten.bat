@echo off
rem Als Administrator ausfuehren (Rechtsklick - Als Administrator ausfuehren).
schtasks /create /tn "NexonAI Server" /tr "\"%~dp0start-all.bat\"" /sc onlogon /rl highest /f
if errorlevel 1 (echo Fehlgeschlagen - als Administrator starten. & pause & exit /b 1)
echo Autostart eingerichtet: start-all.bat laeuft bei jeder Anmeldung auf dem Server.
pause
