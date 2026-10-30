import { compactUserId, expandUserId, parseSimpleJson } from "./qrCodec";
import { buildConnectionStringList, parseConnectionStringList, RELAY_POOL_MAX_SIZE } from "../relay/connectionString";

/**
 * Direct port of `screens/qrpair/CrossPlatformPairing.kt` — the cross-platform (relay-mandatory)
 * pairing QR, the same format iOS's `PairingPayload.swift` implements. Wire format:
 * `{"v":2,"u":"<compact userId>","p":"<messageKey b64>","k":"<x25519 ratchet pubkey b64>",
 * "n":"<relay1>[;<relay2>][;<relay3>]"[,"e":"<edition>"]}`.
 *
 * The officer-app always sets `e` to `"officer"` on ITS OWN generated payload — a value no real
 * Android/iOS edition ever uses, existing purely so `AppEdition.canAdd()` on a scanning
 * Whistleblower-edition phone recognizes this as a valid pairing target (see AppEdition.kt).
 */
export interface CrossPlatformPairingPayload {
  version: number;
  userId: string;
  messageKeyBase64: string;
  x25519RatchetPublicKeyBase64: string;
  relayConnectionStrings: string[];
  appEdition: string;
}

export const OFFICER_EDITION = "officer";
const STANDARD_EDITION = "standard";

export function encodeCrossPlatformPayload(payload: CrossPlatformPairingPayload): string {
  const compact = compactUserId(payload.userId) ?? payload.userId;
  const n = escape(buildConnectionStringList(payload.relayConnectionStrings));
  return `{"v":${payload.version},"u":"${compact}","p":"${payload.messageKeyBase64}","k":"${payload.x25519RatchetPublicKeyBase64}","n":"${n}","e":"${payload.appEdition}"}`;
}

export function decodeCrossPlatformPayload(json: string): CrossPlatformPairingPayload | null {
  try {
    const map = parseSimpleJson(json);
    const compact = map["u"];
    const n = map["n"];
    if (!compact || !n) return null;
    const relays = parseConnectionStringList(unescape(n)).slice(0, RELAY_POOL_MAX_SIZE);
    if (relays.length === 0) return null;
    const userId = expandUserId(compact);
    if (!userId) return null;
    if (!map["p"] || !map["k"]) return null;
    return {
      version: Number.parseInt(map["v"] ?? "1", 10) || 1,
      userId,
      messageKeyBase64: map["p"],
      x25519RatchetPublicKeyBase64: map["k"],
      relayConnectionStrings: relays,
      appEdition: map["e"] ?? STANDARD_EDITION,
    };
  } catch {
    return null;
  }
}

function escape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function unescape(s: string): string {
  return s.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}
