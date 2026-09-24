#!/bin/bash
# Shows whether the SECOND relay is working — same idea as status.command, for instance b.
cd "$(dirname "$0")/.."
export PORT=8788
export RELAY_DATA_DIR="$(pwd)/instances/b"
if [ ! -d node_modules ] || [ ! -f dist/mac-start.js ]; then
  echo "Building first..."
  npm install >/dev/null 2>&1
  npm run build || { echo "Build failed."; read -n 1 -s -r -p "Press any key to close..."; echo; exit 1; }
fi
node dist/mac-start.js --status
echo
read -n 1 -s -r -p "Press any key to close..."
echo
