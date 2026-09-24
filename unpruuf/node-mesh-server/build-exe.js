#!/usr/bin/env node
// Builds a single, standalone unpruuf-node-mesh.exe that needs no separate Node.js install to
// RUN (only to BUILD, here, once) — see EXE_BUILD.md for the full explanation and verification
// notes. Mirrors ../server/build-exe.js's approach exactly (same technique, same reasoning) —
// see that file's own comments for the parts that aren't repeated here.
//
// Uses Node's own "Single Executable Application" (SEA) feature: bundles the app into one JS
// file (esbuild), asks Node to prepare a "blob" of it, then injects that blob into a COPY of the
// very Node binary currently running this script (via `postject`) — so the result really is a
// real node.exe with the app baked in, not an emulation of one.
//
// The one thing that can't be embedded in the blob is better-sqlite3's compiled native addon
// (a .node file) — it ships as a small sibling file instead. See src/sea-entry.ts and
// src/sqliteNativeBinding.ts for how that gets loaded back at runtime.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = __dirname;
const OUT_DIR = path.join(ROOT, "build", "unpruuf-node-mesh");
const EXE_NAME = "unpruuf-node-mesh.exe";

function step(label) {
  console.log(`\n[build-exe] ${label}`);
}

function run(cmd, args, options) {
  execFileSync(cmd, args, { stdio: "inherit", cwd: ROOT, ...options });
}

function main() {
  if (process.platform !== "win32") {
    console.warn(
      "[build-exe] WARNING: not running on Windows. The resulting file will only run on this " +
        "machine's platform, not on Windows — run this script ON Windows to produce a real " +
        "unpruuf-node-mesh.exe others can use without installing Node.js.\n"
    );
  }

  if (!fs.existsSync(path.join(ROOT, "node_modules", "typescript"))) {
    step("0/5 Dependencies not installed yet — running npm install first...");
    run("npm", ["install"], { shell: process.platform === "win32" });
  }

  step("1/5 Compiling TypeScript (npm run build)...");
  // On Windows, npm itself is npm.cmd — a batch script, not a real executable. Windows can only
  // run those through a shell (cmd.exe), not by spawning them directly; skipping `shell: true`
  // here fails with EINVAL (confirmed against a real Windows run for ../server/'s identical
  // build script). Not needed for postject/node further down since those spawn a real .exe.
  run("npm", ["run", "build"], { shell: process.platform === "win32" });

  step("2/5 Bundling into a single file (esbuild)...");
  fs.mkdirSync(path.join(OUT_DIR, "dist"), { recursive: true });
  const bundlePath = path.join(OUT_DIR, "dist", "bundle.js");
  // Uses esbuild's JS API rather than shelling out to its CLI binary directly — the CLI's exact
  // shape (a JS launcher vs. a native binary at bin/esbuild) has changed across esbuild versions;
  // the API is the stable, documented way to call it.
  require("esbuild").buildSync({
    entryPoints: [path.join(ROOT, "dist", "sea-entry.js")],
    bundle: true,
    platform: "node",
    target: `node${process.versions.node.split(".")[0]}`,
    outfile: bundlePath,
  });

  step("3/5 Preparing the Node SEA blob...");
  const seaConfigPath = path.join(OUT_DIR, "sea-config.json");
  const blobPath = path.join(OUT_DIR, "sea-prep.blob");
  fs.writeFileSync(
    seaConfigPath,
    JSON.stringify({ main: bundlePath, output: blobPath, disableExperimentalSEAWarning: true }, null, 2)
  );
  run(process.execPath, ["--experimental-sea-config", seaConfigPath]);

  step("4/5 Copying the Node binary and injecting the app into it...");
  const exePath = path.join(OUT_DIR, "dist", EXE_NAME);
  fs.copyFileSync(process.execPath, exePath);
  fs.chmodSync(exePath, 0o755);
  run(process.execPath, [
    require.resolve("postject/dist/cli.js"),
    exePath,
    "NODE_SEA_BLOB",
    blobPath,
    "--sentinel-fuse",
    "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
    "--overwrite",
  ]);

  step("5/5 Copying the better-sqlite3 native addon (can't be embedded in the blob itself)...");
  const nativeSrc = path.join(ROOT, "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node");
  const nativeDestDir = path.join(OUT_DIR, "native");
  fs.mkdirSync(nativeDestDir, { recursive: true });
  fs.copyFileSync(nativeSrc, path.join(nativeDestDir, "better_sqlite3.node"));

  // Clean up build-only intermediate files — keep the shipped folder minimal.
  fs.rmSync(bundlePath, { force: true });
  fs.rmSync(seaConfigPath, { force: true });
  fs.rmSync(blobPath, { force: true });

  console.log(`\n[build-exe] Done. Hand out the whole "${path.relative(ROOT, OUT_DIR)}" folder — ` +
    `keep dist/ and native/ together, don't move the .exe out on its own.\n` +
    `Double-clicking dist\\${EXE_NAME} is now the entire setup for whoever receives it: no ` +
    `Node.js to install. It still needs to be reachable only via this node's own Tor hidden ` +
    `service, set up separately (this package has no bundled Tor process manager yet — see ` +
    `README.md's status note) — same as running it via "npm start" already does today.\n` +
    `Set EPHEMERAL=1 before launching (or pass --ephemeral) to run it as a Temp Node instead ` +
    `(NODE_MESH_SPEC.md §7) — identity and message store both stay in memory only, nothing ` +
    `written next to the exe.`);
}

main();
