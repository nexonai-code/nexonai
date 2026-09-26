import { ratchetDecrypt } from "../crypto/doubleRatchet";
import { decryptWithKey } from "../crypto/outerEnvelope";
import { unpadPacket } from "../wire/networkObfuscation";
import { decodeFrame } from "../wire/ratchetFrame";
import { decodeMessagePayload } from "../wire/messagePayload";
import { RelayClient } from "../relay/relayClient";
import { CaseStore } from "../store/caseStore";
import { OfficerIdentity, pairSecret, wireTag } from "./officerIdentity";
import { ratchetStateFromSecrets, ratchetStateToSecrets } from "./ratchetBootstrap";
import {
  DELETE_CONTACT_SIGNAL_TEXT,
  NEW_IDENTITY_PREFIX,
  REVOKE_SIGNAL_TEXT,
  WECHSEL_PREFIX,
} from "./controlSignals";

/**
 * The officer-app's core loop: figure out every wire tag worth polling for right now, fetch
 * them all in one relay round-trip, decrypt whatever comes back, and file it into the right
 * case. Mirrors `P2PNetworkManager.pollRelayOnce()`'s shape (fetchMany-batched, per-contact
 * identity+generation tolerance window) but without Android's LAN/Tor-direct branches — every
 * whistleblower contact is relay-mandatory by construction (see RelayManager.isMandatory()).
 *
 * Deliberately does NOT delete case data on a REVOKE/DELETE_CONTACT signal from the reporter —
 * see controlSignals.ts's doc comment: the officer's case record has to survive the reporter
 * clearing their own local chat, or Art. 9's retention requirement would be defeated by the
 * exact privacy feature (RAM-only messages) this whole architecture is built on. Multi-chunk
 * transfers (a reporter attaching a photo/file) are reassembled in an in-memory buffer that
 * does NOT survive a restart — acceptable for a v1 "basic skeleton" per this session's scope;
 * see officer-app/README.md.
 */
interface ChunkBuffer {
  totalChunks: number;
  header: import("../crypto/ratchetHeader").RatchetHeader;
  pieces: Map<number, Uint8Array>;
}

export class PollAndIngestLoop {
  private chunkBuffers = new Map<string, ChunkBuffer>();

  constructor(
    private identity: OfficerIdentity,
    private store: CaseStore,
    private relay: RelayClient,
    private onCaseUpdated: (caseId: string) => void = () => {},
  ) {}

  /** Runs one poll round. Call this on an interval (see officer-app/src/index.ts). */
  async pollOnce(waitMs = 0): Promise<void> {
    const candidates = this.store.allPollCandidates();
    if (candidates.length === 0) return;

    // Group candidates by case so each case's secrets are decrypted at most once per round.
    const byCase = new Map<string, { caseId: string; identity: string; generation: number }[]>();
    for (const c of candidates) {
      const list = byCase.get(c.caseId) ?? [];
      list.push(c);
      byCase.set(c.caseId, list);
    }

    const tagToCandidate = new Map<string, { caseId: string; identity: string; generation: number }>();
    for (const [caseId, list] of byCase) {
      const secrets = this.store.getCaseSecrets(caseId);
      if (!secrets) continue;
      const secret = pairSecret(this.identity.messageKey, secrets.reporterMessageKeyB64);
      for (const c of list) {
        const tag = wireTag(secret, c.identity, c.generation);
        tagToCandidate.set(tag, c);
      }
    }

    const tags = [...tagToCandidate.keys()];
    if (tags.length === 0) return;
    const blobsByTag = await this.relay.fetchMany(tags, waitMs);

    for (const [tag, blobs] of Object.entries(blobsByTag)) {
      if (blobs.length === 0) continue;
      const candidate = tagToCandidate.get(tag);
      if (!candidate) continue;
      for (const blobB64 of blobs) {
        try {
          this.ingestOnePacket(candidate.caseId, blobB64);
        } catch (err) {
          console.error(`[poll] failed to ingest a packet for case ${candidate.caseId}:`, err);
        }
      }
    }
  }

