# Building a standalone `unpruuf-node-mesh.exe`

For when even `start-windows.bat` (double-click, Node.js required) is too much to ask of
whoever is going to run a node — or who's setting up a [Temp Node](NODE_MESH_SPEC.md's §7) on a
second Windows machine and doesn't want to install Node.js on it just for one trip. This produces
a single `.exe` that needs **no separate Node.js install to run** — only to *build*, once, here.

Same technique as `../server/`'s own `unpruuf-relay.exe` (see that package's `EXE_BUILD.md`) —
this doc only covers what's specific to `node-mesh-server/`.

## Who does what

- **You** (or whoever has Node.js already): run this build **once**, on a Windows machine, to
  produce `unpruuf-node-mesh.exe`.
- **Whoever receives the built folder**: double-click the `.exe`. Nothing else to install — Node.js
  isn't needed on their machine. Unlike `../server/`'s relay, this package has **no bundled Tor
  process manager yet** (see `README.md`'s status note) — the machine still needs its own Tor
  hidden service set up separately, pointing at whatever port this listens on (`PORT`, default
  8788), exactly the same as running it via `npm start` already requires today.

## How

```bat
npm install
npm run build:exe
```

Produces `build/unpruuf-node-mesh/`:
```
unpruuf-node-mesh/
  dist/unpruuf-node-mesh.exe   <- double-click this
  native/better_sqlite3.node
```

**Hand out the whole folder, not just the `.exe`** — `native/` has to stay next to it (see "How
it works" below for why). Everything the app writes at runtime (`node-mesh-identity.json`,
`node-mesh.sqlite`) lands directly in `unpruuf-node-mesh/`, right where it already does with
`start-windows.bat` today.

**Temp Node mode** (NODE_MESH_SPEC.md §7): set `EPHEMERAL=1` before launching, or pass
`--ephemeral` as an argument, exactly as documented in the main `README.md` — identity and message
store both stay in memory only, nothing gets written next to the exe at all, and every restart is
a fresh node identity.

## How it works

Uses Node's own **Single Executable Application (SEA)** feature: the app gets bundled into one JS
file (`esbuild`), Node prepares a "blob" of it, then `postject` injects that blob into a copy of
the *exact Node binary currently running the build* — so the result is a real `node.exe` with the
app baked in, not an emulation of one. This is why the build has to run on Windows: it copies
whatever `node.exe` you have installed there.

The one thing that can't be embedded in the blob is `better-sqlite3`'s compiled native addon (a
`.node` file — SEA can only embed JavaScript). It ships as `native/better_sqlite3.node` instead,
and gets loaded back at runtime by `src/sea-entry.ts` using `module.createRequire()` — a plain
`require()` for anything other than a Node built-in throws `ERR_UNKNOWN_BUILTIN_MODULE` inside a
SEA blob, so a real, unrestricted `require` bound to an actual on-disk path is used instead, then
handed to `better-sqlite3` through its own documented `new Database(path, { nativeBinding })`
override — see `src/sqliteNativeBinding.ts`'s doc comment for the full chain.

## What's actually been verified vs. not

Built and run **end-to-end on Linux** (this repo's dev environment) as a stand-in for Windows,
since no Windows machine was available to build on directly — same verification posture as
`../server/`'s identical mechanism, which this package's build reuses unchanged:
- The full SEA pipeline (bundle → blob → inject) produces a working single executable.
- The native-addon loading trick works — a real SQLite write+read round-tripped correctly through
  it (not just "didn't crash").
- `/health`, `/deposit`, `/fetch`, and `/fetchMany` all responded correctly against the built
  binary run directly (not through `npm start`/`ts-node`), including a real owner-secret-gated
  deposit followed by a read-only fetch of it back.
- `EPHEMERAL=1` mode produced a fresh owner secret each run and left no `node-mesh-identity.json`/
  `node-mesh.sqlite` file behind, as intended.

**Not verified:** actually running the resulting `.exe` on a real Windows machine, or reaching it
through a real Tor hidden service. The build mechanism itself (SEA, `postject`, the native-addon
trick) is Node/OS-agnostic and was exercised for real, including every HTTP endpoint; what's
untested is Windows-specific execution of the final binary. Report back exactly what happens on a
real run — if something's off, it's very likely contained to `sea-entry.ts` or `build-exe.js`, not
the app logic itself (which is the same, unchanged code the already-working `start-windows.bat`
path runs).
