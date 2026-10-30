/** Browser-safe base64 <-> bytes — no `Buffer` global (not reliably present without a bundler
 *  polyfill), just `btoa`/`atob` over a byte string. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  // Not every producer of a base64 string pads it (Android's NO_PADDING mode, this repo's own
  // compact-UUID codec) — some browsers' `atob` reject unpadded input, so pad defensively rather
  // than relying on each caller to remember to.
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
