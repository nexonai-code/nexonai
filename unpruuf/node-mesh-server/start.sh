#!/usr/bin/env bash
# unpruuf Business Node server (Linux/macOS). Usage: ./start.sh [slot 1-3] [profile] [nodes 1-500]
#   profile: standard (6h, default) | high-security (1h) | offline-tolerant (24h)
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then npm install; fi
npm run build
export NODE_SLOT="${1:-${NODE_SLOT:-1}}"
export NODE_PROFILE="${2:-${NODE_PROFILE:-standard}}"
export NODE_MESH_NODES="${3:-${NODE_MESH_NODES:-10}}"
echo "Setup page: http://localhost:$((8790 + (NODE_SLOT - 1) * 10))"
exec node dist/index.js
