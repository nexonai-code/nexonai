/**
 * Wire format for handing a relay's address + auth token to the Android app in one blob — both
 * QR-encoded and printed as plain copyable text (see windows-start.ts). Deliberately a flat,
 * colon-delimited string rather than JSON: short enough to type by hand if a camera scan isn't
 * an option, matching this project's existing preference for compact QR payloads (see
 * QrPairViewModel's own hand-rolled single-letter-key JSON for contact pairing).
 *
 * Format: `unpruuf-relay:v1:<onion-or-host:port>:<authToken>`
 * The Android side must parse this identically — see RelayManager.parseConnectionString in the
 * app for the Kotlin counterpart of buildConnectionString/parseConnectionString below.
 */
const PREFIX = "unpruuf-relay:v1:";

export function buildConnectionString(address: string, authToken: string): string {
  return `${PREFIX}${address}:${authToken}`;
}

export interface ParsedConnection {
  address: string;
  authToken: string;
}

export function parseConnectionString(raw: string): ParsedConnection | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith(PREFIX)) return null;
  const rest = trimmed.slice(PREFIX.length);
  // The address itself may contain no colons (a bare .onion) or one (host:port) — the auth
  // token is always the LAST segment, so split from the right.
  const lastColon = rest.lastIndexOf(":");
  if (lastColon <= 0 || lastColon === rest.length - 1) return null;
  const address = rest.slice(0, lastColon);
  const authToken = rest.slice(lastColon + 1);
  if (address.length === 0 || authToken.length === 0) return null;
  return { address, authToken };
}
