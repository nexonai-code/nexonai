import {
  aeadDecrypt,
  aeadEncrypt,
  hkdfSha256,
  hmacSha256,
  x25519GenerateKeyPair,
  x25519PublicFromPrivate,
  x25519SharedSecret,
} from "./primitives";
import { decodeRatchetHeader, encodeRatchetHeader, RatchetHeader } from "./ratchetHeader";

/**
 * Direct port of `domain/network/ratchet/DoubleRatchet.kt` (Signal spec:
 * https://signal.org/docs/specifications/doubleratchet/). Same constants, same KDF wiring,
 * same skipped-message-key handling — kept as close to the Kotlin source as TypeScript allows
 * so a future protocol change only has to be re-read once, not re-derived per platform.
 */

export const MAX_SKIPPED_KEYS = 1000;
const ROOT_KDF_INFO = new TextEncoder().encode("unpruuf-ratchet-root-v1");

export class RatchetError extends Error {}

export interface RatchetKeyPair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

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
  /** Keyed by `base64(dhPub) + ":" + n` — same id scheme as the Kotlin/Swift ports. */
  skippedKeys: Map<string, Uint8Array>;
}

export interface EncryptedMessage {
  header: RatchetHeader;
  ciphertext: Uint8Array;
}

export function generateRatchetKeyPair(): RatchetKeyPair {
  return x25519GenerateKeyPair();
}

/** QR-scanner role: already knows the peer's public key, so the initial sending DH step runs
 *  immediately and this side can send right away. */
export function initSender(sharedRootKey: Uint8Array, ownKeyPair: RatchetKeyPair, theirPublicKey: Uint8Array): RatchetState {
  const state: RatchetState = {
    dhsPrivateKey: ownKeyPair.privateKey,
    dhsPublicKey: ownKeyPair.publicKey,
    dhr: theirPublicKey,
    rootKey: sharedRootKey,
    sendChainKey: null,
    recvChainKey: null,
    sendCount: 0,
    recvCount: 0,
    previousChainLength: 0,
    skippedKeys: new Map(),
  };
  const { rootKey, chainKey } = kdfRootKey(state.rootKey, dh(state.dhsPrivateKey, theirPublicKey));
  state.rootKey = rootKey;
  state.sendChainKey = chainKey;
  return state;
}

/** QR "initiator" role: cannot send until [decrypt] has processed at least one inbound
 *  message — correct Double Ratchet behaviour, not a bug. */
export function initReceiver(sharedRootKey: Uint8Array, ownKeyPair: RatchetKeyPair): RatchetState {
  return {
    dhsPrivateKey: ownKeyPair.privateKey,
    dhsPublicKey: ownKeyPair.publicKey,
    dhr: null,
    rootKey: sharedRootKey,
    sendChainKey: null,
    recvChainKey: null,
    sendCount: 0,
    recvCount: 0,
    previousChainLength: 0,
    skippedKeys: new Map(),
  };
}

export function ratchetEncrypt(state: RatchetState, plaintext: Uint8Array, associatedData: Uint8Array): EncryptedMessage {
  if (!state.sendChainKey) {
    throw new RatchetError("no sending chain yet — must receive at least one message first");
  }
  const { nextChainKey, messageKey } = kdfChainKey(state.sendChainKey);
  state.sendChainKey = nextChainKey;
  const header: RatchetHeader = {
    dhPub: state.dhsPublicKey,
    previousChainLength: state.previousChainLength,
    messageNumber: state.sendCount,
  };
  state.sendCount += 1;
  const fullAd = concat(associatedData, encodeRatchetHeader(header));
  const ciphertext = aeadEncrypt(messageKey, plaintext, fullAd);
  return { header, ciphertext };
}

export function ratchetDecrypt(
  state: RatchetState,
  header: RatchetHeader,
  ciphertext: Uint8Array,
  associatedData: Uint8Array,
): Uint8Array {
  const fullAd = concat(associatedData, encodeRatchetHeader(header));

  const skipped = trySkippedKey(state, header);
  if (skipped) {
    return aeadDecrypt(skipped, ciphertext, fullAd);
  }

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

// ---- DH ratchet ------------------------------------------------------------

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

// ---- Skipped message keys (out-of-order delivery) --------------------------

function skipMessageKeys(state: RatchetState, until: number): void {
  if (!state.recvChainKey) return; // nothing received on this chain yet
  if (until - state.recvCount > MAX_SKIPPED_KEYS) {
    throw new RatchetError(`too many skipped messages (${until - state.recvCount})`);
  }
  let ck = state.recvChainKey;
  while (state.recvCount < until) {
    const { nextChainKey, messageKey } = kdfChainKey(ck);
    ck = nextChainKey;
    state.skippedKeys.set(skippedKeyId(state.dhr as Uint8Array, state.recvCount), messageKey);
    if (state.skippedKeys.size > MAX_SKIPPED_KEYS) {
      throw new RatchetError("skipped-key cache overflow");
    }
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
  return Buffer.from(dhPub).toString("base64") + ":" + n;
}

// ---- Primitives -------------------------------------------------------------

function dh(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  return x25519SharedSecret(privateKey, publicKey);
}

/** KDF_RK: derives a fresh root key + chain key from the running root key and a new DH output. */
function kdfRootKey(rootKey: Uint8Array, dhOutput: Uint8Array): { rootKey: Uint8Array; chainKey: Uint8Array } {
  const out = hkdfSha256(dhOutput, rootKey, ROOT_KDF_INFO, 64);
  return { rootKey: out.slice(0, 32), chainKey: out.slice(32, 64) };
}

/** KDF_CK: advances a symmetric chain by one step, yielding (nextChainKey, messageKey). */
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

export { x25519PublicFromPrivate };
