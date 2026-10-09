#!/usr/bin/env bash
# Checks this node server against its signed release list. Usage: ./verify-release.sh ["a1b2 c3d4 ..."]
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d dist ]; then echo "Not built yet: run npm run build first."; exit 1; fi
if [ "${1:-}" != "" ]; then exec node tools/verify-release.js --fingerprint "$1"; fi
exec node tools/verify-release.js
