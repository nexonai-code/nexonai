#!/usr/bin/env node
// Standalone check for one relay-pool manifest code, without touching the private key — the
// same verification a device does on import (RelayPoolManager.importManifest), useful for
// testing a manifest before distributing it, or for debugging one a user says fails to import.
'use strict';

const fs = require('fs');
const path = require('path');
const { publicKeyFromB64, verifyManifest } = require('./lib');

const code = process.argv[2];
if (!code) {
  console.error('Usage: node verify.js "<unpruuf-relaypool:v1:...>"');
  process.exit(1);
}

const keyFile = path.join(__dirname, 'private-key.json');
if (!fs.existsSync(keyFile)) {
  console.error(`No key pair found at ${keyFile}. Run 'node keygen.js' first (or paste the`);
  console.error('public key into this script if you only have the public half).');
  process.exit(1);
}
const { publicKeyB64 } = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
const publicKey = publicKeyFromB64(publicKeyB64);

const parsed = verifyManifest(publicKey, code);
if (!parsed) {
  console.error('INVALID — signature does not verify, or the code is malformed.');
  process.exit(1);
}

console.log('Signature: VALID');
console.log('Org:      ', parsed.org);
console.log('Issued:   ', new Date(parsed.issuedAtMs).toISOString());
console.log('Relays:   ');
for (const r of parsed.relays) console.log('  -', r);
