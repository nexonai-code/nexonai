#!/usr/bin/env node
// Issues ONE signed license for an unpruuf Business Node server, offline — same private key
// (private-key.json from keygen.js), nothing else needed, no network. Run once per sale; run
// again a year later for the renewal (same --serial, new --years): the old code simply stops
// working when it expires, nothing needs to be revoked.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MAX_SERVER_NODES, MS_PER_YEAR, privateKeyFromRecord, buildServerPayload, signServerLicense } = require('./lib');

function usage(msg) {
  if (msg) console.error(msg + '\n');
  console.error(`Usage:
  node issue-server.js --customer "<name>" [--count <N=1>] [--nodes <1-${MAX_SERVER_NODES}, default ${MAX_SERVER_NODES}>]
                        [--years <N=1>] [--serial <SRV-0001> (only with --count 1)]
                        [--serial-prefix <SRV>] [--start-at <N=1>] [--out <manifest.csv>]

  --count      How many distinct server licenses to mint in one run (one per server the customer
               buys). Each gets its own serial: <prefix>-0001, <prefix>-0002, ...
  --serial-prefix / --start-at
               Numbering for --count (default prefix SRV, start 1). Use --start-at to continue
               a later batch after an earlier one.
  --customer   Free text, shown on the server's setup page. Must not contain '|'.
  --nodes      How many node addresses (onion services) this server runs. The server always runs
               exactly this many (no setting). Default and maximum: ${MAX_SERVER_NODES}.
  --years      License lifetime from now. Default 1. Fractional values are fine.
  --serial     Your own bookkeeping number for one license (default SRV-<yyyymmdd-hhmmss>-<random>).
               Only with --count 1; for several licenses use --serial-prefix.
  --out        Append one line per license to a CSV manifest for your own records.`);
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
const count = parseInt(arg('count', '1'), 10);
const nodes = parseInt(arg('nodes', String(MAX_SERVER_NODES)), 10);
const years = parseFloat(arg('years', '1'));
const serialArg = arg('serial');
const serialPrefix = arg('serial-prefix', 'SRV');
const startAt = parseInt(arg('start-at', '1'), 10);
const outFile = arg('out');

if (!customer) usage('--customer is required');
if (!Number.isInteger(count) || count < 1) usage('--count must be a positive integer');
if (serialArg !== undefined && count > 1) usage('--serial only works with --count 1; use --serial-prefix for several licenses');
if (!Number.isInteger(startAt) || startAt < 1) usage('--start-at must be a positive integer');
if (customer.includes('|') || (serialArg || '').includes('|') || serialPrefix.includes('|')) usage("--customer, --serial and --serial-prefix must not contain '|'");
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

// A single license without --serial gets a timestamp serial plus a random suffix, so two runs in
// the same second can never produce the same serial (the customer's Control would treat the second
// as a renewal of the first and the customer would end up with one server fewer than bought).
function serialFor(i) {
  if (serialArg) return serialArg;
  if (count === 1 && startAt === 1 && !process.argv.includes('--serial-prefix')) {
    const stamp = new Date(issuedAtMs).toISOString().replace(/[-:T]/g, '').slice(0, 14);
    return `SRV-${stamp.slice(0, 8)}-${stamp.slice(8)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  }
  const last = startAt + count - 1;
  const pad = Math.max(4, String(last).length);
  return `${serialPrefix}-${String(startAt + i).padStart(pad, '0')}`;
}

const issued = [];
for (let i = 0; i < count; i++) {
  const serial = serialFor(i);
  const code = signServerLicense(privateKey, buildServerPayload({ serial, customer, maxNodes: nodes, issuedAtMs, expiresAtMs }));
  issued.push({ serial, code });
}

for (const { serial, code } of issued) {
  console.log(`${serial}\t${nodes} nodes\texpires ${new Date(expiresAtMs).toISOString().slice(0, 10)}`);
  console.log(code);
}
console.log(`Capacity per server: ${Math.floor(nodes / 3)} contacts with nodes of their own on this server alone, up to ${nodes} with three servers of this size.`);
if (count > 1) console.error(`\n${count} server licenses issued for "${customer}", ${nodes} nodes each, valid ${years} year(s) from now.`);

if (outFile) {
  const header = 'serial,customer,nodes,issuedAt,expiresAt,licenseCode\n';
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  if (!fs.existsSync(outFile)) fs.writeFileSync(outFile, header);
  for (const { serial, code } of issued) {
    const line = [serial, customer, nodes, new Date(issuedAtMs).toISOString(), new Date(expiresAtMs).toISOString(), code].map(esc).join(',') + '\n';
    fs.appendFileSync(outFile, line);
  }
}
