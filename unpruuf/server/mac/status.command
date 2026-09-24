#!/bin/bash
# Shows whether the relay is working: its onion address, message TTL, and what is currently
# waiting to be collected. Safe to run while the relay is running (including as a background
# service) — it only reads the relay's own files.
cd "$(dirname "$0")/.."
if [ ! -d node_modules ] || [ ! -f dist/mac-start.js ]; then
  echo "Building first..."
  npm install >/dev/null 2>&1
  npm run build || { echo "Build failed."; read -n 1 -s -r -p "Press any key to close..."; echo; exit 1; }
fi
node dist/mac-start.js --status
echo
read -n 1 -s -r -p "Press any key to close..."
echo
