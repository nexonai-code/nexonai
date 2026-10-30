import { base64ToBytes, bytesToBase64 } from "./base64";

/** Browser port of officer-app/src/pairing/qrCodec.ts. */
export function compactUserId(userId: string): string | null {
  const hex = userId.replace(/-/g, "");
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) return null;
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Number.parseInt(hex.substr(i * 2, 2), 16);
  return bytesToBase64(bytes).replace(/=+$/, "");
}

export function expandUserId(compact: string): string | null {
  try {
    const bytes = base64ToBytes(compact);
    if (bytes.length !== 16) return null;
    const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  } catch {
    return null;
  }
}

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
