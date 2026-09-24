#!/bin/bash
# Reprints this relay's QR code and connection string — for pointing another device at it later,
# without restarting the relay (which would drop anything currently queued).
cd "$(dirname "$0")/.."
if [ ! -d node_modules ] || [ ! -f dist/mac-start.js ]; then
  echo "Building first..."
  npm install >/dev/null 2>&1
  npm run build || { echo "Build failed."; read -n 1 -s -r -p "Press any key to close..."; echo; exit 1; }
fi
node dist/mac-start.js --show-code
echo
read -n 1 -s -r -p "Press any key to close..."
echo
