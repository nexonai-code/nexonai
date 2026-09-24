#!/usr/bin/env node
// Issues one or more signed license codes offline. Needs private-key.json from keygen.js —
// nothing else, no network, no server. Run this once per sale (count=1) or once per bulk deal
// (count=350) and hand the resulting codes to the customer; run it again a year later with
// --renew-serial to extend an existing seat instead of minting a new one.
'use strict';

const fs = require('fs');
const path = require('path');
const {
  EDITIONS, MS_PER_YEAR,
  privateKeyFromRecord, buildPayload, signLicense,
} = require('./lib');

function usage(msg) {
  if (msg) console.error(msg + '\n');
  console.error(`Usage:
  node issue.js --edition <standard|pro|client> --customer "<name>" --count <N>
                 [--years <N=1>] [--serial-prefix <PREFIX=NX>] [--start-at <N=1>]
                 [--out <manifest.csv>]

  --edition        Which app edition this license is for. Must match the edition of the
                    app it's entered into (LicenseManager checks and rejects a mismatch).
  --customer       Free text, shown in the app's Settings and in the manifest. Must not
                    contain '|'.
  --count          How many DISTINCT, individually device-bound licenses to mint (e.g. 350
                    for a 350-seat deal — see the manifest for which serial went to whom).
  --years          License lifetime from the moment of issuing. Default 1. Fractional
                    values are fine (e.g. 0.5 for a 6-month trial).
  --serial-prefix  Prefix for the generated serials (default "NX"), e.g. NX-0001, NX-0002...
  --start-at       First serial number, for issuing a later batch that continues numbering
                    from an earlier one instead of restarting at 1 (default 1).
  --out            Write a CSV manifest (serial, customer, edition, issuedAt, expiresAt,
                    license code) here for your own records. Prints to stdout either way.

Renewing an existing seat: just run this again with the SAME --serial-prefix/--start-at
for that one seat (--count 1) — it mints a fresh code with a new issuedAt/expiresAt under
the same serial. The old code for that serial simply stops being distributed; nothing
needs to be revoked since expired codes stop working on their own.`);
  process.exit(1);
}

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith('--')) usage(`--${name} needs a value`);
  return v;
}

const edition = arg('edition');
const customer = arg('customer');
const countStr = arg('count');
const years = parseFloat(arg('years', '1'));
const serialPrefix = arg('serial-prefix', 'NX');
const startAt = parseInt(arg('start-at', '1'), 10);
const outFile = arg('out');

if (!edition || !EDITIONS.includes(edition)) usage(`--edition must be one of: ${EDITIONS.join(', ')}`);
if (!customer) usage('--customer is required');
if (customer.includes('|')) usage("--customer must not contain '|'");
if (!countStr) usage('--count is required');
const count = parseInt(countStr, 10);
if (!Number.isInteger(count) || count < 1) usage('--count must be a positive integer');
if (!Number.isFinite(years) || years <= 0) usage('--years must be a positive number');
if (!Number.isInteger(startAt) || startAt < 1) usage('--start-at must be a positive integer');

const keyFile = path.join(__dirname, 'private-key.json');
if (!fs.existsSync(keyFile)) {
  console.error(`No key pair found at ${keyFile}. Run 'node keygen.js' first.`);
  process.exit(1);
}
const privateKey = privateKeyFromRecord(JSON.parse(fs.readFileSync(keyFile, 'utf8')));

const issuedAtMs = Date.now();
const expiresAtMs = issuedAtMs + Math.round(years * MS_PER_YEAR);
const pad = String(startAt + count - 1).length < 4 ? 4 : String(startAt + count - 1).length;

const rows = [['serial', 'customer', 'edition', 'issuedAt', 'expiresAt', 'licenseCode']];
const codes = [];
for (let i = 0; i < count; i++) {
  const serial = `${serialPrefix}-${String(startAt + i).padStart(pad, '0')}`;
  const payload = buildPayload({ edition, serial, customer, issuedAtMs, expiresAtMs });
  const code = signLicense(privateKey, payload);
  codes.push({ serial, code });
  rows.push([
    serial, customer, edition,
    new Date(issuedAtMs).toISOString(), new Date(expiresAtMs).toISOString(),
    code,
  ]);
}

for (const { serial, code } of codes) {
  console.log(`${serial}\t${code}`);
}

if (outFile) {
  const csv = rows.map((r) => r.map((f) => `"${String(f).replace(/"/g, '""')}"`).join(',')).join('\n');
  fs.writeFileSync(outFile, csv + '\n');
  console.error(`\nManifest written to ${outFile} (${count} row${count === 1 ? '' : 's'}).`);
}

console.error(`\n${count} license${count === 1 ? '' : 's'} issued for "${customer}" (${edition}), valid ${years} year(s) from now.`);
