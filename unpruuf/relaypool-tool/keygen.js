#!/usr/bin/env node
// Generates the ONE Ed25519 key pair that signs every relay-pool manifest. Run this exactly
// once per "relay-pool authority" — every manifest issued by issue.js after this needs the
// SAME private key to have been generated here, and every app build needs the matching public
// key baked into RelayPoolManager.PUBLIC_KEY_B64 (Android) and RelayPoolManager.swift's
// equivalent constant (iOS). Deliberately a SEPARATE key pair from ../license-tool/ — this key
// only ever signs relay addresses, never a license.
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const KEY_FILE = path.join(__dirname, 'private-key.json');

if (fs.existsSync(KEY_FILE)) {
  console.error(`Refusing to overwrite ${KEY_FILE} — it already exists.`);
  console.error('Delete it yourself first if you really want a new key pair (this invalidates');
  console.error('every manifest issued under the old one, including ones already handed out).');
  process.exit(1);
}

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const pub = publicKey.export({ format: 'jwk' });
const priv = privateKey.export({ format: 'jwk' });

const record = {
  createdAt: new Date().toISOString(),
  publicKeyB64: pub.x,
  privateKeySeedB64: priv.d,
};

fs.writeFileSync(KEY_FILE, JSON.stringify(record, null, 2));
try { fs.chmodSync(KEY_FILE, 0o600); } catch { /* chmod isn't meaningful on every OS/FS */ }

console.log('Key pair generated:', KEY_FILE);
console.log('');
console.log('*** KEEP private-key.json SECRET. *** Whoever has it can mint a relay-pool manifest');
console.log('claiming to be any company, pointing anyone who imports it at any relay server. Back');
console.log('it up somewhere safe and offline (a password manager, an encrypted USB drive) — it');
console.log('is already in .gitignore, so it will never be committed or shipped in a project ZIP');
console.log('by accident. If it is lost, you cannot issue new manifests under the same public key.');
console.log('');
console.log('Public key — paste this into RelayPoolManager.PUBLIC_KEY_B64 in the Android app AND');
console.log('the matching constant in RelayPoolManager.swift on iOS (both must match):');
console.log(pub.x);
