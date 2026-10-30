#!/usr/bin/env node
// Standalone check for one license code, without touching the private key — the same
// verification an Android device does (LicenseManager.applyLicenseCode), useful for testing
// a code before handing it to a customer, or for debugging a code that a customer says fails.
'use strict';

const fs = require('fs');
const path = require('path');
const { publicKeyFromB64, verifyLicense, verifyServerLicense, SERVER_LICENSE_PREFIX, MS_PER_DAY } = require('./lib');

const code = process.argv[2];
if (!code) {
  console.error('Usage: node verify.js "<unpruuf-license:v1:...>"   (app license)');
  console.error('       node verify.js "<unpruuf-server-license:v1:...>"   (server license)');
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

if (code.trim().startsWith(SERVER_LICENSE_PREFIX)) {
  const server = verifyServerLicense(publicKey, code);
  if (!server) {
    console.error('INVALID — signature does not verify, or the code is malformed.');
    process.exit(1);
  }
  const left = Math.floor((server.expiresAtMs - Date.now()) / MS_PER_DAY);
  console.log('Signature: VALID (server license)');
  console.log('Serial:   ', server.serial);
  console.log('Customer: ', server.customer);
  console.log('Nodes:    ', server.maxNodes);
  console.log('Issued:   ', new Date(server.issuedAtMs).toISOString());
  console.log('Expires:  ', new Date(server.expiresAtMs).toISOString());
  console.log('Status:   ', left >= 0 ? `valid, ${left} day(s) left` : `EXPIRED ${-left} day(s) ago`);
  process.exit(0);
}

const parsed = verifyLicense(publicKey, code);
if (!parsed) {
  console.error('INVALID — signature does not verify, or the code is malformed.');
  process.exit(1);
}

const now = Date.now();
const daysLeft = Math.floor((parsed.expiresAtMs - now) / MS_PER_DAY);
console.log('Signature: VALID');
console.log('Serial:   ', parsed.serial);
console.log('Edition:  ', parsed.edition);
console.log('Customer: ', parsed.customer);
console.log('Issued:   ', new Date(parsed.issuedAtMs).toISOString());
console.log('Expires:  ', new Date(parsed.expiresAtMs).toISOString());
console.log('Status:   ', daysLeft >= 0 ? `valid, ${daysLeft} day(s) left` : `EXPIRED ${-daysLeft} day(s) ago`);
