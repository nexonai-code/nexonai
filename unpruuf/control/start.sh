#!/bin/sh
cd "$(dirname "$0")"
[ -f dist/index.js ] || ./install.sh
echo "unpruuf Control runs at http://127.0.0.1:8860  (Ctrl+C stops it)"
exec node dist/index.js
