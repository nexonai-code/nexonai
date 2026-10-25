import * as crypto from "crypto";

/**
 * Guest grant: a signed, expiring token that lets ONE guest (a free Client app user without
 * servers of their own) deposit on this node. See GUEST_LOCKERS_BUILD_SPEC.md.
 *
 * Wire form (Authorization header): `Guest <base64url(grant)>.<base64url(mac)>`
 *
 * grant (binary, big-endian):
 *   0      version            u8   (= 1)
 *   1..16  grantId            16 random bytes, per invitation and per node
 *   17..24 notAfter           u64  unix ms
 *   25..26 depositsPerHour    u16
 *   27..30 bytesPerHour       u32
 *   31     scopeLen           u8   (0..64)
 *   32..   scope              opaque bytes. Reserved for slot ranges of the multi-slot server.
 *                             This node ignores the content but the MAC covers it.
 *
 * mac = HMAC-SHA256(key, "unpruuf-guest-grant-v1\0" || grant)
 * key = HKDF-SHA256(ikm = utf8(ownerSecret), salt = empty, info = "unpruuf guest grant v1", 32 bytes)
 *
 * Verification is stateless: the node already holds the owner secret, so no grant is ever stored.
 * The owner secret itself is never used directly as a MAC key and never leaves the owner's side.
 */
export const GRANT_VERSION = 1;
const MAC_DOMAIN = Buffer.from("unpruuf-guest-grant-v1\0", "utf8");
const HKDF_INFO = Buffer.from("unpruuf guest grant v1", "utf8");
const FIXED_LEN = 32;
export const MAX_SCOPE_BYTES = 64;

export interface GuestGrant {
  grantId: Buffer;
  notAfterMs: number;
  depositsPerHour: number;
  bytesPerHour: number;
  scope: Buffer;
}

export type VerifyResult =
  | { ok: true; grant: GuestGrant }
  | { ok: false; reason: "format" | "mac" | "expired" | "too-long" };

export function deriveGuestKey(ownerSecret: string): Buffer {
  return Buffer.from(crypto.hkdfSync("sha256", Buffer.from(ownerSecret, "utf8"), Buffer.alloc(0), HKDF_INFO, 32));
}

function encodeGrant(g: GuestGrant): Buffer {
  if (g.grantId.length !== 16) throw new Error("grantId must be 16 bytes");
  if (g.scope.length > MAX_SCOPE_BYTES) throw new Error("scope too long");
  const out = Buffer.alloc(FIXED_LEN + g.scope.length);
  out.writeUInt8(GRANT_VERSION, 0);
  g.grantId.copy(out, 1);
  out.writeBigUInt64BE(BigInt(g.notAfterMs), 17);
  out.writeUInt16BE(g.depositsPerHour, 25);
  out.writeUInt32BE(g.bytesPerHour, 27);
  out.writeUInt8(g.scope.length, 31);
  g.scope.copy(out, FIXED_LEN);
  return out;
}

function mac(key: Buffer, grantBytes: Buffer): Buffer {
  return crypto.createHmac("sha256", key).update(MAC_DOMAIN).update(grantBytes).digest();
}

/** Issues a grant for the `Authorization` header. Used by tests and the owner tooling; the
 *  owner's app implements the same format (see guest-grants/vectors.json). */
export function issueGuestGrant(ownerSecret: string, g: GuestGrant): string {
  const bytes = encodeGrant(g);
  const tag = mac(deriveGuestKey(ownerSecret), bytes);
  return `${bytes.toString("base64url")}.${tag.toString("base64url")}`;
}

function decodeGrant(bytes: Buffer): GuestGrant | null {
  if (bytes.length < FIXED_LEN || bytes.readUInt8(0) !== GRANT_VERSION) return null;
  const scopeLen = bytes.readUInt8(31);
  if (scopeLen > MAX_SCOPE_BYTES || bytes.length !== FIXED_LEN + scopeLen) return null;
  const notAfter = bytes.readBigUInt64BE(17);
  if (notAfter > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return {
    grantId: Buffer.from(bytes.subarray(1, 17)),
    notAfterMs: Number(notAfter),
    depositsPerHour: bytes.readUInt16BE(25),
    bytesPerHour: bytes.readUInt32BE(27),
    scope: Buffer.from(bytes.subarray(FIXED_LEN)),
  };
}

/** Verifies `<b64url(grant)>.<b64url(mac)>`. [maxValidityMs] refuses grants whose expiry lies
 *  further away than the node operator allows. */
export function verifyGuestGrant(token: string, key: Buffer, now: number, maxValidityMs: number): VerifyResult {
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1 || token.indexOf(".", dot + 1) !== -1) return { ok: false, reason: "format" };
  let grantBytes: Buffer;
  let macBytes: Buffer;
  try {
    grantBytes = Buffer.from(token.slice(0, dot), "base64url");
    macBytes = Buffer.from(token.slice(dot + 1), "base64url");
  } catch {
    return { ok: false, reason: "format" };
  }
  const expected = mac(key, grantBytes);
  if (macBytes.length !== expected.length || !crypto.timingSafeEqual(macBytes, expected)) {
    return { ok: false, reason: "mac" };
  }
  const grant = decodeGrant(grantBytes);
  if (!grant) return { ok: false, reason: "format" };
  if (grant.notAfterMs <= now) return { ok: false, reason: "expired" };
  if (grant.notAfterMs > now + maxValidityMs) return { ok: false, reason: "too-long" };
  return { ok: true, grant };
}
