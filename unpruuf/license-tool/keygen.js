#!/usr/bin/env node
// Generates the ONE Ed25519 key pair that signs every unpruuf license. Run this exactly once
// per "license authority" — every license issued by issue.js after this needs the SAME private
// key to have been generated here, and every app build needs the matching public key baked
// into LicenseManager.PUBLIC_KEY_B64. Run again only if the private key is lost/compromised —
// doing so invalidates every license issued under the old key (apps check the compiled-in
// public key, not this file).
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const KEY_FILE = path.join(__dirname, 'private-key.json');

if (fs.existsSync(KEY_FILE)) {
  console.error(`Refusing to overwrite ${KEY_FILE} — it already exists.`);
  console.error('Delete it yourself first if you really want a new key pair (this invalidates');
  console.error('every license issued under the old one, including ones already handed out).');
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
console.log('*** KEEP private-key.json SECRET. *** Whoever has it can mint unlimited valid');
console.log('licenses for any edition, forever. Back it up somewhere safe and offline (a');
console.log('password manager, an encrypted USB drive) — it is already in .gitignore, so it');
console.log('will never be committed or shipped in a project ZIP by accident. If it is lost,');
console.log('you cannot issue new licenses under the same public key ever again.');
console.log('');
console.log('Public key — paste this into LicenseManager.PUBLIC_KEY_B64 in the Android app:');
console.log(pub.x);
