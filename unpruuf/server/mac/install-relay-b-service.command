#!/bin/bash
# Installs the SECOND relay (see start-relay-b.command) as its own background launchd service,
# under a different label/log than the main one, so both can run at the same time indefinitely.
cd "$(dirname "$0")/.."
SERVER_DIR="$(pwd)"
LABEL="com.nexonai.unpruuf.relay-b"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs"
LOG="$LOG_DIR/unpruuf-relay-b.log"
INSTANCE_DIR="$SERVER_DIR/instances/b"

pause_and_exit() {
  echo
  read -n 1 -s -r -p "Press any key to close..."
  echo
  exit "$1"
}

NODE_BIN="$(command -v node)"
if [ -z "$NODE_BIN" ]; then
  echo "Node.js was not found. Install it from https://nodejs.org (or run: brew install node) and try again."
  pause_and_exit 1
fi

if [ ! -f "$INSTANCE_DIR/relay-identity.json" ]; then
  echo "This second relay has never been set up yet."
  echo
  echo "Run ./mac/start-relay-b.command once first — it asks how long to keep undelivered messages"
  echo "and creates this instance's credentials. Once that's done, run this installer again."
  pause_and_exit 1
fi

echo "Building..."
npm run build
if [ $? -ne 0 ]; then
  echo "Build failed - see the error above."
  pause_and_exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"

NODE_DIR="$(dirname "$NODE_BIN")"

cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_BIN</string>
        <string>$SERVER_DIR/dist/mac-start.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$SERVER_DIR</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$LOG</string>
    <key>StandardErrorPath</key>
    <string>$LOG</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>$NODE_DIR:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>PORT</key>
        <string>8788</string>
        <key>RELAY_DATA_DIR</key>
        <string>$INSTANCE_DIR</string>
    </dict>
</dict>
</plist>
PLIST_EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null || launchctl load "$PLIST"
if [ $? -ne 0 ]; then
  echo "Could not start the service - see the error above."
  pause_and_exit 1
fi

echo
echo "Installed. This second relay (port 8788) now runs in the background alongside the main one."
echo
echo "  Live log:        tail -f \"$LOG\""
echo "  Show QR again:   ./mac/show-code-b.command"
echo "  Status:          ./mac/status-b.command"
echo "  Remove service:  ./mac/uninstall-relay-b-service.command"
pause_and_exit 0