  private ingestOnePacket(caseId: string, blobB64: string): void {
    const secrets = this.store.getCaseSecrets(caseId);
    if (!secrets) return;

    const packet = unpadPacket(new Uint8Array(Buffer.from(blobB64, "base64")));
    const framed = decryptWithKey(packet, this.identity.messageKey);
    const frame = decodeFrame(framed);
    if (!frame) return;

    let header: import("../crypto/ratchetHeader").RatchetHeader;
    let ciphertext: Uint8Array;
    if (frame.kind === "single") {
      header = frame.header;
      ciphertext = frame.ciphertext;
    } else if (frame.kind === "chunkStart") {
      this.chunkBuffers.set(caseId, {
        totalChunks: frame.totalChunks,
        header: frame.header,
        pieces: new Map([[0, frame.piece]]),
      });
      return; // wait for the rest of the train
    } else {
      const buf = this.chunkBuffers.get(caseId);
      if (!buf) return; // a ChunkCont with no ChunkStart seen yet this session — dropped, not a crash
      buf.pieces.set(frame.index, frame.piece);
      if (buf.pieces.size < buf.totalChunks) return; // still waiting on more pieces
      this.chunkBuffers.delete(caseId);
      header = buf.header;
      ciphertext = concatPieces(buf.pieces, buf.totalChunks);
    }

    const ratchetState = ratchetStateFromSecrets(secrets.ratchet);
    const secret = pairSecret(this.identity.messageKey, secrets.reporterMessageKeyB64);
    const plaintext = ratchetDecrypt(ratchetState, header, ciphertext, secret);
    secrets.ratchet = ratchetStateToSecrets(ratchetState);

    if (bytesEqualAscii(plaintext, REVOKE_SIGNAL_TEXT) || bytesEqualAscii(plaintext, DELETE_CONTACT_SIGNAL_TEXT)) {
      // Recorded, never acted on destructively — see this file's class doc comment.
      this.store.appendMessage(caseId, "in", "[system] reporter's app sent a local revoke/delete signal — case record kept.");
      this.store.updateCaseSecrets(caseId, secrets);
      this.onCaseUpdated(caseId);
      return;
    }

    const content = decodeMessagePayload(plaintext);
    if (!content) {
      this.store.updateCaseSecrets(caseId, secrets);
      return;
    }

    if (content.kind === "text" && content.text.startsWith(NEW_IDENTITY_PREFIX)) {
      secrets.reporterWireIdentity = content.text.slice(NEW_IDENTITY_PREFIX.length);
      this.store.updateCaseSecrets(caseId, secrets);
      this.onCaseUpdated(caseId);
      return;
    }
    if (content.kind === "text" && content.text.startsWith(WECHSEL_PREFIX)) {
      const rest = content.text.slice(WECHSEL_PREFIX.length);
      const [genStr, relayString] = splitOnce(rest, ":");
      const gen = Number.parseInt(genStr, 10);
      if (Number.isFinite(gen)) secrets.theirGeneration = Math.max(secrets.theirGeneration, gen);
      if (relayString) secrets.reporterRelayConnectionStrings = [relayString];
      this.store.updateCaseSecrets(caseId, secrets);
      this.onCaseUpdated(caseId);
      return;
    }

    if (content.kind === "text") {
      this.store.appendMessage(caseId, "in", content.text);
    } else {
      this.store.appendMessage(caseId, "in", `[attachment: ${content.name}, ${content.bytes.length} bytes — not rendered in v1]`);
    }
    this.store.updateCaseSecrets(caseId, secrets);
    this.onCaseUpdated(caseId);
  }

}

/** Concatenates a completed chunk train's pieces in index order (0 = ChunkStart's own piece). */
function concatPieces(pieces: Map<number, Uint8Array>, totalChunks: number): Uint8Array {
  const total = Array.from(pieces.values()).reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (let i = 0; i < totalChunks; i++) {
    const piece = pieces.get(i);
    if (!piece) throw new Error(`missing chunk ${i} of ${totalChunks}`);
    out.set(piece, off);
    off += piece.length;
  }
  return out;
}

function bytesEqualAscii(a: Uint8Array, ascii: string): boolean {
  const b = new TextEncoder().encode(ascii);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function splitOnce(s: string, sep: string): [string, string] {
  const idx = s.indexOf(sep);
  if (idx < 0) return [s, ""];
  return [s.slice(0, idx), s.slice(idx + 1)];
}
