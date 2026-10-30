import * as crypto from "crypto";

/**
 * Rotating list feed — the cryptography both sides share (this file, and FeedCrypto.kt in the
 * unpruuf app, which is tested against vectors made here).
 *
 * What it is: a company runs a small service on its own server. The service has an onion address
 * that CHANGES every few hours (the period). The address is not random: server and app both derive
 * it from a shared secret (the address seed) and the time period, so the app can compute where the
 * service lives right now, while nobody without the seed can find it, list it or guess it. The
 * service hands out ONE file: the company's current node lists, encrypted (content key) and signed
 * (company signing key). The app only trusts a list that verifies.
 *
 * Three secrets, three places — a stolen server must not be able to forge or read a list:
 *   - address seed  : server + apps   (lets the server publish the onion, lets the app find it)
 *   - content key   : publisher + apps (encrypts the list; NOT kept in readable form on the server)
 *   - signing key   : publisher only   (private half sealed under the admin's passphrase on the
 *                     server; apps carry the public half)
 */

export const FEED_CODE_PREFIX = "unpruuf-feed:v1:";
export const FEED_LIST_HEADER = "unpruuf-feed-list:v1";
export const LIST_SEPARATOR = "\n=====\n";
export const MIN_PERIOD_HOURS = 1;
export const MAX_PERIOD_HOURS = 24;
const HOUR_MS = 60 * 60 * 1000;
const B32 = "abcdefghijklmnopqrstuvwxyz234567";

export function base32(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** The v3 onion address of an Ed25519 public key (Tor rend-spec-v3: key, 2-byte SHA3 checksum, version 3). */
export function onionAddressFromPublicKey(publicKey: Buffer): string {
  const checksum = crypto
    .createHash("sha3-256")
    .update(Buffer.concat([Buffer.from(".onion checksum"), publicKey, Buffer.from([3])]))
    .digest()
    .subarray(0, 2);
  return base32(Buffer.concat([publicKey, checksum, Buffer.from([3])])) + ".onion";
}

const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

export function ed25519PrivateKey(seed: Buffer): crypto.KeyObject {
  return crypto.createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]), format: "der", type: "pkcs8" });
}

export function ed25519PublicKeyBytes(seed: Buffer): Buffer {
  const jwk = crypto.createPublicKey(ed25519PrivateKey(seed)).export({ format: "jwk" });
  return Buffer.from(jwk.x as string, "base64url");
}

export interface EpochKey {
  epoch: number;
  publicKey: Buffer;
  /** `ADD_ONION` key blob: the 64-byte expanded Ed25519 secret key, base64 (RFC 8032: clamped SHA-512 of the seed). */
  torPrivateKey: string;
  address: string;
}

export function epochOf(nowMs: number, periodHours: number): number {
  return Math.floor(nowMs / (periodHours * HOUR_MS));
}

export function deriveEpochKey(addressSeed: Buffer, epoch: number): EpochKey {
  const seed = Buffer.from(crypto.hkdfSync("sha256", addressSeed, Buffer.from("unpruuf-feed-v1"), Buffer.from(`onion-epoch:${epoch}`), 32));
  const h = crypto.createHash("sha512").update(seed).digest();
  const a = Buffer.from(h.subarray(0, 32));
  a[0] &= 248;
  a[31] &= 127;
  a[31] |= 64;
  const publicKey = ed25519PublicKeyBytes(seed);
  return {
    epoch,
    publicKey,
    torPrivateKey: "ED25519-V3:" + Buffer.concat([a, h.subarray(32, 64)]).toString("base64"),
    address: onionAddressFromPublicKey(publicKey),
  };
}

/** Server: which epochs must be online right now. The next one goes up [leadMs] before the switch
 *  (Tor needs a few minutes to publish it), the previous one stays [graceMs] after it. */
export function activeEpochs(nowMs: number, periodHours: number, leadMs = 15 * 60_000, graceMs = 30 * 60_000): number[] {
  const periodMs = periodHours * HOUR_MS;
  const cur = epochOf(nowMs, periodHours);
  const start = cur * periodMs;
  const out = [cur];
  if (start + periodMs - nowMs <= leadMs) out.push(cur + 1);
  if (nowMs - start <= graceMs) out.unshift(cur - 1);
  return out;
}

/** App: which epochs to try, best guess first — tolerates a phone clock that is off by up to [toleranceMs]. */
export function candidateEpochs(nowMs: number, periodHours: number, toleranceMs = 45 * 60_000): number[] {
  const periodMs = periodHours * HOUR_MS;
  const cur = epochOf(nowMs, periodHours);
  const start = cur * periodMs;
  if (nowMs - start < toleranceMs) return [cur, cur - 1];
  if (start + periodMs - nowMs < toleranceMs) return [cur, cur + 1];
  return [cur];
}

