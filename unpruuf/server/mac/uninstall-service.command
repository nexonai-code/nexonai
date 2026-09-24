#!/bin/bash
# Removes the background service installed by install-service.command. Your relay identity,
# onion address and queued messages are left untouched — reinstalling later resumes with the
# same address and credentials, so contacts do not need to re-pair.
cd "$(dirname "$0")/.."
SERVER_DIR="$(pwd)"
LABEL="com.nexonai.unpruuf.relay"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || launchctl unload "$PLIST" 2>/dev/null || true
rm -f "$PLIST"

echo "Background service removed. The relay is no longer running."
echo
echo "Your identity, onion address and any queued messages are untouched — start it again"
echo "any time with ./start-mac.command, or reinstall the service with"
echo "./mac/install-service.command."
echo
read -n 1 -s -r -p "Press any key to close..."
echo
