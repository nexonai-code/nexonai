import { randomUUID, scryptSync, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { compareUnsigned, hmacSha256, sha256Digest, x25519GenerateKeyPair } from "../crypto/primitives";

/**
 * The officer's own long-term identity — the Node/TypeScript counterpart of Android's
 * `IdentityManager` (the subset this product line actually needs: `userId`, `myMessageKey`,
 * the static X25519 ratchet identity key, and the `pairSecret`/wire-tag derivation). Persisted
 * once, reused across restarts, same as the relay's own `identity.ts` pattern — but the private
 * key material here is genuinely secret (it's what lets someone impersonate the officer or
 * decrypt a reporter's messages), so it's encrypted at rest with a password-derived key instead
 * of being written out as plain JSON the way the relay's bearer token is.
 */

export interface OfficerIdentity {
  userId: string;
  messageKey: Uint8Array;
  x25519PrivateKey: Uint8Array;
  x25519PublicKey: Uint8Array;
}

interface StoredIdentityFile {
  userId: string;
  x25519PublicKeyB64: string;
  scryptSaltB64: string;
  /** AES-256-GCM(scryptKey, JSON({messageKeyB64, x25519PrivateKeyB64})): 12-byte IV || ct || 16-byte tag. */
  encryptedB64: string;
}

const SCRYPT_KEYLEN = 32;
// N=2^15 costs ~100-300ms on a normal laptop — deliberately not the interactive-login-speed
// default (2^14): this key is derived once per process start, not once per HTTP request, so the
// extra cost is free in practice and meaningfully raises the bar against an offline guess attack
// on a stolen identity file. Needs exactly 128*N*r*p = 32 MiB of working memory, which sits
// right at Node's default 32 MiB `maxmem` scrypt cap — confirmed by hitting
// ERR_CRYPTO_INVALID_SCRYPT_PARAMS with the default before this was added, not assumed — so
// `maxmem` is raised explicitly rather than silently lowering the cost parameters instead.
const SCRYPT_PARAMS = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_PARAMS);
}

export class WrongPasswordError extends Error {
  constructor() {
    super("Wrong officer password, or the identity file is corrupted.");
  }
}

export function loadOrCreateOfficerIdentity(identityPath: string, password: string): { identity: OfficerIdentity; wasCreated: boolean } {
  if (fs.existsSync(identityPath)) {
    const stored: StoredIdentityFile = JSON.parse(fs.readFileSync(identityPath, "utf8"));
    const salt = Buffer.from(stored.scryptSaltB64, "base64");
    const key = deriveKey(password, salt);
    const encrypted = Buffer.from(stored.encryptedB64, "base64");
    const iv = encrypted.subarray(0, 12);
    const tag = encrypted.subarray(encrypted.length - 16);
    const ciphertext = encrypted.subarray(12, encrypted.length - 16);
    let plaintext: Buffer;
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
      throw new WrongPasswordError();
    }
    const secret = JSON.parse(plaintext.toString("utf8")) as { messageKeyB64: string; x25519PrivateKeyB64: string };
    const identity: OfficerIdentity = {
      userId: stored.userId,
      messageKey: new Uint8Array(Buffer.from(secret.messageKeyB64, "base64")),
      x25519PrivateKey: new Uint8Array(Buffer.from(secret.x25519PrivateKeyB64, "base64")),
      x25519PublicKey: new Uint8Array(Buffer.from(stored.x25519PublicKeyB64, "base64")),
    };
    return { identity, wasCreated: false };
  }

  const userId = randomUUID();
  const messageKey = randomBytes(32);
  const { privateKey, publicKey } = x25519GenerateKeyPair();
  const identity: OfficerIdentity = {
    userId,
    messageKey: new Uint8Array(messageKey),
    x25519PrivateKey: privateKey,
    x25519PublicKey: publicKey,
  };
  saveOfficerIdentity(identityPath, identity, password);
  return { identity, wasCreated: true };
}

export function saveOfficerIdentity(identityPath: string, identity: OfficerIdentity, password: string): void {
  const salt = randomBytes(16);
  const key = deriveKey(password, salt);
  const iv = randomBytes(12);
  const secretJson = JSON.stringify({
    messageKeyB64: Buffer.from(identity.messageKey).toString("base64"),
    x25519PrivateKeyB64: Buffer.from(identity.x25519PrivateKey).toString("base64"),
  });
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(secretJson, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const encrypted = Buffer.concat([iv, ciphertext, tag]);

  const stored: StoredIdentityFile = {
    userId: identity.userId,
    x25519PublicKeyB64: Buffer.from(identity.x25519PublicKey).toString("base64"),
    scryptSaltB64: salt.toString("base64"),
    encryptedB64: encrypted.toString("base64"),
  };
  fs.mkdirSync(path.dirname(identityPath), { recursive: true });
  fs.writeFileSync(identityPath, JSON.stringify(stored, null, 2), "utf8");
}

/**
 * The pair's actual shared secret — symmetric because both devices sort their two message keys
 * into a fixed order before hashing. Direct port of `IdentityManager.pairSecret`.
 */
export function pairSecret(myMessageKey: Uint8Array, theirMessageKeyB64: string): Uint8Array {
  const other = new Uint8Array(Buffer.from(theirMessageKeyB64, "base64"));
  const [a, b] = compareUnsigned(myMessageKey, other) <= 0 ? [myMessageKey, other] : [other, myMessageKey];
  return sha256Digest(a, b);
}

/** Direct port of `IdentityManager.myWireId`/`expectedWireId`, generation-counter form (the
 *  cross-platform variant every non-Android peer uses — see CROSS_PLATFORM_PLAN.md). */
export function wireTag(secret: Uint8Array, identity: string, generation: number): string {
  return Buffer.from(hmacSha256(secret, new TextEncoder().encode(`${identity}:${generation}`))).toString("base64");
}
