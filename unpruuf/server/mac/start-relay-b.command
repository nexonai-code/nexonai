#!/bin/bash
# Runs a SECOND, fully independent relay on this same Mac — its own identity, its own onion
# address, its own port (8788 instead of 8787) — for testing "two separate people" scenarios
# without needing a second physical machine (e.g. pairing two iPhones against two DIFFERENT
# relays, as if each phone belonged to a different person). Everything it creates lives under
# server/instances/b/ (identity, Tor hidden-service keys, SQLite queue) — completely separate
# from the main relay's own files in server/ itself; the two never share any mutable state, only
# the read-only `tor` binary at mac/tor/tor and this same server/dist build.
#
# See ../README.md for what all of this actually does — this script only adds the env vars that
# point mac-start.js at a second, separate identity/port instead of the default one.
cd "$(dirname "$0")/.."
SERVER_DIR="$(pwd)"
export PORT=8788
export RELAY_DATA_DIR="$SERVER_DIR/instances/b"
mkdir -p "$RELAY_DATA_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found. Install it from https://nodejs.org (or run: brew install node) and try again."
  read -n 1 -s -r -p "Press any key to close..."
  echo
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies (first run only)..."
  npm install
  if [ $? -ne 0 ]; then
    echo "npm install failed - see the error above."
    read -n 1 -s -r -p "Press any key to close..."
    echo
    exit 1
  fi
fi

echo "Building..."
npm run build
if [ $? -ne 0 ]; then
  echo "Build failed - see the error above."
  read -n 1 -s -r -p "Press any key to close..."
  echo
  exit 1
fi

echo "[relay-b] second relay, port $PORT, data dir $RELAY_DATA_DIR"
node dist/mac-start.js "$@"
