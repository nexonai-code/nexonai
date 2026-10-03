import { ratchetEncrypt, RatchetError } from "../crypto/doubleRatchet";
import { encryptForContact } from "../crypto/outerEnvelope";
import { padPacket, PACKET_SIZE } from "../wire/networkObfuscation";
import { encodeFrame, splitFrame } from "../wire/ratchetFrame";
import { encodeText } from "../wire/messagePayload";
import { RelayClient } from "../relay/relayClient";
import { CaseStore } from "../store/caseStore";
import { OfficerIdentity, pairSecret, wireTag } from "./officerIdentity";
import { ratchetStateFromSecrets, ratchetStateToSecrets } from "./ratchetBootstrap";

export type SendResult = "sent" | "no-chain" | "failed";

/**
 * Encrypts one text for a case over its Double Ratchet and pushes it to the relay. The new
 * ratchet state is saved BEFORE the network call: the poll loop may ingest a packet for the
 * same case while the push is in flight, and saving afterwards would overwrite that state.
 *
 * "no-chain" = this side can't send yet (it is the receiving side of a fresh session and hasn't
 * received anything) — nothing was changed; the caller retries after the first inbound message.
 */
export async function sendRatchetText(
  identity: OfficerIdentity,
  store: CaseStore,
  relay: RelayClient,
  caseId: string,
  text: string,
): Promise<SendResult> {
  const secrets = store.getCaseSecrets(caseId);
  if (!secrets) throw new Error(`no such case: ${caseId}`);

  const ratchetState = ratchetStateFromSecrets(secrets.ratchet);
  const secret = pairSecret(identity.messageKey, secrets.reporterMessageKeyB64);
  let encrypted;
  try {
    encrypted = ratchetEncrypt(ratchetState, encodeText(text), secret);
  } catch (err) {
    if (err instanceof RatchetError) return "no-chain";
    throw err;
  }
  secrets.ratchet = ratchetStateToSecrets(ratchetState);
  store.updateCaseSecrets(caseId, secrets);

  const reporterKey = new Uint8Array(Buffer.from(secrets.reporterMessageKeyB64, "base64"));
  const tag = wireTag(secret, identity.userId, secrets.myGeneration);

  let anySucceeded = false;
  for (const frame of splitFrame(encrypted.header, encrypted.ciphertext)) {
    const outer = encryptForContact(encodeFrame(frame), reporterKey);
    if (outer.length > PACKET_SIZE - 8) throw new Error("encrypted frame too large for one packet");
    const ok = await relay.push(tag, Buffer.from(padPacket(outer)).toString("base64")).catch(() => false);
    anySucceeded = anySucceeded || ok;
  }
  return anySucceeded ? "sent" : "failed";
}
