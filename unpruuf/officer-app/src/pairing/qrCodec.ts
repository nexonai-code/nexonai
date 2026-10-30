/**
 * Direct port of `screens/qrpair/QrCodec.kt`'s `compactUserId`/`expandUserId`/`parseSimpleJson`
 * — the compact-UUID convention and minimal flat-JSON parser every pairing payload on Android/
 * iOS uses. Must stay byte-for-byte compatible: a UUID string -> 16 raw bytes (most-significant
 * 8 bytes, then least-significant 8 bytes, both big-endian) -> standard (not url-safe) base64,
 * no padding, no line wraps.
 */

export function compactUserId(userId: string): string | null {
  const hex = userId.replace(/-/g, "");
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) return null;
  const bytes = Buffer.from(hex, "hex");
  return bytes.toString("base64").replace(/=+$/, "");
}

/** Reverses [compactUserId] back to the standard dashed UUID string. */
export function expandUserId(compact: string): string | null {
  try {
    // Node's base64 decoder tolerates missing padding already, matching Android's NO_PADDING mode.
    const bytes = Buffer.from(compact, "base64");
    if (bytes.length !== 16) return null;
    const hex = bytes.toString("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  } catch {
    return null;
  }
}

/** Minimal flat {"k":"v",...} parser — matches Android/iOS's own hand-rolled parser exactly:
 *  every value here is a short opaque string or Base64, never containing unescaped quotes or
 *  braces, so a real JSON parser isn't needed (and would accept input this one deliberately
 *  doesn't, which isn't a concern here — every field is validated again after parsing). */
export function parseSimpleJson(json: string): Record<string, string> {
  const result: Record<string, string> = {};
  const cleaned = json.trim().replace(/^\{/, "").replace(/\}$/, "");
  const pairs = cleaned.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  for (const pair of pairs) {
    const colonIdx = pair.indexOf(":");
    if (colonIdx < 0) continue;
    const key = pair.slice(0, colonIdx).trim().replace(/^"|"$/g, "");
    const value = pair.slice(colonIdx + 1).trim().replace(/^"|"$/g, "");
    result[key] = value;
  }
  return result;
}
