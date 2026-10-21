import { decodeRatchetHeader, encodeRatchetHeader, RATCHET_HEADER_SIZE, RatchetHeader } from "../crypto/ratchetHeader";

/**
 * Direct port of `domain/network/RatchetFrame.kt` — outer wire framing for one ratchet-
 * encrypted logical message, split across [CIPHERTEXT_CHUNK_SIZE] pieces so it fits
 * `NetworkObfuscation`'s 4096-byte packets. The officer-app only ever *sends* `Single` frames
 * (short text replies never need chunking) but must be able to *decode* all three kinds, since
 * a reporter's Android app can legally send a chunked photo/file frame train.
 */
export const KIND_SINGLE = 0;
export const KIND_CHUNK_START = 1;
export const KIND_CHUNK_CONT = 2;

export const CIPHERTEXT_CHUNK_SIZE = 4000;

export type Frame =
  | { kind: "single"; header: RatchetHeader; ciphertext: Uint8Array }
  | { kind: "chunkStart"; totalChunks: number; header: RatchetHeader; piece: Uint8Array }
  | { kind: "chunkCont"; index: number; piece: Uint8Array };

export function splitFrame(header: RatchetHeader, ciphertext: Uint8Array): Frame[] {
  if (ciphertext.length <= CIPHERTEXT_CHUNK_SIZE) {
    return [{ kind: "single", header, ciphertext }];
  }
  const totalChunks = Math.ceil(ciphertext.length / CIPHERTEXT_CHUNK_SIZE);
  const frames: Frame[] = [];
  for (let index = 0; index < totalChunks; index++) {
    const start = index * CIPHERTEXT_CHUNK_SIZE;
    const end = Math.min(start + CIPHERTEXT_CHUNK_SIZE, ciphertext.length);
    const piece = ciphertext.slice(start, end);
    frames.push(index === 0 ? { kind: "chunkStart", totalChunks, header, piece } : { kind: "chunkCont", index, piece });
  }
  return frames;
}

export function encodeFrame(frame: Frame): Uint8Array {
  if (frame.kind === "single") {
    return concatAll(Uint8Array.of(KIND_SINGLE), encodeRatchetHeader(frame.header), frame.ciphertext);
  }
  if (frame.kind === "chunkStart") {
    return concatAll(Uint8Array.of(KIND_CHUNK_START), intBytes(frame.totalChunks), encodeRatchetHeader(frame.header), frame.piece);
  }
  return concatAll(Uint8Array.of(KIND_CHUNK_CONT), intBytes(frame.index), frame.piece);
}

export function decodeFrame(raw: Uint8Array): Frame | null {
  if (raw.length === 0) return null;
  const kind = raw[0];
  if (kind === KIND_SINGLE) {
    if (raw.length < 1 + RATCHET_HEADER_SIZE) return null;
    const header = decodeRatchetHeader(raw, 1);
    const ciphertext = raw.slice(1 + RATCHET_HEADER_SIZE);
    return { kind: "single", header, ciphertext };
  }
  if (kind === KIND_CHUNK_START) {
    if (raw.length < 1 + 4 + RATCHET_HEADER_SIZE) return null;
    const totalChunks = readInt(raw, 1);
    if (totalChunks < 2) return null;
    const header = decodeRatchetHeader(raw, 1 + 4);
    const piece = raw.slice(1 + 4 + RATCHET_HEADER_SIZE);
    return { kind: "chunkStart", totalChunks, header, piece };
  }
  if (kind === KIND_CHUNK_CONT) {
    if (raw.length < 1 + 4) return null;
    const index = readInt(raw, 1);
    if (index < 1) return null;
    return { kind: "chunkCont", index, piece: raw.slice(1 + 4) };
  }
  return null;
}

function intBytes(value: number): Uint8Array {
  return Uint8Array.of((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}

function readInt(raw: Uint8Array, at: number): number {
  return (((raw[at] & 0xff) << 24) | ((raw[at + 1] & 0xff) << 16) | ((raw[at + 2] & 0xff) << 8) | (raw[at + 3] & 0xff)) >>> 0;
}

function concatAll(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}
