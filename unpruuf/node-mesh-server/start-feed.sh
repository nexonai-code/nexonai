#!/usr/bin/env bash
# unpruuf rotating list feed (Linux/macOS). Setup page: http://localhost:8841
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then npm install; fi
npm run build
echo "Setup page: http://localhost:8841"
exec node dist/feedIndex.js
