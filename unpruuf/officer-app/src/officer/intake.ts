import { CrossPlatformPairingPayload, decodeCrossPlatformPayload, encodeCrossPlatformPayload, OFFICER_EDITION } from "../pairing/crossPlatformPairing";
import { generateCaseNumber } from "./caseIntake";
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
 * Creates (or finds) the case for a reporter's pairing payload — the one path behind both the
 * automatic intake (caseIntake.ts) and the manual paste fallback for older reporter apps.
 * A reporter who sends the same payload again (an intake retry) gets their existing case back.
 */
export function caseFromReporterPayload(
  identity: OfficerIdentity,
  store: CaseStore,
  payload: CrossPlatformPairingPayload,
  wireIdentity: string | null,
): { row: CaseRow; created: boolean } {
  if (payload.appEdition !== "whistleblower") {
    throw new InvalidPairingCodeError(
      `Acest cod provine dintr-o aplicație "${payload.appEdition}", nu din ediția Whistleblower — refuz să amestec liniile de produse.`,
    );
  }
  const existing = store.findCaseByReporter(payload.userId);
  if (existing) {
    if (wireIdentity) {
      const secrets = store.getCaseSecrets(existing.id);
      if (secrets && !secrets.reporterWireIdentity) {
        secrets.reporterWireIdentity = wireIdentity;
        store.updateCaseSecrets(existing.id, secrets);
      }
    }
    return { row: existing, created: false };
  }

  const ratchetState = createRatchetSession(identity, payload.x25519RatchetPublicKeyBase64, payload.messageKeyBase64);
  const secrets: CaseSecrets = {
    reporterUserId: payload.userId,
    reporterMessageKeyB64: payload.messageKeyBase64,
    reporterX25519PublicKeyB64: payload.x25519RatchetPublicKeyBase64,
    reporterRelayConnectionStrings: payload.relayConnectionStrings,
    reporterWireIdentity: wireIdentity,
    myGeneration: 0,
    theirGeneration: 0,
    ratchet: ratchetStateToSecrets(ratchetState),
  };
  return { row: store.createCase(secrets, generateCaseNumber()), created: true };
}

/**
 * Manual fallback: a reporter app from before the organisation-wide QR shows its own code, the
 * officer pastes it here. New apps send it automatically (see caseIntake.ts).
 */
export function addCaseFromPastedCode(identity: OfficerIdentity, store: CaseStore, pastedJson: string): CaseRow {
  const payload = decodeCrossPlatformPayload(pastedJson.trim());
  if (!payload) throw new InvalidPairingCodeError("Acest cod nu pare a fi un cod de împerechere unpruuf valid.");
  return caseFromReporterPayload(identity, store, payload, null).row;
}
