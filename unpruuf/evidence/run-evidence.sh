#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
echo "Building the node server once ..."
( cd ../node-mesh-server && { [ -d node_modules ] || npm install; } && npm run build )
echo
echo "Running all checks (online comparison of the Tor hashes, node server tests) ..."
node 00-run-all.js --online --tests
echo
echo "Report: $(pwd)/REPORT.md"
