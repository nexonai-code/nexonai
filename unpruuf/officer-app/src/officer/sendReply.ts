import { RelayClient } from "../relay/relayClient";
import { CaseStore } from "../store/caseStore";
import { OfficerIdentity } from "./officerIdentity";
import { SendResult, sendRatchetText } from "./sendRatchet";

/**
 * Sends an officer reply for one case and records it in the case thread once the relay took it.
 * Always via the relay (this product line is relay-mandatory by construction).
 *
 * v1 scope note: pushes to `relay` (this process's one configured relay target) rather than to
 * whichever relay(s) the reporter's own `reporterRelayConnectionStrings` advertise — correct for
 * the single-shared-relay topology, not yet a real multi-relay router. See officer-app/README.md.
 */
export async function sendReply(identity: OfficerIdentity, store: CaseStore, relay: RelayClient, caseId: string, text: string): Promise<SendResult> {
  const result = await sendRatchetText(identity, store, relay, caseId, text);
  if (result === "sent") store.appendMessage(caseId, "out", text);
  return result;
}
