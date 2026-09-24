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

module.exports = {
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
