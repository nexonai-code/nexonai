#!/bin/bash
# Works around a known CocoaPods/Xcode 27 incompatibility: Xcode 27 writes
# objectVersion = 110 into project.pbxproj, but CocoaPods 1.17.0's bundled
# xcodeproj gem (1.28.1) only recognizes object versions up to 100 (Xcode 26.3)
# and `pod install` fails with:
#   ArgumentError: Unable to find compatibility version string for object version '110'
# See: https://github.com/CocoaPods/CocoaPods/issues/12927 (open, unfixed as of
# 2026-09-24 — check if it's since been fixed before reaching for this again).
#
# This script temporarily lowers objectVersion to 100 (a version CocoaPods
# understands), then runs `pod install`. Xcode itself is backwards compatible
# with the lower-numbered format and works fine with it — but Xcode may bump
# objectVersion back up the next time IT saves the project, in which case
# just re-run this script before your next `pod install`. Harmless either way.
#
# Usage: run this from the folder containing UnpruufApp.xcodeproj (same
# folder as the Podfile) INSTEAD of running `pod install` directly:
#   ./pod-install-xcode27-workaround.sh

set -euo pipefail

PROJ="UnpruufApp.xcodeproj/project.pbxproj"
TARGET_VERSION=100

if [ ! -f "$PROJ" ]; then
  echo "Can't find $PROJ — run this from the folder containing UnpruufApp.xcodeproj"
  echo "(the same folder as Podfile)."
  exit 1
fi

CURRENT="$(grep -m1 'objectVersion = ' "$PROJ" | sed -E 's/[^0-9]*([0-9]+).*/\1/')"

if [ -z "$CURRENT" ]; then
  echo "Couldn't read objectVersion from $PROJ — its format may have changed since this"
  echo "script was written. Check manually before continuing."
  exit 1
fi

if [ "$CURRENT" -gt "$TARGET_VERSION" ]; then
  echo "objectVersion is $CURRENT — CocoaPods' bundled xcodeproj gem only understands up to $TARGET_VERSION."
  cp "$PROJ" "$PROJ.before-pod-install-fix"
  sed -i '' -E "s/objectVersion = [0-9]+;/objectVersion = ${TARGET_VERSION};/" "$PROJ"
  echo "Lowered to $TARGET_VERSION (backup saved at $PROJ.before-pod-install-fix)."
else
  echo "objectVersion is already $CURRENT, no change needed."
fi

echo "Running pod install..."
pod install

cat <<'EOF'

Done. From now on open UnpruufApp.xcworkspace, not .xcodeproj.

If a later `pod install` fails with the same "object version" error again,
Xcode probably re-saved the project and bumped objectVersion back up —
just re-run this script.
EOF