// ─── feed code: what the employees' apps are given (QR or text) ─────────────────────────────

export interface FeedCode {
  name: string;
  periodHours: number;
  addressSeed: Buffer;
  contentKey: Buffer;
  signPublicKey: Buffer;
}

export function cleanName(name: string): string {
  return name.replace(/[\r\n\t|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

export function buildFeedCode(c: FeedCode): string {
  return FEED_CODE_PREFIX + [1, cleanName(c.name) || "Firma", c.periodHours, c.addressSeed.toString("base64url"), c.contentKey.toString("base64url"), c.signPublicKey.toString("base64url")].join("|");
}

export function parseFeedCode(code: string): FeedCode | null {
  const t = code.trim();
  if (!t.startsWith(FEED_CODE_PREFIX)) return null;
  const p = t.slice(FEED_CODE_PREFIX.length).split("|");
  if (p.length !== 6 || p[0] !== "1") return null;
  const periodHours = Number(p[2]);
  if (!Number.isInteger(periodHours) || periodHours < MIN_PERIOD_HOURS || periodHours > MAX_PERIOD_HOURS) return null;
  const addressSeed = Buffer.from(p[3], "base64url");
  const contentKey = Buffer.from(p[4], "base64url");
  const signPublicKey = Buffer.from(p[5], "base64url");
  if (addressSeed.length !== 32 || contentKey.length !== 32 || signPublicKey.length !== 32) return null;
  return { name: cleanName(p[1]) || "Firma", periodHours, addressSeed, contentKey, signPublicKey };
}

// ─── the list file ───────────────────────────────────────────────────────────────────────────

function signedBytes(seq: number, issuedAtMs: number, iv: string, data: string): Buffer {
  return Buffer.from(`unpruuf-feed-list-v1\n${seq}\n${issuedAtMs}\n${iv}\n${data}`, "utf8");
}

/** Encrypts [plaintext] (the node-list files joined by [LIST_SEPARATOR]) and signs the result. */
export function sealList(opts: { plaintext: string; contentKey: Buffer; signSeed: Buffer; seq: number; issuedAtMs: number }): string {
  const ivBuf = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", opts.contentKey, ivBuf);
  cipher.setAAD(Buffer.from(`unpruuf-feed-v1:${opts.seq}`));
  const ct = Buffer.concat([cipher.update(opts.plaintext, "utf8"), cipher.final(), cipher.getAuthTag()]);
  const iv = ivBuf.toString("base64");
  const data = ct.toString("base64");
  const sig = crypto.sign(null, signedBytes(opts.seq, opts.issuedAtMs, iv, data), ed25519PrivateKey(opts.signSeed)).toString("base64");
  return [FEED_LIST_HEADER, `seq: ${opts.seq}`, `issued: ${opts.issuedAtMs}`, `iv: ${iv}`, `data: ${data}`, `sig: ${sig}`].join("\n") + "\n";
}

export interface OpenedList {
  seq: number;
  issuedAtMs: number;
  plaintext: string;
}

/** Null unless the signature is genuine (checked first) and the content decrypts. */
export function openList(blob: string, contentKey: Buffer, signPublicKey: Buffer): OpenedList | null {
  try {
    const lines = blob.replace(/^﻿/, "").split(/\r?\n/);
    if (lines[0].trim() !== FEED_LIST_HEADER) return null;
    const f: Record<string, string> = {};
    for (const line of lines.slice(1)) {
      const m = /^([a-z]+): (.*)$/.exec(line.trim());
      if (m) f[m[1]] = m[2].trim();
    }
    const seq = Number(f.seq);
    const issuedAtMs = Number(f.issued);
    if (!Number.isInteger(seq) || seq < 0 || !Number.isFinite(issuedAtMs) || !f.iv || !f.data || !f.sig) return null;
    const pub = crypto.createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), signPublicKey]), format: "der", type: "spki" });
    const sig = Buffer.from(f.sig, "base64");
    if (sig.length !== 64 || !crypto.verify(null, signedBytes(seq, issuedAtMs, f.iv, f.data), pub, sig)) return null;
    const raw = Buffer.from(f.data, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", contentKey, Buffer.from(f.iv, "base64"));
    decipher.setAAD(Buffer.from(`unpruuf-feed-v1:${seq}`));
    decipher.setAuthTag(raw.subarray(raw.length - 16));
    const plaintext = Buffer.concat([decipher.update(raw.subarray(0, raw.length - 16)), decipher.final()]).toString("utf8");
    return { seq, issuedAtMs, plaintext };
  } catch {
    return null;
  }
}

export function splitLists(plaintext: string): string[] {
  return plaintext.split(LIST_SEPARATOR).map((s) => s.trim()).filter((s) => s.length > 0);
}
