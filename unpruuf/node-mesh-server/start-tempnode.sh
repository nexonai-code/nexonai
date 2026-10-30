#!/usr/bin/env bash
# unpruuf Temp Node — memory only, new address on every start. Ctrl+C removes everything.
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then npm install; fi
npm run build
export NODE_SLOT=3 EPHEMERAL=1
echo "Setup page: http://localhost:8810"
exec node dist/index.js
