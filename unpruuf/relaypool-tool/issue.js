#!/usr/bin/env node
// Issues one signed relay-pool manifest offline. Needs private-key.json from keygen.js —
// nothing else, no network, no server. Run this whenever a company's server list changes;
// re-distribute the resulting code to be re-imported (import replaces the old list wholesale,
// see RelayPoolManager.importManifest on Android / RelayPoolManager.swift on iOS).
'use strict';

const fs = require('fs');
const path = require('path');
const {
  privateKeyFromRecord, buildPayload, signManifest, isValidRelayConnectionString,
} = require('./lib');

function usage(msg) {
  if (msg) console.error(msg + '\n');
  console.error(`Usage:
  node issue.js --org "<name>" --relay "<connection string>" [--relay "<connection string>" ...]
                 [--out <manifest.txt>]

  --org      Free text, shown to whoever imports the manifest. Must not contain '|'.
  --relay    A full "unpruuf-relay:v1:<address>:<token>" connection string (from that relay's
             own Settings screen / QR code). Repeat for more than one relay — every relay you
             pass here goes into the manifest; the app itself caps how many of them it actually
             keeps active (RelayManager.RELAY_POOL_MAX_SIZE), so it's fine to list every server
             the company runs and let the app pick.
  --out      Write the manifest code to this file as well as printing it to stdout.

Re-issuing: just run this again with the updated --relay list. There's nothing to revoke —
importing the new code on a device simply replaces that device's previously imported list.`);
  process.exit(1);
}

function args(name) {
  const out = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === `--${name}`) {
      const v = process.argv[i + 1];
      if (v === undefined || v.startsWith('--')) usage(`--${name} needs a value`);
      out.push(v);
    }
  }
  return out;
}

function arg(name, def) {
  const v = args(name);
  return v.length > 0 ? v[v.length - 1] : def;
}

const org = arg('org');
const relays = args('relay');
const outFile = arg('out');

if (!org) usage('--org is required');
if (org.includes('|')) usage("--org must not contain '|'");
if (relays.length === 0) usage('at least one --relay is required');
for (const r of relays) {
  if (!isValidRelayConnectionString(r)) {
    usage(`Not a valid relay connection string: ${r}\n(expected "unpruuf-relay:v1:<address>:<token>")`);
  }
}

const keyFile = path.join(__dirname, 'private-key.json');
if (!fs.existsSync(keyFile)) {
  console.error(`No key pair found at ${keyFile}. Run 'node keygen.js' first.`);
  process.exit(1);
}
const privateKey = privateKeyFromRecord(JSON.parse(fs.readFileSync(keyFile, 'utf8')));

const issuedAtMs = Date.now();
const payload = buildPayload({ org, issuedAtMs, relays });
const code = signManifest(privateKey, payload);

console.log(code);

if (outFile) {
  fs.writeFileSync(outFile, code + '\n');
  console.error(`\nManifest written to ${outFile}.`);
}

console.error(`\nManifest issued for "${org}" with ${relays.length} relay(s), ${new Date(issuedAtMs).toISOString()}.`);
