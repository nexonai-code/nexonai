#!/usr/bin/env bash
# unpruuf company bridge (Linux/macOS): a small unlisted Tor bridge for your own phones.
# Usage: ./start-bridge.sh <public-ip-or-dns> [port]      (default port 443)
#   Port 443 needs root (or: sudo setcap 'cap_net_bind_service=+ep' $(which node)); use 8443 otherwise.
#   Put it on a SMALL SEPARATE server, not on the node server. Open the TCP port in the firewall.
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then npm install; fi
npm run build
export NODE_MESH_BRIDGE_ADDRESS="${1:-${NODE_MESH_BRIDGE_ADDRESS:-}}"
export NODE_MESH_BRIDGE_PORT="${2:-${NODE_MESH_BRIDGE_PORT:-443}}"
if [ -z "$NODE_MESH_BRIDGE_ADDRESS" ]; then echo "Usage: ./start-bridge.sh <public-ip-or-dns> [port]"; exit 1; fi
exec node dist/bridgeIndex.js
