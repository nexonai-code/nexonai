import { compareUnsigned, hkdfSha256, x25519SharedSecret } from "../crypto/primitives";
import { generateRatchetKeyPair, initReceiver, initSender, RatchetState } from "../crypto/doubleRatchet";
import { CaseSecrets } from "../store/caseStore";
import { OfficerIdentity, pairSecret } from "./officerIdentity";

const X3DH_INFO = new TextEncoder().encode("unpruuf-x3dh-lite-v1");

/**
 * Direct port of `RatchetSessionManager.createSession`'s X3DH-lite bootstrap: both sides
 * already know both static X25519 identity keys (from the pairing payload each side scanned/
 * pasted), so there's no async "wait for the other side's first message" handshake — the
 * initial root key and sending/receiving role are derived synchronously, right here.
 */
export function createRatchetSession(
  myIdentity: OfficerIdentity,
  theirX25519PublicKeyB64: string,
  theirMessageKeyB64: string,
): RatchetState {
  const theirPub = new Uint8Array(Buffer.from(theirX25519PublicKeyB64, "base64"));
  const dh = x25519SharedSecret(myIdentity.x25519PrivateKey, theirPub);
  const secret = pairSecret(myIdentity.messageKey, theirMessageKeyB64);
  const sharedRootKey = hkdfSha256(dh, secret, X3DH_INFO, 32);

  const myKeyPair = { privateKey: myIdentity.x25519PrivateKey, publicKey: myIdentity.x25519PublicKey };
  // Same deterministic tie-break as every other platform: the smaller of the two raw public
  // keys is the sender-init side, so both peers compute the identical role without a round-trip.
  return compareUnsigned(myIdentity.x25519PublicKey, theirPub) < 0
    ? initSender(sharedRootKey, myKeyPair, theirPub)
    : initReceiver(sharedRootKey, myKeyPair);
}

export function ratchetStateToSecrets(state: RatchetState): CaseSecrets["ratchet"] {
  const skippedKeysB64: Record<string, string> = {};
  for (const [id, key] of state.skippedKeys) skippedKeysB64[id] = Buffer.from(key).toString("base64");
  return {
    dhsPrivateKeyB64: Buffer.from(state.dhsPrivateKey).toString("base64"),
    dhsPublicKeyB64: Buffer.from(state.dhsPublicKey).toString("base64"),
    dhrB64: state.dhr ? Buffer.from(state.dhr).toString("base64") : null,
    rootKeyB64: Buffer.from(state.rootKey).toString("base64"),
    sendChainKeyB64: state.sendChainKey ? Buffer.from(state.sendChainKey).toString("base64") : null,
    recvChainKeyB64: state.recvChainKey ? Buffer.from(state.recvChainKey).toString("base64") : null,
    sendCount: state.sendCount,
    recvCount: state.recvCount,
    previousChainLength: state.previousChainLength,
    skippedKeysB64,
  };
}

export function ratchetStateFromSecrets(s: CaseSecrets["ratchet"]): RatchetState {
  const skippedKeys = new Map<string, Uint8Array>();
  for (const [id, keyB64] of Object.entries(s.skippedKeysB64)) skippedKeys.set(id, new Uint8Array(Buffer.from(keyB64, "base64")));
  return {
    dhsPrivateKey: new Uint8Array(Buffer.from(s.dhsPrivateKeyB64, "base64")),
    dhsPublicKey: new Uint8Array(Buffer.from(s.dhsPublicKeyB64, "base64")),
    dhr: s.dhrB64 ? new Uint8Array(Buffer.from(s.dhrB64, "base64")) : null,
    rootKey: new Uint8Array(Buffer.from(s.rootKeyB64, "base64")),
    sendChainKey: s.sendChainKeyB64 ? new Uint8Array(Buffer.from(s.sendChainKeyB64, "base64")) : null,
    recvChainKey: s.recvChainKeyB64 ? new Uint8Array(Buffer.from(s.recvChainKeyB64, "base64")) : null,
    sendCount: s.sendCount,
    recvCount: s.recvCount,
    previousChainLength: s.previousChainLength,
    skippedKeys,
  };
}

export { generateRatchetKeyPair };
