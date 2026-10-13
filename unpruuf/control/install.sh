#!/bin/sh
# unpruuf Control: install dependencies and build (Linux / macOS).
set -e
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo "Node.js 20 or newer is needed (https://nodejs.org)"; exit 1; }
npm ci
npm run build
[ -f bundle/node-server.tgz ] || echo "bundle/node-server.tgz is missing: the server software is part of a complete delivery."
echo "Done. Start with ./start.sh"
