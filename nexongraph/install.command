#!/bin/bash
# NexonGraph installation for macOS: double-click in Finder.
cd "$(dirname "$0")" || exit 1
echo ""
echo "  NexonGraph – Installation (macOS)"
echo ""
if ! command -v python3 >/dev/null 2>&1 || ! python3 -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)" 2>/dev/null; then
  echo "  Python 3.10 oder neuer fehlt."
  echo "  Bitte von https://www.python.org/downloads/macos/ installieren und diese Datei erneut öffnen."
  read -r -p "  Enter zum Schließen " _; exit 1
fi
echo "  Python: $(python3 -c 'import sys; print(sys.version.split()[0])')"
[ -x .venv/bin/python ] || python3 -m venv .venv || { echo "  FEHLER: Umgebung konnte nicht angelegt werden."; read -r _; exit 1; }
echo "  Installiere Bausteine (beim ersten Mal 1 bis 3 Minuten) ..."
.venv/bin/python -m pip install -q --upgrade pip --disable-pip-version-check
.venv/bin/python -m pip install -q -r requirements.txt --disable-pip-version-check || { echo "  FEHLER beim Installieren. Internet prüfen."; read -r _; exit 1; }
.venv/bin/python -m pip install -q -e . --disable-pip-version-check || { echo "  FEHLER beim Installieren von NexonGraph."; read -r _; exit 1; }
.venv/bin/python -c "import nexongraph, networkx, yaml; print('  Selbsttest ok')" || { read -r _; exit 1; }
# inside the nexonai repo: remember who works on this Mac (local file, never committed)
if [ -d ../wissen ]; then
  echo ""
  read -r -p "  Wer arbeitet an diesem Mac? [n = Norbert, g = Gabriel] " WHO
  case "$WHO" in g|G) P=gabriel ;; *) P=norbert ;; esac
  echo "$P" > ../.nexon-person
  echo "  Gespeichert: $P (Datei .nexon-person, bleibt nur auf diesem Mac)."
fi
chmod +x start.command 2>/dev/null
echo ""
echo "  Fertig. Starten mit start.command (Doppelklick)."
read -r -p "  Jetzt starten? [j/n] " GO
[ "$GO" = "j" ] || [ "$GO" = "J" ] && exec ./start.command
exit 0
