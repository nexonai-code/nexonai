#!/usr/bin/env node
// Checks an unpruuf Business node server against its signed release list.
//
//   node tools/verify-release.js [folder] [--fingerprint "a1b2 c3d4 ..."]
//
// folder       the node-mesh-server folder (default: the one this tool sits in). Needs dist/ built
//              (install.bat does that) and release-manifest.txt from NexonAI.
// --fingerprint  the fingerprint NexonAI published for this release. The tool says whether the
//                signed list on this machine IS that release.
//
// Exit code 0 = unchanged and signed (and, if given, the fingerprint matches), 1 = anything else.
// Works on a COPY of the files too, so an auditor can check a server from the outside.
"use strict";
const path = require("path");
const fs = require("fs");

const args = process.argv.slice(2);
let folder = path.join(__dirname, "..");
let expected = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--fingerprint") expected = (args[++i] || "").replace(/\s+/g, "").toLowerCase();
  else folder = path.resolve(args[i]);
}

const mod = path.join(folder, "dist", "integrity.js");
if (!fs.existsSync(mod)) {
  console.error(`dist/integrity.js not found in ${folder}. Build the server first (install.bat).`);
  process.exit(1);
}
const { verifyIntegrity, describeIntegrity } = require(mod);
const r = verifyIntegrity(folder);

console.log("");
console.log("unpruuf Business node server, release check");
console.log("Folder      :", folder);
console.log("Result      :", describeIntegrity(r));
if (r.version) console.log("Version     :", r.version);
if (r.fingerprint) console.log("Fingerprint :", r.fingerprint);
for (const f of r.changed) console.log("  changed   :", f);
for (const f of r.missing) console.log("  missing   :", f);
for (const f of r.extra) console.log("  extra     :", f);

let ok = r.state === "ok";
if (expected) {
  const same = r.fingerprint && r.fingerprint.replace(/\s+/g, "") === expected;
  console.log("Published   :", same ? "MATCHES the fingerprint you gave" : "DOES NOT MATCH the fingerprint you gave");
  ok = ok && Boolean(same);
}
console.log("");
console.log(ok ? "OK" : "NOT OK");
if (r.state === "unsigned") console.log("There is no release-manifest.txt here. This looks like a development copy.");
if (r.state === "exe") console.log("Single-file program: compare the SHA-256 above with the one NexonAI published for the .exe.");
process.exit(ok || r.state === "exe" ? 0 : 1);
