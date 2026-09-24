# Building a standalone `unpruuf-relay.exe`

For when even `start-windows.bat` (double-click, Node.js required) is too much to ask of whoever
is going to run the relay. This produces a single `.exe` that needs **no separate Node.js
install to run** — only to *build*, once, here.

## Who does what

- **You** (or whoever has Node.js already, e.g. Gabriel): run this build **once**, on a Windows
  machine, to produce `unpruuf-relay.exe`.
- **Whoever receives the built folder**: double-click the `.exe`. Nothing else to install —
  Node.js isn't needed on their machine, and Tor downloads itself automatically on first run
  (see `windows/README.md` / `CHANGELOG.md`, same mechanism `start-windows.bat` already got).

## How

```bat
npm install
npm run build:exe
```

Produces `build/unpruuf-relay/`:
```
unpruuf-relay/
  dist/unpruuf-relay.exe   <- double-click this
  native/better_sqlite3.node
  windows/tor/             <- Tor lands here automatically on first run
```

**Hand out the whole folder, not just the `.exe`** — `native/` and the eventual `windows/tor/`
contents have to stay next to it (see "How it works" below for why). Everything the app writes
at runtime (`relay-identity.json`, `relay.sqlite`, `torrc`) also lands directly in
`unpruuf-relay/`, right where it already does with `start-windows.bat` today.

Same flags as `start-windows.bat` still work by re-running the `.exe` directly (it's the same
app): `unpruuf-relay.exe --regenerate`, `--ttl <hours>`, `--tor-exe "C:\..."`.

## How it works

Uses Node's own **Single Executable Application (SEA)** feature: the app gets bundled into one
JS file (`esbuild`), Node prepares a "blob" of it, then `postject` injects that blob into a copy
of the *exact Node binary currently running the build* — so the result is a real `node.exe` with
the app baked in, not an emulation of one. This is why the build has to run on Windows: it copies
whatever `node.exe` you have installed there.

The one thing that can't be embedded in the blob is `better-sqlite3`'s compiled native addon (a
`.node` file — SEA can only embed JavaScript). It ships as `native/better_sqlite3.node` instead,
and gets loaded back at runtime by `src/sea-entry.ts` using `module.createRequire()` — a plain
`require()` for anything other than a Node built-in throws `ERR_UNKNOWN_BUILTIN_MODULE` inside a
SEA blob (confirmed directly, not assumed), so a real, unrestricted `require` bound to an actual
on-disk path is used instead, then handed to `better-sqlite3` through its own documented
`new Database(path, { nativeBinding })` override — see `src/sqliteNativeBinding.ts`'s doc comment
for the full chain.

## What's actually been verified vs. not

Built and run **end-to-end on Linux** (this repo's dev environment) as a stand-in for Windows,
since no Windows machine was available to build on directly:
- The full SEA pipeline (bundle → blob → inject) produces a working single executable.
- The native-addon loading trick works — a real SQLite write+read round-tripped correctly
  through it (not just "didn't crash").
- The built exe's Tor auto-download step ran for real against the actual Tor Project archive and
  correctly extracted a genuine Windows `tor.exe` (`PE32+ executable ... for MS Windows`,
  confirmed with `file`) — caught and fixed a real bug in that extraction step in the process
  (a subdirectory inside the bundle broke a `copyFileSync`-based copy loop).

**Not verified:** actually running the resulting `.exe` on a real Windows machine — starting
Tor, publishing a hidden service, and serving real relay traffic through it. The build mechanism
itself (SEA, `postject`, the native-addon trick) is Node/OS-agnostic and was exercised for real;
what's untested is Windows-specific execution of the final binary. Report back exactly what
happens on a real run — if something's off, it's very likely contained to `sea-entry.ts` or
`build-exe.js`, not the app logic itself (which is the same, unchanged code the already-working
`start-windows.bat` path runs).
