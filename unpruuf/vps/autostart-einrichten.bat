@echo off
rem Rechtsklick - Als Administrator ausfuehren.
rem Startet Relay, Node-Mesh und Web-Reporter bei jeder Anmeldung. Officer-App bleibt manuell (Passwort).
schtasks /create /tn "NexonAI Server" /tr "\"%~dp0start-all.bat\"" /sc onlogon /rl highest /f
if errorlevel 1 (echo Fehlgeschlagen - als Administrator starten. & pause & exit /b 1)
echo Autostart eingerichtet.
pause
