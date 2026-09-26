import { aeadDecrypt, aeadEncrypt, hkdfSha256, hmacSha256, x25519GenerateKeyPair, x25519SharedSecret } from "./primitives";
import { decodeRatchetHeader, encodeRatchetHeader, RatchetHeader } from "./ratchetHeader";

/** Browser port of officer-app/src/crypto/doubleRatchet.ts — identical algorithm/constants. */
export const MAX_SKIPPED_KEYS = 1000;
const ROOT_KDF_INFO = new TextEncoder().encode("unpruuf-ratchet-root-v1");

export class RatchetError extends Error {}

export interface RatchetKeyPair { privateKey: Uint8Array; publicKey: Uint8Array }

export interface RatchetState {
  dhsPrivateKey: Uint8Array;
  dhsPublicKey: Uint8Array;
  dhr: Uint8Array | null;
  rootKey: Uint8Array;
  sendChainKey: Uint8Array | null;
  recvChainKey: Uint8Array | null;
  sendCount: number;
  recvCount: number;
  previousChainLength: number;
  skippedKeys: Map<string, Uint8Array>;
}

export interface EncryptedMessage { header: RatchetHeader; ciphertext: Uint8Array }

export function generateRatchetKeyPair(): RatchetKeyPair { return x25519GenerateKeyPair(); }

export function initSender(sharedRootKey: Uint8Array, ownKeyPair: RatchetKeyPair, theirPublicKey: Uint8Array): RatchetState {
  const state: RatchetState = {
    dhsPrivateKey: ownKeyPair.privateKey, dhsPublicKey: ownKeyPair.publicKey, dhr: theirPublicKey,
    rootKey: sharedRootKey, sendChainKey: null, recvChainKey: null,
    sendCount: 0, recvCount: 0, previousChainLength: 0, skippedKeys: new Map(),
  };
  const { rootKey, chainKey } = kdfRootKey(state.rootKey, dh(state.dhsPrivateKey, theirPublicKey));
  state.rootKey = rootKey;
  state.sendChainKey = chainKey;
  return state;
}

export function initReceiver(sharedRootKey: Uint8Array, ownKeyPair: RatchetKeyPair): RatchetState {
  return {
    dhsPrivateKey: ownKeyPair.privateKey, dhsPublicKey: ownKeyPair.publicKey, dhr: null,
    rootKey: sharedRootKey, sendChainKey: null, recvChainKey: null,
    sendCount: 0, recvCount: 0, previousChainLength: 0, skippedKeys: new Map(),
  };
}

export function ratchetEncrypt(state: RatchetState, plaintext: Uint8Array, associatedData: Uint8Array): EncryptedMessage {
  if (!state.sendChainKey) throw new RatchetError("no sending chain yet — must receive at least one message first");
  const { nextChainKey, messageKey } = kdfChainKey(state.sendChainKey);
  state.sendChainKey = nextChainKey;
  const header: RatchetHeader = { dhPub: state.dhsPublicKey, previousChainLength: state.previousChainLength, messageNumber: state.sendCount };
  state.sendCount += 1;
  const fullAd = concat(associatedData, encodeRatchetHeader(header));
  const ciphertext = aeadEncrypt(messageKey, plaintext, fullAd);
  return { header, ciphertext };
}

export function ratchetDecrypt(state: RatchetState, header: RatchetHeader, ciphertext: Uint8Array, associatedData: Uint8Array): Uint8Array {
  const fullAd = concat(associatedData, encodeRatchetHeader(header));
  const skipped = trySkippedKey(state, header);
  if (skipped) return aeadDecrypt(skipped, ciphertext, fullAd);

  if (!state.dhr || !bytesEqual(header.dhPub, state.dhr)) {
    skipMessageKeys(state, header.previousChainLength);
    dhRatchetStep(state, header.dhPub);
  }
  skipMessageKeys(state, header.messageNumber);
  if (!state.recvChainKey) throw new RatchetError("receiving chain not established");
  const { nextChainKey, messageKey } = kdfChainKey(state.recvChainKey);
  state.recvChainKey = nextChainKey;
  state.recvCount += 1;
  return aeadDecrypt(messageKey, ciphertext, fullAd);
}

function dhRatchetStep(state: RatchetState, theirNewPublicKey: Uint8Array): void {
  state.previousChainLength = state.sendCount;
  state.sendCount = 0;
  state.recvCount = 0;
  state.dhr = theirNewPublicKey;
  const step1 = kdfRootKey(state.rootKey, dh(state.dhsPrivateKey, theirNewPublicKey));
  state.rootKey = step1.rootKey;
  state.recvChainKey = step1.chainKey;
  const newKeyPair = generateRatchetKeyPair();
  state.dhsPrivateKey = newKeyPair.privateKey;
  state.dhsPublicKey = newKeyPair.publicKey;
  const step2 = kdfRootKey(state.rootKey, dh(state.dhsPrivateKey, theirNewPublicKey));
  state.rootKey = step2.rootKey;
  state.sendChainKey = step2.chainKey;
}

function skipMessageKeys(state: RatchetState, until: number): void {
  if (!state.recvChainKey) return;
  if (until - state.recvCount > MAX_SKIPPED_KEYS) throw new RatchetError(`too many skipped messages (${until - state.recvCount})`);
  let ck = state.recvChainKey;
  while (state.recvCount < until) {
    const { nextChainKey, messageKey } = kdfChainKey(ck);
    ck = nextChainKey;
    state.skippedKeys.set(skippedKeyId(state.dhr as Uint8Array, state.recvCount), messageKey);
    if (state.skippedKeys.size > MAX_SKIPPED_KEYS) throw new RatchetError("skipped-key cache overflow");
    state.recvCount += 1;
  }
  state.recvChainKey = ck;
}

function trySkippedKey(state: RatchetState, header: RatchetHeader): Uint8Array | undefined {
  const id = skippedKeyId(header.dhPub, header.messageNumber);
  const key = state.skippedKeys.get(id);
  if (key) state.skippedKeys.delete(id);
  return key;
}

function skippedKeyId(dhPub: Uint8Array, n: number): string {
  let binary = "";
  for (let i = 0; i < dhPub.length; i++) binary += String.fromCharCode(dhPub[i]);
  return btoa(binary) + ":" + n;
}

function dh(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array { return x25519SharedSecret(privateKey, publicKey); }

function kdfRootKey(rootKey: Uint8Array, dhOutput: Uint8Array): { rootKey: Uint8Array; chainKey: Uint8Array } {
  const out = hkdfSha256(dhOutput, rootKey, ROOT_KDF_INFO, 64);
  return { rootKey: out.slice(0, 32), chainKey: out.slice(32, 64) };
}

function kdfChainKey(chainKey: Uint8Array): { nextChainKey: Uint8Array; messageKey: Uint8Array } {
  const nextChainKey = hmacSha256(chainKey, Uint8Array.of(0x02));
  const messageKey = hmacSha256(chainKey, Uint8Array.of(0x01));
  return { nextChainKey, messageKey };
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
