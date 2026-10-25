#!/usr/bin/env bash
# unpruuf rotating list feed (Linux/macOS). Setup page: http://localhost:8841/?t=<token> (link printed at start)
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then npm install; fi
npm run build
echo "Setup page: the link http://localhost:8841/?t=... with a new access token is printed below (token also in data/feed/admin-token)."
exec node dist/feedIndex.js
