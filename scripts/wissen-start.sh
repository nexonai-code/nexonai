#!/usr/bin/env bash
# SessionStart hook: rebuild the knowledge graph and print the brief. Never blocks a session.
set -u
fail() { echo "Wissensbasis nicht verfügbar: $1"; exit 0; }
cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" 2>/dev/null || fail "Projektordner"
command -v git >/dev/null 2>&1 || fail "git fehlt"
GITDIR=$(git rev-parse --git-dir 2>/dev/null) || fail "kein Git-Repo"
git rev-parse HEAD > "$GITDIR/wissen-session-base" 2>/dev/null || fail "kein Commit"
PY=$(command -v python3 || command -v python) || fail "Python fehlt"
ROOT=$(pwd)
[ -d "$ROOT/nexongraph/nexongraph" ] || fail "nexongraph/ fehlt im Repo"
# run from inside nexongraph/ so the package in the repo is used, not a shadowing folder
ng() { (cd "$ROOT/nexongraph" && "$PY" -m nexongraph "$@"); }
if ! (cd "$ROOT/nexongraph" && "$PY" -c "import yaml, networkx, nexongraph.brief") >/dev/null 2>&1; then
  "$PY" -m pip install -q -e "$ROOT/nexongraph" >/dev/null 2>&1 || fail "Installation von NexonGraph"
fi
ng build "$ROOT" --no-semantic >/dev/null 2>&1 || fail "Graph bauen"
ng brief "$ROOT" 2>/dev/null || fail "Kurzlage"
exit 0
