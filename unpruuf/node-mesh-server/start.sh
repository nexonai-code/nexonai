#!/usr/bin/env bash
# unpruuf Business Node (Linux/macOS). Usage: ./start.sh [slot 1-3] [profile]
#   profile: standard (6h, default) | high-security (1h) | offline-tolerant (24h)
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then npm install; fi
npm run build
export NODE_SLOT="${1:-${NODE_SLOT:-1}}"
export NODE_PROFILE="${2:-${NODE_PROFILE:-standard}}"
echo "Setup page: http://localhost:$((8790 + (NODE_SLOT - 1) * 10))"
exec node dist/index.js
