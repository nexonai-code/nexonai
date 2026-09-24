// Shared helpers for keygen.js / issue.js / verify.js — no dependencies beyond Node's
// built-in `crypto`, so this runs with nothing but `node` installed (no npm install step,
// consistent with this being a small offline vendor tool, not part of any shipped app).
// Structural sibling of ../license-tool/lib.js, but a SEPARATE key pair and SEPARATE wire
// prefix — a leaked relay-pool key only lets someone hand out bogus relay ADDRESSES, never a
// valid app license, and vice versa.
'use strict';

const crypto = require('crypto');

const RELAYPOOL_PREFIX = 'unpruuf-relaypool:v1:';
const RELAY_CONNECTION_PREFIX = 'unpruuf-relay:v1:';

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

// Same shape check as RelayManager.parseConnectionString (Kotlin) / RelayConnectionString.swift
// (Swift) — kept in lockstep by hand, no shared code between the three runtimes. Doesn't need to
// be byte-perfect with those since a malformed entry here is just rejected by the app too; this
// only protects an issuer from typo-ing a relay string into a manifest that silently does
// nothing once imported.
function isValidRelayConnectionString(raw) {
  if (typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!trimmed.startsWith(RELAY_CONNECTION_PREFIX)) return false;
  const rest = trimmed.substring(RELAY_CONNECTION_PREFIX.length);
  const lastColon = rest.lastIndexOf(':');
  if (lastColon <= 0 || lastColon === rest.length - 1) return false;
  const address = rest.substring(0, lastColon);
  const authToken = rest.substring(lastColon + 1);
  return address.length > 0 && authToken.length > 0;
}

// Payload is a fixed pipe-delimited field list (same hand-rolled style as
// RelayManager.parseConnectionString / LicenseManager — no JSON, nothing to canonicalize before
// verifying). `org` must not contain '|'. `relays` are joined with ';' — the same delimiter the
// pairing wire format and RelayManager's own pref storage already use for a relay pool — and
// must not themselves contain '|' or ';' (true of every real connection string; see
// server/src/identity.ts's generateToken() alphabet). Deliberately no expiry field: unlike a
// per-seat license, a company relay list isn't a subscription — it's re-issued (and
// re-imported) whenever the company's server list actually changes.
function buildPayload({ org, issuedAtMs, relays }) {
  return `1|${org}|${issuedAtMs}|${relays.join(';')}`;
}

function parsePayload(payload) {
  const parts = payload.split('|');
  if (parts.length !== 4) return null;
  const [version, org, issuedAtMs, relaysJoined] = parts;
  if (version !== '1') return null;
  if (!org) return null;
  const issued = Number(issuedAtMs);
  if (!Number.isFinite(issued)) return null;
  const relays = relaysJoined.split(';').map((r) => r.trim()).filter((r) => r.length > 0);
  if (relays.length === 0) return null;
  if (!relays.every(isValidRelayConnectionString)) return null;
  return { org, issuedAtMs: issued, relays };
}

// Signs `payload` (the exact string from buildPayload) and returns the full distributable
// manifest code: `unpruuf-relaypool:v1:<base64url(payload)>:<base64url(signature)>`.
function signManifest(privateKey, payload) {
  const payloadBuf = Buffer.from(payload, 'utf8');
  const signature = crypto.sign(null, payloadBuf, privateKey); // null = Ed25519's own hashing
  return `${RELAYPOOL_PREFIX}${payloadBuf.toString('base64url')}:${signature.toString('base64url')}`;
}

// Verifies a full manifest code string against a public key. Returns the parsed fields on
// success, or null on any failure (bad prefix, bad base64, bad signature, malformed payload,
// an invalid relay entry) — one return type for "not valid" so callers can't accidentally
// branch on the wrong failure mode, same shape as license-tool/lib.js's verifyLicense.
function verifyManifest(publicKey, code) {
  const trimmed = code.trim();
  if (!trimmed.startsWith(RELAYPOOL_PREFIX)) return null;
  const rest = trimmed.substring(RELAYPOOL_PREFIX.length);
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
  RELAYPOOL_PREFIX,
  RELAY_CONNECTION_PREFIX,
  isValidRelayConnectionString,
  privateKeyFromRecord,
  publicKeyFromB64,
  buildPayload,
  parsePayload,
  signManifest,
  verifyManifest,
};
