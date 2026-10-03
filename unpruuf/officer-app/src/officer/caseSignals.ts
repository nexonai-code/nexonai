import { RelayClient } from "../relay/relayClient";
import { CaseRow, CaseStore } from "../store/caseStore";
import { generateCaseNumber } from "./caseIntake";
import { OfficerIdentity } from "./officerIdentity";
import { SendResult, sendRatchetText } from "./sendRatchet";

/**
 * Case number + status, pushed to the reporter's app over the case's own Double Ratchet channel
 * — encrypted like every message, so the relay never learns that a case exists, let alone its
 * state. The reporter's app shows it in its "My case" screen and never renders it as a chat line.
 *
 * Wire format: "UNPRUUF_CASE_V1:" + JSON {"n": case number, "s": status, "o": opened at,
 * "a": acknowledgement due, "f": feedback due, "t": time of this update} (all times unix ms).
 * Statuses: "acknowledged" | "in_progress" | "closed" ("new" is never sent: the first signal IS
 * the acknowledgement of receipt required by Art. 9(1)(b) within 7 days).
 */
export const CASE_SIGNAL_PREFIX = "UNPRUUF_CASE_V1:";
/** The reporter's app sends this hidden first ratchet message right after pairing, so a
 *  session where the officer is the receiving side gets a sending chain immediately. */
export const CASE_HELLO_TEXT = "UNPRUUF_CASE_HELLO_V1";

export function caseSignalText(row: CaseRow, caseNumber: string, status: string, now: number = Date.now()): string {
  return CASE_SIGNAL_PREFIX + JSON.stringify({ n: caseNumber, s: status, o: row.openedAt, a: row.ackDueAt, f: row.feedbackDueAt, t: now });
}

export function ensureCaseNumber(store: CaseStore, row: CaseRow): string {
  if (row.caseNumber) return row.caseNumber;
  const n = generateCaseNumber();
  store.setCaseNumber(row.id, n);
  return n;
}

const STATUS_LABEL_RO: Record<string, string> = {
  acknowledged: "confirmat",
  in_progress: "în lucru",
  closed: "închis",
};

/**
 * Sends the current case number + status to the reporter. A brand-new case is acknowledged by
 * this very message (status moves new → acknowledged once it actually left). If the ratchet
 * can't send yet or the relay is down, the case is flagged and retried by the poll loop.
 */
export async function sendCaseUpdate(identity: OfficerIdentity, store: CaseStore, relay: RelayClient, caseId: string): Promise<SendResult> {
  const row = store.getCase(caseId);
  if (!row) throw new Error(`no such case: ${caseId}`);
  const caseNumber = ensureCaseNumber(store, row);
  const isReceipt = row.status === "new";
  const status = isReceipt ? "acknowledged" : row.status;
  const result = await sendRatchetText(identity, store, relay, caseId, caseSignalText(row, caseNumber, status));
  if (result === "sent") {
    store.setSignalPending(caseId, false);
    if (isReceipt) {
      store.setStatus(caseId, "acknowledged");
      store.appendMessage(caseId, "out", `[sistem] Confirmare de primire trimisă automat raportorului — nr. caz ${caseNumber}.`);
    } else {
      store.appendMessage(caseId, "out", `[sistem] Starea „${STATUS_LABEL_RO[status] ?? status}” a fost trimisă raportorului.`);
    }
  } else {
    store.setSignalPending(caseId, true);
  }
  return result;
}
