// Shared helpers for keygen.js / issue.js / verify.js — no dependencies beyond Node's
// built-in `crypto`, so this runs with nothing but `node` installed (no npm install step,
// consistent with this being a small offline vendor tool, not part of any shipped app).
'use strict';

const crypto = require('crypto');

const LICENSE_PREFIX = 'unpruuf-license:v1:';
const EDITIONS = ['standard', 'pro', 'client'];

// One license year is defined as exactly 365 days (not calendar years) so expiry math is
// unambiguous regardless of leap years — matches how TOR_CONNECT_TIMEOUT_MS-style constants
// elsewhere in this project are plain, exact millisecond counts rather than calendar-aware.
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_YEAR = 365 * MS_PER_DAY;

function privateKeyFromRecord(record) {
  return crypto.createPrivateKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: record.publicKeyB64, d: record.privateKeySeedB64 },
    format: 'jwk',
  });
}

function publicKeyFromB64(publicKeyB64) {
  return crypto.createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: publicKeyB64 },
    format: 'jwk',
  });
}

// Payload is a fixed pipe-delimited field list (same hand-rolled style as
// RelayManager.parseConnectionString on the Kotlin side — no JSON, nothing to canonicalize,
// nothing that can silently re-serialize differently between Node and Kotlin before
// verification). `customer` must not contain '|'; caller validates that before calling.
function buildPayload({ edition, serial, customer, issuedAtMs, expiresAtMs }) {
  return `1|${edition}|${serial}|${customer}|${issuedAtMs}|${expiresAtMs}`;
}

function parsePayload(payload) {
  const parts = payload.split('|');
  if (parts.length !== 6) return null;
  const [version, edition, serial, customer, issuedAtMs, expiresAtMs] = parts;
  if (version !== '1') return null;
  if (!EDITIONS.includes(edition)) return null;
  const issued = Number(issuedAtMs);
  const expires = Number(expiresAtMs);
  if (!Number.isFinite(issued) || !Number.isFinite(expires)) return null;
  return { edition, serial, customer, issuedAtMs: issued, expiresAtMs: expires };
}

// Signs `payload` (the exact string from buildPayload) and returns the full distributable
// license code: `unpruuf-license:v1:<base64url(payload)>:<base64url(signature)>`.
function signLicense(privateKey, payload) {
  const payloadBuf = Buffer.from(payload, 'utf8');
  const signature = crypto.sign(null, payloadBuf, privateKey); // null = Ed25519's own hashing
  return `${LICENSE_PREFIX}${payloadBuf.toString('base64url')}:${signature.toString('base64url')}`;
}

// Verifies a full license code string against a public key. Returns the parsed fields on
// success, or null on any failure (bad prefix, bad base64, bad signature, malformed payload)
// — deliberately one return type for "not valid" so callers can't accidentally branch on the
// wrong failure mode, same as RelayManager.parseConnectionString's `?: return null` shape.
function verifyLicense(publicKey, code) {
  const trimmed = code.trim();
  if (!trimmed.startsWith(LICENSE_PREFIX)) return null;
  const rest = trimmed.substring(LICENSE_PREFIX.length);
  const sepIndex = rest.lastIndexOf(':');
  if (sepIndex <= 0) return null;
  const payloadB64 = rest.substring(0, sepIndex);
  const sigB64 = rest.substring(sepIndex + 1);
  let payloadBuf, sigBuf;
  try {
    payloadBuf = Buffer.from(payloadB64, 'base64url');
    sigBuf = Buffer.from(sigB64, 'base64url');
  } catch {
    return null;
  }
  if (sigBuf.length !== 64) return null;
  let ok;
  try {
    ok = crypto.verify(null, payloadBuf, publicKey, sigBuf);
  } catch {
    return null;
  }
  if (!ok) return null;
  return parsePayload(payloadBuf.toString('utf8'));
}

// ---------------------------------------------------------------------------------------------
// Server licenses (unpruuf Business Node server). Same Ed25519 key pair as the app licenses,
// but a different prefix, a different payload and a signature DOMAIN: the signed bytes start
// with SERVER_SIGN_DOMAIN, so a signature made for an app license can never be replayed as a
// server license (or the other way round) even though one key signs both.
//   unpruuf-server-license:v1:<base64url(payload)>:<base64url(signature)>
//   payload = 1|<serial>|<customer>|<maxNodes>|<issuedAtMs>|<expiresAtMs>
// There is no device binding: a server has no stable device identity (containers, VPS moves),
// and nothing here phones home — "how many servers run" stays a contractual limit, exactly as
// for app seats. What the code DOES bound: how many node addresses one server may publish
// (maxNodes) and until when.
// ---------------------------------------------------------------------------------------------
const SERVER_LICENSE_PREFIX = 'unpruuf-server-license:v1:';
const SERVER_SIGN_DOMAIN = 'unpruuf-server-license-v1\n';
const MAX_SERVER_NODES = 250; // fixed ceiling: a server never runs more than 250 nodes

