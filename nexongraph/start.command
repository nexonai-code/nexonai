#!/bin/bash
# NexonGraph start for macOS: double-click in Finder. Keep the window open while you use it.
cd "$(dirname "$0")" || exit 1
if [ ! -x .venv/bin/python ]; then echo "  Bitte zuerst install.command öffnen."; read -r _; exit 1; fi
echo "  NexonGraph startet, der Browser öffnet sich gleich. Beenden: in der Oberfläche oder Fenster schließen."
exec .venv/bin/python -m nexongraph serve
