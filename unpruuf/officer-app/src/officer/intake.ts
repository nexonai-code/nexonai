import { decodeCrossPlatformPayload, encodeCrossPlatformPayload, OFFICER_EDITION } from "../pairing/crossPlatformPairing";
import { CaseRow, CaseSecrets, CaseStore } from "../store/caseStore";
import { OfficerIdentity } from "./officerIdentity";
import { createRatchetSession, ratchetStateToSecrets } from "./ratchetBootstrap";

export class InvalidPairingCodeError extends Error {}

/**
 * The officer's own pairing payload — what the dashboard renders as a QR code / copyable text
 * for a reporter's Android app to scan. `e: "officer"` is what lets a scanning Whistleblower-
 * edition phone recognize this as a valid pairing target (see AppEdition.kt's `canAdd` rule).
 */
export function myPairingPayloadJson(identity: OfficerIdentity, advertisedRelayConnectionString: string): string {
  return encodeCrossPlatformPayload({
    version: 2,
    userId: identity.userId,
    messageKeyBase64: Buffer.from(identity.messageKey).toString("base64"),
    x25519RatchetPublicKeyBase64: Buffer.from(identity.x25519PublicKey).toString("base64"),
    relayConnectionStrings: [advertisedRelayConnectionString],
    appEdition: OFFICER_EDITION,
  });
}

/**
 * Completes pairing from a reporter's pasted code (see QrPairScreen.kt's whistleblower-enabled
 * copy/paste flow — the reporter has no way to be scanned back by a laptop dashboard with no
 * camera, so this manual step replaces the second half of the app's normal mutual-QR ceremony).
 * Creates a new case with an empty thread — the actual report text arrives moments later via
 * the poll loop, exactly like every later message in the conversation.
 */
export function addCaseFromPastedCode(identity: OfficerIdentity, store: CaseStore, pastedJson: string): CaseRow {
  const payload = decodeCrossPlatformPayload(pastedJson.trim());
  if (!payload) throw new InvalidPairingCodeError("That doesn't look like a valid unpruuf pairing code.");
  if (payload.appEdition !== "whistleblower") {
    throw new InvalidPairingCodeError(
      `This code is from a "${payload.appEdition}" app, not the Whistleblower edition — refusing to mix product lines.`,
    );
  }

  const ratchetState = createRatchetSession(identity, payload.x25519RatchetPublicKeyBase64, payload.messageKeyBase64);
  const secrets: CaseSecrets = {
    reporterUserId: payload.userId,
    reporterMessageKeyB64: payload.messageKeyBase64,
    reporterX25519PublicKeyB64: payload.x25519RatchetPublicKeyBase64,
    reporterRelayConnectionStrings: payload.relayConnectionStrings,
    reporterWireIdentity: null,
    myGeneration: 0,
    theirGeneration: 0,
    ratchet: ratchetStateToSecrets(ratchetState),
  };
  return store.createCase(secrets);
}
