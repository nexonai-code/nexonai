#!/usr/bin/env bash
# Stop hook: exit 2 (once per set of findings) when code changed but its knowledge card did not.
set -u
cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" 2>/dev/null || exit 0
PY=$(command -v python3 || command -v python) || exit 0
ROOT=$(pwd)
[ -d "$ROOT/nexongraph/nexongraph" ] || exit 0
cd "$ROOT/nexongraph" || exit 0
"$PY" -c "import yaml, nexongraph.guard" >/dev/null 2>&1 || exit 0
"$PY" -m nexongraph guard "$ROOT"
exit $?
