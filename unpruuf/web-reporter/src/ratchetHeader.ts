/** Browser port of officer-app/src/crypto/ratchetHeader.ts — identical wire layout. */
export const RATCHET_HEADER_DH_KEY_LEN = 32;
export const RATCHET_HEADER_SIZE = RATCHET_HEADER_DH_KEY_LEN + 4 + 4;

export interface RatchetHeader {
  dhPub: Uint8Array;
  previousChainLength: number;
  messageNumber: number;
}

function writeUint32BE(out: Uint8Array, at: number, value: number): void {
  out[at] = (value >>> 24) & 0xff;
  out[at + 1] = (value >>> 16) & 0xff;
  out[at + 2] = (value >>> 8) & 0xff;
  out[at + 3] = value & 0xff;
}

function readUint32BE(raw: Uint8Array, at: number): number {
  return (((raw[at] & 0xff) << 24) | ((raw[at + 1] & 0xff) << 16) | ((raw[at + 2] & 0xff) << 8) | (raw[at + 3] & 0xff)) >>> 0;
}

export function encodeRatchetHeader(header: RatchetHeader): Uint8Array {
  if (header.dhPub.length !== RATCHET_HEADER_DH_KEY_LEN) throw new Error(`dhPub must be ${RATCHET_HEADER_DH_KEY_LEN} bytes`);
  const out = new Uint8Array(RATCHET_HEADER_SIZE);
  out.set(header.dhPub, 0);
  writeUint32BE(out, RATCHET_HEADER_DH_KEY_LEN, header.previousChainLength);
  writeUint32BE(out, RATCHET_HEADER_DH_KEY_LEN + 4, header.messageNumber);
  return out;
}

export function decodeRatchetHeader(raw: Uint8Array, offset = 0): RatchetHeader {
  if (raw.length - offset < RATCHET_HEADER_SIZE) throw new Error("truncated ratchet header");
  const dhPub = raw.slice(offset, offset + RATCHET_HEADER_DH_KEY_LEN);
  const previousChainLength = readUint32BE(raw, offset + RATCHET_HEADER_DH_KEY_LEN);
  const messageNumber = readUint32BE(raw, offset + RATCHET_HEADER_DH_KEY_LEN + 4);
  return { dhPub, previousChainLength, messageNumber };
}