function buildServerPayload({ serial, customer, maxNodes, issuedAtMs, expiresAtMs }) {
  return `1|${serial}|${customer}|${maxNodes}|${issuedAtMs}|${expiresAtMs}`;
}

function parseServerPayload(payload) {
  const parts = payload.split('|');
  if (parts.length !== 6 || parts[0] !== '1') return null;
  const [, serial, customer, maxNodesStr, issuedAtMs, expiresAtMs] = parts;
  const maxNodes = Number(maxNodesStr);
  const issued = Number(issuedAtMs);
  const expires = Number(expiresAtMs);
  if (!Number.isInteger(maxNodes) || maxNodes < 1 || maxNodes > MAX_SERVER_NODES) return null;
  if (!Number.isFinite(issued) || !Number.isFinite(expires)) return null;
  return { serial, customer, maxNodes, issuedAtMs: issued, expiresAtMs: expires };
}

function serverSignedBytes(payload) {
  return Buffer.from(SERVER_SIGN_DOMAIN + payload, 'utf8');
}

function signServerLicense(privateKey, payload) {
  const signature = crypto.sign(null, serverSignedBytes(payload), privateKey);
  return `${SERVER_LICENSE_PREFIX}${Buffer.from(payload, 'utf8').toString('base64url')}:${signature.toString('base64url')}`;
}

function verifyServerLicense(publicKey, code) {
  const trimmed = code.trim();
  if (!trimmed.startsWith(SERVER_LICENSE_PREFIX)) return null;
  const rest = trimmed.substring(SERVER_LICENSE_PREFIX.length);
  const sepIndex = rest.lastIndexOf(':');
  if (sepIndex <= 0) return null;
  let payload, sigBuf;
  try {
    payload = Buffer.from(rest.substring(0, sepIndex), 'base64url').toString('utf8');
    sigBuf = Buffer.from(rest.substring(sepIndex + 1), 'base64url');
  } catch {
    return null;
  }
  if (sigBuf.length !== 64) return null;
  let ok;
  try {
    ok = crypto.verify(null, serverSignedBytes(payload), publicKey, sigBuf);
  } catch {
    return null;
  }
  return ok ? parseServerPayload(payload) : null;
}


// ---------------------------------------------------------------------------------------------
// Release signing (unpruuf Business node server). Signs the list of program files of one built
// node-mesh-server folder, so every server can check "is this the release NexonAI shipped, and is
// it unchanged?" (node-mesh-server/src/integrity.ts). Same Ed25519 key pair as the licences, its own
// signature DOMAIN, so a release signature can never pass as a licence signature or the reverse.
// The manifest body is built by the server's own compiled integrity.js, so signer and checker can
// never disagree about the file list or the hashing.
// ---------------------------------------------------------------------------------------------
const RELEASE_SIGN_DOMAIN = 'unpruuf-release-v1\n';

function signRelease(serverFolder, privateKey) {
  const fs = require('fs');
  const path = require('path');
  const mod = path.join(serverFolder, 'dist', 'integrity.js');
  if (!fs.existsSync(mod)) {
    throw new Error(`dist/integrity.js not found in ${serverFolder}. Build the server first (npm run build).`);
  }
  const integrity = require(mod);
  const body = integrity.buildManifestBody(serverFolder);
  const signature = crypto.sign(null, Buffer.from(RELEASE_SIGN_DOMAIN + body, 'utf8'), privateKey).toString('base64url');
  const text = `${body}signature: ${signature}\n`;
  fs.writeFileSync(path.join(serverFolder, integrity.MANIFEST_FILE), text);
  return { version: integrity.readVersion(serverFolder), fingerprint: integrity.fingerprintOf(body), files: integrity.listCoveredFiles(serverFolder).length };
}

module.exports = {
  signRelease,
  SERVER_LICENSE_PREFIX,
  SERVER_SIGN_DOMAIN,
  MAX_SERVER_NODES,
  buildServerPayload,
  parseServerPayload,
  signServerLicense,
  verifyServerLicense,
  LICENSE_PREFIX,
  EDITIONS,
  MS_PER_DAY,
  MS_PER_YEAR,
  privateKeyFromRecord,
  publicKeyFromB64,
  buildPayload,
  parsePayload,
  signLicense,
  verifyLicense,
};
