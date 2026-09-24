#!/bin/bash
cd "$(dirname "$0")"

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

node dist/mac-start.js "$@"
