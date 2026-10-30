import { encryptForContact, hkdfSha256, hmacSha256, x25519GenerateKeyPair, x25519SharedSecret } from "./primitives";
import { bytesToBase64 } from "./base64";

/**
 * Browser port of officer-app/src/officer/caseIntake.ts + caseSignals.ts (and the Android
 * app's OfficerCase.kt): the organisation-wide QR intake and the case number / status signal.
 * See the officer-app file for the full wire format and the reasoning behind it.
 */
export const INTAKE_INFO = "unpruuf-intake-v1";
export const CASE_SIGNAL_PREFIX = "UNPRUUF_CASE_V1:";
export const CASE_HELLO_TEXT = "UNPRUUF_CASE_HELLO_V1";
export const INTAKE_RETRY_MS = 6 * 60 * 60 * 1000;
export const INTAKE_GIVE_UP_MS = 14 * 24 * 60 * 60 * 1000;

const enc = new TextEncoder();

export function intakeHour(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / (60 * 60 * 1000));
}

export function intakeTag(officerMessageKey: Uint8Array, hour: number): string {
  return bytesToBase64(hmacSha256(officerMessageKey, enc.encode(`${INTAKE_INFO}:${hour}`)));
}

/** ephemeralPub(32) || iv(12) || AES-256-GCM ciphertext+tag — same bytes as the other ports. */
export function sealIntake(officerX25519Pub: Uint8Array, officerMessageKey: Uint8Array, pairingJson: string): Uint8Array {
  const plaintext = enc.encode(`UNPRUUF_INTAKE_V1\n\n${pairingJson}`);
  const eph = x25519GenerateKeyPair();
  const key = hkdfSha256(x25519SharedSecret(eph.privateKey, officerX25519Pub), officerMessageKey, enc.encode(INTAKE_INFO), 32);
  const body = encryptForContact(plaintext, key);
  const out = new Uint8Array(32 + body.length);
  out.set(eph.publicKey, 0);
  out.set(body, 32);
  return out;
}

export interface CaseInfo {
  number: string;
  status: "acknowledged" | "in_progress" | "closed";
  openedAt: number | null;
  ackDueAt: number | null;
  feedbackDueAt: number | null;
  updatedAt: number;
}

export function parseCaseSignal(text: string): CaseInfo | null {
  if (!text.startsWith(CASE_SIGNAL_PREFIX)) return null;
  try {
    const j = JSON.parse(text.slice(CASE_SIGNAL_PREFIX.length));
    if (typeof j.n !== "string" || !/^HW-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/.test(j.n)) return null;
    if (!["acknowledged", "in_progress", "closed"].includes(j.s)) return null;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    return { number: j.n, status: j.s, openedAt: num(j.o), ackDueAt: num(j.a), feedbackDueAt: num(j.f), updatedAt: num(j.t) ?? Date.now() };
  } catch {
    return null;
  }
}
