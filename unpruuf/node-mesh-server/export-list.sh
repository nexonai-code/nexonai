#!/usr/bin/env bash
# Writes the node list of the RUNNING server into a file (no browser needed).
# Usage: ./export-list.sh [slot 1-3] [target folder]
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d dist ]; then echo "Noch nicht gebaut - erst ./start.sh starten."; exit 1; fi
export NODE_SLOT="${1:-${NODE_SLOT:-1}}"
exec node dist/exportListCli.js "$NODE_SLOT" "${2:-$PWD}"
