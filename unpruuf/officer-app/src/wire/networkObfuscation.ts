import { randomBytes, randomInt } from "node:crypto";

/**
 * Direct port of `domain/network/NetworkObfuscation.kt`. Every outer packet — direct P2P or
 * relay-deposited — is exactly 4096 bytes, message length hidden inside random padding at a
 * random offset. `MAX_BLOB_BYTES` on the relay server is this same constant, not a coincidence.
 */
export const PACKET_SIZE = 4096;

export function padPacket(payload: Uint8Array): Uint8Array {
  if (payload.length > PACKET_SIZE - 8) throw new Error("Payload exceeds max size");
  const result = new Uint8Array(PACKET_SIZE);
  const padLen = PACKET_SIZE - payload.length - 8;
  const pad = randomBytes(Math.max(padLen, 0));
  const offset = pad.length === 0 ? 0 : randomInt(Math.max(1, Math.floor(pad.length / 2)));
  const view = new DataView(result.buffer);
  view.setUint32(0, payload.length, false);
  view.setUint32(4, offset, false);
  result.set(pad.subarray(0, offset), 8);
  result.set(payload, 8 + offset);
  return result;
}

export function unpadPacket(packet: Uint8Array): Uint8Array {
  if (packet.length !== PACKET_SIZE) throw new Error("Invalid packet size");
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  const payloadSize = view.getUint32(0, false);
  const offset = view.getUint32(4, false);
  return packet.slice(8 + offset, 8 + offset + payloadSize);
}
