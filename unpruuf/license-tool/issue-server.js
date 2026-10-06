#!/usr/bin/env node
// Issues ONE signed license for an unpruuf Business Node server, offline — same private key
// (private-key.json from keygen.js), nothing else needed, no network. Run once per sale; run
// again a year later for the renewal (same --serial, new --years): the old code simply stops
// working when it expires, nothing needs to be revoked.
'use strict';

const fs = require('fs');
const path = require('path');
const { MAX_SERVER_NODES, MS_PER_YEAR, privateKeyFromRecord, buildServerPayload, signServerLicense } = require('./lib');

function usage(msg) {
  if (msg) console.error(msg + '\n');
  console.error(`Usage:
  node issue-server.js --customer "<name>" --nodes <1-${MAX_SERVER_NODES}> [--years <N=1>]
                        [--serial <SRV-0001>] [--out <manifest.csv>]

  --customer   Free text, shown on the server's setup page. Must not contain '|'.
  --nodes      How many node addresses (onion services) this server may publish.
  --years      License lifetime from now. Default 1. Fractional values are fine.
  --serial     Your own bookkeeping number for this server license (default SRV-<yyyymmdd-hhmmss>).
  --out        Append a line to a CSV manifest for your own records.`);
  process.exit(1);
}

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith('--')) usage(`--${name} needs a value`);
  return v;
}

const customer = arg('customer');
const nodes = parseInt(arg('nodes', ''), 10);
const years = parseFloat(arg('years', '1'));
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const serial = arg('serial', `SRV-${stamp.slice(0, 8)}-${stamp.slice(8)}`);
const outFile = arg('out');

if (!customer) usage('--customer is required');
if (customer.includes('|') || serial.includes('|')) usage("--customer and --serial must not contain '|'");
if (!Number.isInteger(nodes) || nodes < 1 || nodes > MAX_SERVER_NODES) usage(`--nodes must be 1..${MAX_SERVER_NODES}`);
if (!Number.isFinite(years) || years <= 0) usage('--years must be a positive number');

const keyFile = path.join(__dirname, 'private-key.json');
if (!fs.existsSync(keyFile)) {
  console.error(`No key pair found at ${keyFile}. Run 'node keygen.js' first.`);
  process.exit(1);
}
const privateKey = privateKeyFromRecord(JSON.parse(fs.readFileSync(keyFile, 'utf8')));

const issuedAtMs = Date.now();
const expiresAtMs = issuedAtMs + Math.round(years * MS_PER_YEAR);
const code = signServerLicense(privateKey, buildServerPayload({ serial, customer, maxNodes: nodes, issuedAtMs, expiresAtMs }));

console.log(`${serial}\t${nodes} nodes\texpires ${new Date(expiresAtMs).toISOString().slice(0, 10)}`);
console.log(code);

if (outFile) {
  const header = 'serial,customer,nodes,issuedAt,expiresAt,licenseCode\n';
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const line = [serial, customer, nodes, new Date(issuedAtMs).toISOString(), new Date(expiresAtMs).toISOString(), code].map(esc).join(',') + '\n';
  if (!fs.existsSync(outFile)) fs.writeFileSync(outFile, header);
  fs.appendFileSync(outFile, line);
}
