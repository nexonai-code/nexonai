#!/usr/bin/env node
// Signs the program files of one built Business node server so every server can check
// "is this the release NexonAI shipped, and is it unchanged?".
//
//   node sign-release.js [path-to-node-mesh-server] [--key private-key.json]
//
// Run it AFTER `npm run build` in the node-mesh-server folder and BEFORE you pack the release.
// It writes release-manifest.txt into that folder and prints the fingerprint to publish next to the
// download. Needs your private-key.json (offline, never shipped). No network.
'use strict';

const fs = require('fs');
const path = require('path');
const { privateKeyFromRecord, signRelease } = require('./lib');

const args = process.argv.slice(2);
let folder = path.join(__dirname, '..', 'node-mesh-server');
let keyFile = path.join(__dirname, 'private-key.json');
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--key') keyFile = path.resolve(args[++i] || '');
  else folder = path.resolve(args[i]);
}

if (!fs.existsSync(keyFile)) {
  console.error(`No key pair at ${keyFile}. Run 'node keygen.js' once, or pass --key <file>.`);
  process.exit(1);
}
try {
  const privateKey = privateKeyFromRecord(JSON.parse(fs.readFileSync(keyFile, 'utf8')));
  const r = signRelease(folder, privateKey);
  const line = `${new Date().toISOString()}  version ${r.version}  ${r.files} files  fingerprint ${r.fingerprint}\n`;
  fs.appendFileSync(path.join(__dirname, 'release-fingerprints.txt'), line);
  console.log(`Signed ${folder}`);
  console.log(`Version     : ${r.version}`);
  console.log(`Files       : ${r.files}`);
  console.log(`Fingerprint : ${r.fingerprint}`);
  console.log('Publish this fingerprint next to the download. (Also saved in release-fingerprints.txt)');
} catch (err) {
  console.error(String(err.message || err));
  process.exit(1);
}
