#!/bin/bash
# Removes the second relay's background service (see install-relay-b-service.command). Its
# identity, onion address and queued messages are left untouched under server/instances/b/.
cd "$(dirname "$0")/.."
LABEL="com.nexonai.unpruuf.relay-b"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || launchctl unload "$PLIST" 2>/dev/null || true
rm -f "$PLIST"

echo "Second relay's background service removed. It is no longer running."
echo
echo "Its identity and onion address are untouched — start it again any time with"
echo "./mac/start-relay-b.command, or reinstall the service with"
echo "./mac/install-relay-b-service.command."
echo
read -n 1 -s -r -p "Press any key to close..."
echo
