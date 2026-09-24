# unpruuf License Tool — GUI

A local, no-install-needed-beyond-Node GUI wrapper around `issue.js`. Same signing logic
(`../lib.js`), same offline guarantee — nothing leaves this machine, no network call at all.

## Start it (Windows)

Double-click **`start-windows.bat`**. First run installs one dependency (Express) via
`npm install`, then opens `http://localhost:4321` in your default browser automatically. Leave
the black console window open while you use it — closing it stops the tool. Needs Node.js
installed (https://nodejs.org) if it isn't already — the .bat will tell you if it's missing.

## Start it (macOS/Linux)

```
cd gui
npm install
npm start
```

## What it needs

`../private-key.json` — the same private key `keygen.js` generates, must already exist one
folder up (in `license-tool/`, not inside `gui/`). If it's missing, the tool refuses to start
and tells you to run `node keygen.js` first from the `license-tool/` folder.

## Where issued licenses go

Every code you generate is appended to `gui/data/customers.json` — a plain JSON file, not a
database, so it's easy to read, back up, or hand-edit if you ever need to. Both `data/` and
`node_modules/` are gitignored; neither is meant to be committed or shipped in a project ZIP.
Back up `data/customers.json` yourself if you want a durable record of who has which serial —
nothing else does that for you.

## Relationship to the CLI tools

`issue.js`/`verify.js`/`keygen.js` in the parent folder still work exactly as before and are
unaffected by this — this GUI is an alternative front end for issuing, not a replacement for
the other tools. `verify.js` in particular is still the way to double-check a code against the
public key baked into the app, independent of whatever this GUI's own display says.
