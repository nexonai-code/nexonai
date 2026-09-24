# Ensures a Node.js on PATH that better-sqlite3's compiled native addon actually works with.
#
# Real bug hit on real hardware, 2026-09-24: this project's only system Node was v26.9.0 — too
# new for better-sqlite3 ^11.3.0's compiled binary, which is built against V8 APIs
# (GetPrototype/GetIsolate/This) that newer V8/Node builds have since removed. `npm run build`
# fails with real compiler errors, not a missing-dependency error, so it looks worse than it is.
#
# Fix: if the system `node` looks too new, download a known-good LTS build once into a
# per-project, persistent cache under ~/Library/Application Support (NOT /tmp — that's wiped on
# reboot and would silently reintroduce this exact failure) and prepend it to PATH for the rest
# of this script. System Node is never touched, no sudo, no Homebrew changes.
#
# Usage: `source "$(dirname "$0")/mac/lib/ensure-node.sh"` (or `mac/../mac/lib/...` as appropriate)
# near the top of any script in this project that calls `node`/`npm`.

NODE_FALLBACK_VERSION="20.18.1"
NODE_FALLBACK_DIR="$HOME/Library/Application Support/unpruuf-relay/node-${NODE_FALLBACK_VERSION}"

_unpruuf_node_major() {
  command -v node >/dev/null 2>&1 || return 1
  node -e 'console.log(process.versions.node.split(".")[0])' 2>/dev/null
}

_unpruuf_node_is_compatible() {
  local major
  major="$(_unpruuf_node_major)"
  [ -n "$major" ] && [ "$major" -le 22 ] 2>/dev/null
}

_unpruuf_install_fallback_node() {
  local arch url tarball
  arch="$(uname -m)"
  case "$arch" in
    arm64) arch="arm64" ;;
    x86_64) arch="x64" ;;
    *)
      echo "unpruuf-relay: unsupported architecture '$arch' for the bundled Node fallback."
      echo "Install Node.js <= 22 yourself (https://nodejs.org) and re-run."
      return 1
      ;;
  esac
  url="https://nodejs.org/dist/v${NODE_FALLBACK_VERSION}/node-v${NODE_FALLBACK_VERSION}-darwin-${arch}.tar.gz"
  echo "unpruuf-relay: system Node ($(node -v 2>/dev/null)) is too new for better-sqlite3's"
  echo "compiled addon. Downloading a local Node ${NODE_FALLBACK_VERSION} runtime just for this"
  echo "project (one-time, ~40MB, doesn't touch your system Node)..."
  mkdir -p "$NODE_FALLBACK_DIR"
  tarball="$(mktemp -t unpruuf-node).tar.gz"
  if ! curl -fsSL "$url" -o "$tarball"; then
    echo "unpruuf-relay: download failed ($url). Check your network and try again, or install"
    echo "Node.js <= 22 yourself (https://nodejs.org)."
    rm -f "$tarball"
    return 1
  fi
  tar -xzf "$tarball" -C "$NODE_FALLBACK_DIR" --strip-components=1
  rm -f "$tarball"
}

ensure_unpruuf_node() {
  if _unpruuf_node_is_compatible; then
    return 0
  fi
  if [ ! -x "$NODE_FALLBACK_DIR/bin/node" ]; then
    _unpruuf_install_fallback_node || return 1
  fi
  export PATH="$NODE_FALLBACK_DIR/bin:$PATH"
  if ! _unpruuf_node_is_compatible; then
    echo "unpruuf-relay: fallback Node still looks incompatible — something's wrong, please"
    echo "report the exact output above."
    return 1
  fi
}

ensure_unpruuf_node || {
  echo "unpruuf-relay: could not set up a working Node.js runtime."
  read -n 1 -s -r -p "Press any key to close..."
  echo
  exit 1
}
