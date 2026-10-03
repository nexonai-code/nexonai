import { createCipheriv, createDecipheriv, randomBytes, randomInt } from "node:crypto";
import { hkdfSha256, hmacSha256, x25519GenerateKeyPair, x25519SharedSecret } from "../crypto/primitives";
import { OfficerIdentity } from "./officerIdentity";

/**
 * One organisation-wide QR code instead of one code per reporter.
 *
 * The officer's QR (see intake.ts's myPairingPayloadJson) is the same for everybody — printed on
 * a poster, in the intranet, on a card. A per-employee code would let the organisation map each
 * code to a person, which is exactly what a reporting channel must never allow.
 *
 * After scanning, the reporter's app sends ONE "intake" packet to the officer's relay:
 *
 *   tag    = base64(HMAC-SHA256(officerMessageKey, "unpruuf-intake-v1:" + hour))
 *            hour = floor(unix ms / 3 600 000). Anyone holding the QR can compute it, which is
 *            the point: it is the organisation's public letterbox.
 *   packet = ephemeralX25519Pub(32) || iv(12) || AES-256-GCM(key, plaintext) (ciphertext||tag16)
 *            key = HKDF-SHA256(ikm = X25519(ephemeral, officerX25519Pub),
 *                              salt = officerMessageKey, info = "unpruuf-intake-v1", 32)
 *            then padded to the normal fixed packet size like every other packet.
 *   plaintext = "UNPRUUF_INTAKE_V1\n" + <reporter wire identity or empty> + "\n" + <the reporter's
 *            normal cross-platform pairing JSON — the code they used to have to copy by hand>.
 *
 * Only the officer's private key opens it. The officer-app creates the case automatically, gives
 * it a random case number and sends a receipt back over the case's own Double Ratchet channel
 * (see caseSignals.ts). The reporter's app re-sends the intake every few hours until that
 * receipt arrives, so an officer who is offline for a while still gets it.
 */

export const INTAKE_INFO = "unpruuf-intake-v1";
export const INTAKE_PLAINTEXT_PREFIX = "UNPRUUF_INTAKE_V1";
const HOUR_MS = 60 * 60 * 1000;
/** How far back the officer looks for intake packets (the reporter retries anyway). */
export const INTAKE_HOURS_BACK = 47;
/** Tolerates a reporter clock that runs slightly ahead. */
export const INTAKE_HOURS_AHEAD = 1;

export function intakeHour(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / HOUR_MS);
}

export function intakeTag(officerMessageKey: Uint8Array, hour: number): string {
  return Buffer.from(hmacSha256(officerMessageKey, new TextEncoder().encode(`${INTAKE_INFO}:${hour}`))).toString("base64");
}

/** Every intake tag the officer polls right now, newest hour first. */
export function currentIntakeTags(officerMessageKey: Uint8Array, nowMs: number = Date.now()): string[] {
  const now = intakeHour(nowMs);
  const tags: string[] = [];
  for (let h = now + INTAKE_HOURS_AHEAD; h >= now - INTAKE_HOURS_BACK; h--) tags.push(intakeTag(officerMessageKey, h));
  return tags;
}

function intakeKey(sharedSecret: Uint8Array, officerMessageKey: Uint8Array): Buffer {
  return Buffer.from(hkdfSha256(sharedSecret, officerMessageKey, new TextEncoder().encode(INTAKE_INFO), 32));
}

/** Reporter side (used by tests here; the Android app and web-reporter implement the same). */
export function sealIntake(officerX25519Pub: Uint8Array, officerMessageKey: Uint8Array, plaintext: Uint8Array): Uint8Array {
  const eph = x25519GenerateKeyPair();
  const key = intakeKey(x25519SharedSecret(eph.privateKey, officerX25519Pub), officerMessageKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  return new Uint8Array(Buffer.concat([Buffer.from(eph.publicKey), iv, ct]));
}

/** Officer side. Null for anything that isn't an intake addressed to this officer. */
export function openIntake(identity: OfficerIdentity, sealed: Uint8Array): Uint8Array | null {
  if (sealed.length < 32 + 12 + 16) return null;
  try {
    const ephPub = sealed.subarray(0, 32);
    const iv = sealed.subarray(32, 44);
    const body = sealed.subarray(44);
    const key = intakeKey(x25519SharedSecret(identity.x25519PrivateKey, ephPub), identity.messageKey);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(body.subarray(body.length - 16));
    return new Uint8Array(Buffer.concat([decipher.update(body.subarray(0, body.length - 16)), decipher.final()]));
  } catch {
    return null;
  }
}

export interface IntakeContent {
  wireIdentity: string | null;
  pairingJson: string;
}

export function encodeIntakePlaintext(content: IntakeContent): Uint8Array {
  return new TextEncoder().encode(`${INTAKE_PLAINTEXT_PREFIX}\n${content.wireIdentity ?? ""}\n${content.pairingJson}`);
}

export function parseIntakePlaintext(plaintext: Uint8Array): IntakeContent | null {
  const text = new TextDecoder().decode(plaintext);
  const first = text.indexOf("\n");
  if (first < 0 || text.slice(0, first) !== INTAKE_PLAINTEXT_PREFIX) return null;
  const second = text.indexOf("\n", first + 1);
  if (second < 0) return null;
  const wireIdentity = text.slice(first + 1, second).trim();
  const pairingJson = text.slice(second + 1).trim();
  if (!pairingJson.startsWith("{")) return null;
  if (wireIdentity && !/^[0-9a-fA-F-]{36}$/.test(wireIdentity)) return null;
  return { wireIdentity: wireIdentity || null, pairingJson };
}

// No 0/O, 1/I/L — a case number is read out loud and typed by hand.
const CASE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Random, never sequential: "2026-0042" would reveal how many reports exist and when. */
export function generateCaseNumber(): string {
  const pick = () => CASE_ALPHABET[randomInt(CASE_ALPHABET.length)];
  const block = () => Array.from({ length: 4 }, pick).join("");
  return `HW-${block()}-${block()}`;
}

export function isCaseNumber(s: string): boolean {
  return /^HW-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/.test(s);
}
