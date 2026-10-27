#!/usr/bin/env bash
# SessionStart hook: rebuild the knowledge graph and print the brief. Never blocks a session.
set -u
fail() { echo "Wissensbasis nicht verfügbar: $1"; exit 0; }
cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" 2>/dev/null || fail "Projektordner"
command -v git >/dev/null 2>&1 || fail "git fehlt"
GITDIR=$(git rev-parse --git-dir 2>/dev/null) || fail "kein Git-Repo"
# hook input on stdin: {"source": "startup" | "resume" | "clear" | "compact", ...}
SOURCE=""
# portable (macOS has no `timeout`): the hook input is one line of JSON
if [ ! -t 0 ]; then
  IFS= read -r -t 2 INPUT || true
  SOURCE=$(printf '%s' "${INPUT:-}" | grep -o '"source"[^,}]*' | grep -o '[a-z]*"\?$' | tr -d '"')
fi
# the session base marks where this session started: only on a fresh start, or when none exists yet
if [ "$SOURCE" = "startup" ] || [ ! -s "$GITDIR/wissen-session-base" ]; then
  git rev-parse HEAD > "$GITDIR/wissen-session-base" 2>/dev/null || fail "kein Commit"
fi
PY=$(command -v python3 || command -v python) || fail "Python fehlt"
ROOT=$(pwd)
[ -d "$ROOT/nexongraph/nexongraph" ] || fail "nexongraph/ fehlt im Repo"
# run from inside nexongraph/ so the package in the repo is used, not a shadowing folder
ng() { (cd "$ROOT/nexongraph" && "$PY" -m nexongraph "$@"); }
if ! command -v nexongraph >/dev/null 2>&1 || ! (cd "$ROOT/nexongraph" && "$PY" -c "import yaml, networkx, nexongraph.brief") >/dev/null 2>&1; then
  "$PY" -m pip install -q -e "$ROOT/nexongraph" >/dev/null 2>&1 || fail "Installation von NexonGraph"
fi
ng build "$ROOT" --no-semantic >/dev/null 2>&1 || fail "Graph bauen"
ng brief "$ROOT" 2>/dev/null || fail "Kurzlage"
PERSON=$( (cd "$ROOT/nexongraph" && "$PY" -c "from nexongraph.persons import active_person; print(active_person('$ROOT'))") 2>/dev/null )
echo ""
echo "Active person: ${PERSON:-gabriel} (set by NEXON_PERSON or the local file .nexon-person; if someone else is writing, they say so and the session switches)."
exit 0
