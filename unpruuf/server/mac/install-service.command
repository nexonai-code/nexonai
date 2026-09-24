#!/bin/bash
# Installs the relay as a macOS background service (launchd), so it keeps running after you close
# the Terminal window and starts again automatically when you log in. Double-click, or run from
# Terminal. Undo with uninstall-service.command in this same folder.
cd "$(dirname "$0")/.."
SERVER_DIR="$(pwd)"
LABEL="com.nexonai.unpruuf.relay"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs"
LOG="$LOG_DIR/unpruuf-relay.log"

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

# The very first run has to happen interactively: it asks how long undelivered messages should be
# kept before dropping them. launchd gives the process no terminal, so that question could never
# be answered — it would silently take the default and the operator would never know they were
# asked. Refuse instead of guessing on their behalf.
if [ ! -f "$SERVER_DIR/relay-identity.json" ]; then
  echo "This relay has never been set up yet."
  echo
  echo "Run ./start-mac.command once first — it asks how long to keep undelivered messages and"
  echo "creates your relay's credentials. Once that's done, run this installer again."
  pause_and_exit 1
fi

echo "Building..."
npm run build
if [ $? -ne 0 ]; then
  echo "Build failed - see the error above."
  pause_and_exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"

# An absolute path to node, plus its directory on PATH: launchd starts services with a minimal
# environment that does NOT include Homebrew's bin directory, so a bare "node" would not resolve.
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
    </dict>
</dict>
</plist>
PLIST_EOF

# bootout/bootstrap is the modern replacement for unload/load; the || true covers "wasn't loaded".
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null || launchctl load "$PLIST"
if [ $? -ne 0 ]; then
  echo "Could not start the service - see the error above."
  pause_and_exit 1
fi

echo
echo "Installed. The relay now runs in the background and starts automatically when you log in."
echo
echo "  Live log:        tail -f \"$LOG\""
echo "  Status:          cd \"$SERVER_DIR\" && node dist/mac-start.js --status"
echo "  Show QR again:   cd \"$SERVER_DIR\" && node dist/mac-start.js --show-code"
echo "  Remove service:  ./mac/uninstall-service.command"
echo
echo "Note: the log file is never rotated or deleted automatically. With heavy use it will grow"
echo "slowly (one line per message); delete it whenever you like, the relay recreates it."
pause_and_exit 0
