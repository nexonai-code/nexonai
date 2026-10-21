/**
 * Direct port of `domain/network/MessagePayload.kt` — binary layout of the plaintext a Double
 * Ratchet message carries: `[type: 1 byte][payload]`.
 */
const TYPE_TEXT = 0;
const TYPE_FILE = 1;
const TYPE_IMAGE = 2;

export type MessageContent =
  | { kind: "text"; text: string }
  | { kind: "attachment"; name: string; bytes: Uint8Array; isImage: boolean };

export function encodeText(text: string): Uint8Array {
  const textBytes = new TextEncoder().encode(text);
  const out = new Uint8Array(1 + textBytes.length);
  out[0] = TYPE_TEXT;
  out.set(textBytes, 1);
  return out;
}

export function decodeMessagePayload(raw: Uint8Array): MessageContent | null {
  if (raw.length === 0) return null;
  const type = raw[0];
  if (type === TYPE_TEXT) {
    return { kind: "text", text: new TextDecoder().decode(raw.slice(1)) };
  }
  if (type === TYPE_FILE || type === TYPE_IMAGE) {
    if (raw.length < 3) return null;
    const nameLen = ((raw[1] & 0xff) << 8) | (raw[2] & 0xff);
    if (raw.length < 3 + nameLen) return null;
    const name = new TextDecoder().decode(raw.slice(3, 3 + nameLen));
    const bytes = raw.slice(3 + nameLen);
    return { kind: "attachment", name, bytes, isImage: type === TYPE_IMAGE };
  }
  return null;
}
