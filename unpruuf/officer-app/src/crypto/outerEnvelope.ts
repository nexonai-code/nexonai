import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Direct port of `domain/network/CryptoManager.encryptForContact`/`decryptWithKey` — the outer
 * per-contact AES-256-GCM layer that wraps every `RatchetFrame` before `NetworkObfuscation`
 * padding. Output layout: 12-byte IV || ciphertext || 16-byte GCM tag (Java's `Cipher.doFinal`
 * for GCM appends the tag to the ciphertext; Node's `crypto` module returns it separately via
 * `getAuthTag()`, so `encryptForContact` re-appends it by hand to reproduce the identical wire
 * layout — cross-checked byte-for-byte against a real `javax.crypto.Cipher` run for a fixed
 * key/iv/plaintext before this was written, not assumed).
 */

const IV_LEN = 12;
const TAG_LEN = 16;

/** Encrypts [plaintext] with a contact's 32-byte receive key (their shared "p" QR field). */
export function encryptForContact(plaintext: Uint8Array, contactKey32: Uint8Array): Uint8Array {
  if (contactKey32.length !== 32) throw new Error("contactKey32 must be 32 bytes");
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", contactKey32, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, tag]);
}

/** Decrypts a message that was encrypted with [myKey32] (our own receive key). */
export function decryptWithKey(data: Uint8Array, myKey32: Uint8Array): Uint8Array {
  if (data.length <= IV_LEN + TAG_LEN) throw new Error("data too short");
  const iv = Buffer.from(data.subarray(0, IV_LEN));
  const tag = Buffer.from(data.subarray(data.length - TAG_LEN));
  const ciphertext = Buffer.from(data.subarray(IV_LEN, data.length - TAG_LEN));
  const decipher = createDecipheriv("aes-256-gcm", myKey32, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
