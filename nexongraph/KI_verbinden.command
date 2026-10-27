#!/bin/bash
# Registers NexonGraph in Claude Code, Claude Desktop and Cursor (macOS).
cd "$(dirname "$0")" || exit 1
if [ ! -x .venv/bin/python ]; then echo "  Bitte zuerst install.command öffnen."; read -r _; exit 1; fi
.venv/bin/python -m nexongraph install
echo "  Claude Desktop und Cursor danach neu starten."
read -r -p "  Enter zum Schließen " _
