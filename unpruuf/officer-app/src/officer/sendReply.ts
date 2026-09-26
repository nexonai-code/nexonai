import { ratchetEncrypt } from "../crypto/doubleRatchet";
import { encryptForContact } from "../crypto/outerEnvelope";
import { padPacket } from "../wire/networkObfuscation";
import { encodeFrame, splitFrame } from "../wire/ratchetFrame";
import { encodeText } from "../wire/messagePayload";
import { RelayClient } from "../relay/relayClient";
import { CaseStore } from "../store/caseStore";
import { OfficerIdentity, pairSecret, wireTag } from "./officerIdentity";
import { ratchetStateFromSecrets, ratchetStateToSecrets } from "./ratchetBootstrap";

/**
 * Encrypts and sends an officer reply for one case — direct-relay equivalent of
 * `P2PNetworkManager.sendMessage` for a cross-platform contact. Always via the relay (this
 * product line is relay-mandatory by construction); a whistleblower reply is short plain text,
 * so this only ever produces a single (unchunked) frame in practice, but reuses `splitFrame`
 * for correctness if that ever changes.
 *
 * v1 scope note: pushes to `relay` (this process's one configured relay target) rather than to
 * whichever relay(s) the reporter's own `reporterRelayConnectionStrings` advertise — correct for
 * the single-shared-relay demo topology, not yet a real multi-relay router. See
 * officer-app/README.md's "known gaps".
 */
export async function sendReply(identity: OfficerIdentity, store: CaseStore, relay: RelayClient, caseId: string, text: string): Promise<boolean> {
  const secrets = store.getCaseSecrets(caseId);
  if (!secrets) throw new Error(`no such case: ${caseId}`);

  const ratchetState = ratchetStateFromSecrets(secrets.ratchet);
  const secret = pairSecret(identity.messageKey, secrets.reporterMessageKeyB64);
  const { header, ciphertext } = ratchetEncrypt(ratchetState, encodeText(text), secret);
  secrets.ratchet = ratchetStateToSecrets(ratchetState);

  const reporterKey = new Uint8Array(Buffer.from(secrets.reporterMessageKeyB64, "base64"));
  const tag = wireTag(secret, identity.userId, secrets.myGeneration);

  let anySucceeded = false;
  for (const frame of splitFrame(header, ciphertext)) {
    const framed = encodeFrame(frame);
    const outer = encryptForContact(framed, reporterKey);
    if (outer.length > 4096 - 8) throw new Error("encrypted frame too large for one packet");
    const packet = padPacket(outer);
    const ok = await relay.push(tag, Buffer.from(packet).toString("base64"));
    anySucceeded = anySucceeded || ok;
  }

  store.updateCaseSecrets(caseId, secrets);
  if (anySucceeded) store.appendMessage(caseId, "out", text);
  return anySucceeded;
}
