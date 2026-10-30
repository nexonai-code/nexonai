import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { gcm } from "@noble/ciphers/aes.js";

/**
 * Browser port of unpruuf/officer-app/src/crypto/primitives.ts + outerEnvelope.ts, merged into
 * one file. Pure JS (@noble/*), no Node built-ins — everything here also runs in officer-app
 * unchanged in behaviour, cross-checked against a real Tink jar (X25519/HKDF/XChaCha20-Poly1305)
 * and a real javax.crypto.Cipher (AES-256-GCM) before either port was written — see
 * officer-app/src/crypto/primitives.ts's doc comment for the verification method. This file
 * additionally confirmed @noble/ciphers' pure-JS AES-GCM (`aes.js`'s `gcm`) reproduces the exact
 * same Tink/Java-compatible ciphertext+tag bytes as Node's built-in `crypto` module does, so the
 * browser and the officer-app agree byte-for-byte despite using different underlying libraries
 * for this one primitive.
 */

export function x25519GenerateKeyPair(): { privateKey: Uint8Array; publicKey: Uint8Array } {
  const privateKey = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

export function x25519SharedSecret(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  return x25519.getSharedSecret(privateKey, publicKey);
}

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

export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

/** Uniform random integer in [0, max) — browser equivalent of node:crypto's randomInt. */
export function randomInt(max: number): number {
  if (max <= 0) return 0;
  const bytes = randomBytes(4);
  const value = new DataView(bytes.buffer).getUint32(0, false);
  return value % max;
}

/** XChaCha20-Poly1305 AEAD in Tink's wire format: 24-byte random nonce || ciphertext || 16-byte tag. */
export function aeadEncrypt(key: Uint8Array, plaintext: Uint8Array, aad: Uint8Array): Uint8Array {
  const nonce = randomBytes(24);
  const ctAndTag = xchacha20poly1305(key, nonce, aad).encrypt(plaintext);
  const out = new Uint8Array(24 + ctAndTag.length);
  out.set(nonce, 0);
  out.set(ctAndTag, 24);
  return out;
}

export function aeadDecrypt(key: Uint8Array, nonceAndCiphertext: Uint8Array, aad: Uint8Array): Uint8Array {
  if (nonceAndCiphertext.length < 24 + 16) throw new Error("aeadDecrypt: input too short");
  const nonce = nonceAndCiphertext.subarray(0, 24);
  const ctAndTag = nonceAndCiphertext.subarray(24);
  return xchacha20poly1305(key, nonce, aad).decrypt(ctAndTag);
}

/** Outer per-contact AES-256-GCM layer — direct port of CryptoManager.encryptForContact/
 *  decryptWithKey. Output: 12-byte IV || ciphertext || 16-byte tag (@noble/ciphers' `gcm`
 *  already appends the tag this way, matching Tink/JCE's convention with zero extra work,
 *  unlike Node's `crypto` module which needs the tag re-appended by hand — see officer-app's
 *  outerEnvelope.ts for that variant). */
export function encryptForContact(plaintext: Uint8Array, contactKey32: Uint8Array): Uint8Array {
  if (contactKey32.length !== 32) throw new Error("contactKey32 must be 32 bytes");
  const iv = randomBytes(12);
  const ctAndTag = gcm(contactKey32, iv).encrypt(plaintext);
  const out = new Uint8Array(12 + ctAndTag.length);
  out.set(iv, 0);
  out.set(ctAndTag, 12);
  return out;
}

export function decryptWithKey(data: Uint8Array, myKey32: Uint8Array): Uint8Array {
  if (data.length <= 12 + 16) throw new Error("data too short");
  const iv = data.subarray(0, 12);
  const ctAndTag = data.subarray(12);
  return gcm(myKey32, iv).decrypt(ctAndTag);
}

export function compareUnsigned(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = a[i] - b[i];
    if (d !== 0) return d;
  }
  return a.length - b.length;
}
