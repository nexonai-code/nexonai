import { compareUnsigned, hkdfSha256, hmacSha256, sha256Digest, x25519SharedSecret } from "./primitives";
import { generateRatchetKeyPair, initReceiver, initSender, RatchetState } from "./doubleRatchet";
import { base64ToBytes, bytesToBase64 } from "./base64";

const X3DH_INFO = new TextEncoder().encode("unpruuf-x3dh-lite-v1");

export interface Identity {
  userId: string;
  messageKey: Uint8Array;
  x25519PrivateKey: Uint8Array;
  x25519PublicKey: Uint8Array;
}

/** Direct port of officer-app's pairSecret/wireTag — see IdentityManager.pairSecret/myWireId. */
export function pairSecret(myMessageKey: Uint8Array, theirMessageKeyB64: string): Uint8Array {
  const other = base64ToBytes(theirMessageKeyB64);
  const [a, b] = compareUnsigned(myMessageKey, other) <= 0 ? [myMessageKey, other] : [other, myMessageKey];
  return sha256Digest(a, b);
}

export function wireTag(secret: Uint8Array, identity: string, generation: number): string {
  return bytesToBase64(hmacSha256(secret, new TextEncoder().encode(`${identity}:${generation}`)));
}

/** Same X3DH-lite bootstrap as officer-app/src/officer/ratchetBootstrap.ts's createRatchetSession. */
export function createRatchetSession(myIdentity: Identity, theirX25519PublicKeyB64: string, theirMessageKeyB64: string): RatchetState {
  const theirPub = base64ToBytes(theirX25519PublicKeyB64);
  const dh = x25519SharedSecret(myIdentity.x25519PrivateKey, theirPub);
  const secret = pairSecret(myIdentity.messageKey, theirMessageKeyB64);
  const sharedRootKey = hkdfSha256(dh, secret, X3DH_INFO, 32);
  const myKeyPair = { privateKey: myIdentity.x25519PrivateKey, publicKey: myIdentity.x25519PublicKey };
  return compareUnsigned(myIdentity.x25519PublicKey, theirPub) < 0
    ? initSender(sharedRootKey, myKeyPair, theirPub)
    : initReceiver(sharedRootKey, myKeyPair);
}

export function ratchetStateToJson(state: RatchetState): string {
  const skippedKeysB64: Record<string, string> = {};
  for (const [id, key] of state.skippedKeys) skippedKeysB64[id] = bytesToBase64(key);
  return JSON.stringify({
    dhsPrivateKeyB64: bytesToBase64(state.dhsPrivateKey),
    dhsPublicKeyB64: bytesToBase64(state.dhsPublicKey),
    dhrB64: state.dhr ? bytesToBase64(state.dhr) : null,
    rootKeyB64: bytesToBase64(state.rootKey),
    sendChainKeyB64: state.sendChainKey ? bytesToBase64(state.sendChainKey) : null,
    recvChainKeyB64: state.recvChainKey ? bytesToBase64(state.recvChainKey) : null,
    sendCount: state.sendCount,
    recvCount: state.recvCount,
    previousChainLength: state.previousChainLength,
    skippedKeysB64,
  });
}

export function ratchetStateFromJson(json: string): RatchetState {
  const s = JSON.parse(json);
  const skippedKeys = new Map<string, Uint8Array>();
  for (const [id, keyB64] of Object.entries(s.skippedKeysB64 as Record<string, string>)) skippedKeys.set(id, base64ToBytes(keyB64));
  return {
    dhsPrivateKey: base64ToBytes(s.dhsPrivateKeyB64),
    dhsPublicKey: base64ToBytes(s.dhsPublicKeyB64),
    dhr: s.dhrB64 ? base64ToBytes(s.dhrB64) : null,
    rootKey: base64ToBytes(s.rootKeyB64),
    sendChainKey: s.sendChainKeyB64 ? base64ToBytes(s.sendChainKeyB64) : null,
    recvChainKey: s.recvChainKeyB64 ? base64ToBytes(s.recvChainKeyB64) : null,
    sendCount: s.sendCount,
    recvCount: s.recvCount,
    previousChainLength: s.previousChainLength,
    skippedKeys,
  };
}

export { generateRatchetKeyPair };
