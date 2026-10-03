@echo off
rem Compliance Officer App. Fragt Relay-Verbindungscode (aus dem Relay-Fenster) und Passwort.
rem Danach im Browser auf dem Server: http://localhost:3000
cd /d "%~dp0\..\officer-app"
start "NexonAI Officer" cmd /k "start.bat"
