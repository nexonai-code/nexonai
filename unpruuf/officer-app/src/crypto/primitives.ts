import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { randomBytes } from "node:crypto";

/**
 * Raw crypto primitives, chosen and wired together to be byte-for-byte wire-compatible with
 * the Android app's `domain/network/ratchet/DoubleRatchet.kt` (Tink's `subtle.X25519`,
 * `subtle.Hkdf`, `subtle.XChaCha20Poly1305`) and iOS's `UnpruufCore` (CryptoKit's own
 * equivalents). This is NOT an assumption — cross-checked against a real `com.google.crypto.
 * tink:tink:1.11.0` jar for fixed test vectors before writing a single line of the ratchet
 * port itself: identical X25519 shared secret, identical 64-byte HKDF-SHA256 output, and
 * identical XChaCha20-Poly1305 ciphertext+tag for the same key/nonce/AAD/plaintext (Tink's own
 * wire format: 24-byte random nonce prefix, then ciphertext with the 16-byte Poly1305 tag
 * appended — reproduced exactly by `aeadEncrypt`/`aeadDecrypt` below).
 */

export function x25519GenerateKeyPair(): { privateKey: Uint8Array; publicKey: Uint8Array } {
  const privateKey = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

export function x25519PublicFromPrivate(privateKey: Uint8Array): Uint8Array {
  return x25519.getPublicKey(privateKey);
}

export function x25519SharedSecret(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  return x25519.getSharedSecret(privateKey, publicKey);
}

/** RFC 5869 HKDF-SHA256 — matches Tink's `Hkdf.computeHkdf("HmacSha256", ...)` exactly. */
export function hkdfSha256(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Uint8Array {
  return hkdf(sha256, ikm, salt, info, length);
}

export function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  return hmac(sha256, key, data);
}

export function sha256Digest(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const buf = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    buf.set(p, off);
    off += p.length;
  }
  return sha256(buf);
}

/**
 * XChaCha20-Poly1305 AEAD, in Tink's own wire format: output = 24-byte random nonce ||
 * ciphertext || 16-byte tag. Matches `DoubleRatchet.aead(messageKey).encrypt/decrypt` exactly
 * (see this file's doc comment for the cross-verification that established this).
 */
export function aeadEncrypt(key: Uint8Array, plaintext: Uint8Array, aad: Uint8Array): Uint8Array {
  const nonce = randomBytes(24);
  const ctAndTag = xchacha20poly1305(key, nonce, aad).encrypt(plaintext);
  const out = new Uint8Array(24 + ctAndTag.length);
  out.set(nonce, 0);
  out.set(ctAndTag, 24);
  return out;
}

export function aeadDecrypt(key: Uint8Array, nonceAndCiphertext: Uint8Array, aad: Uint8Array): Uint8Array {
  if (nonceAndCiphertext.length < 24 + 16) {
    throw new Error("aeadDecrypt: input too short to contain a nonce + Poly1305 tag");
  }
  const nonce = nonceAndCiphertext.subarray(0, 24);
  const ctAndTag = nonceAndCiphertext.subarray(24);
  return xchacha20poly1305(key, nonce, aad).decrypt(ctAndTag);
}

/** Unsigned, big-endian-style lexicographic byte comparison — matches every Kotlin/Swift
 *  `compareUnsigned` used throughout the app for the "sort two keys into a fixed order" idiom
 *  ([IdentityManager.pairSecret], [RatchetSessionManager.createSession], safety numbers, …). */
export function compareUnsigned(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = a[i] - b[i];
    if (d !== 0) return d;
  }
  return a.length - b.length;
}

export function randomBytesU8(n: number): Uint8Array {
  return new Uint8Array(randomBytes(n));
}
