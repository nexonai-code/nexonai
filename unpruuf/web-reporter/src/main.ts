import { decodeCrossPlatformPayload, encodeCrossPlatformPayload, WHISTLEBLOWER_EDITION } from "./crossPlatformPairing";
import { createRatchetSession, generateRatchetKeyPair, Identity, pairSecret, ratchetStateFromJson, ratchetStateToJson, wireTag } from "./ratchetBootstrap";
import { ratchetDecrypt, ratchetEncrypt, RatchetState } from "./doubleRatchet";
import { decryptWithKey, encryptForContact } from "./primitives";
import { padPacket, unpadPacket } from "./networkObfuscation";
import { decodeFrame, encodeFrame, splitFrame } from "./ratchetFrame";
import { decodeMessagePayload, encodeText } from "./messagePayload";
import { RelayClient } from "./relayClient";
import { base64ToBytes, bytesToBase64 } from "./base64";
import {
  CASE_HELLO_TEXT, CaseInfo, INTAKE_GIVE_UP_MS, INTAKE_RETRY_MS, intakeHour, intakeTag, parseCaseSignal, sealIntake,
} from "./caseIntake";

const LS_IDENTITY = "unpruuf_reporter_identity";
const LS_CASE = "unpruuf_reporter_case";
const LS_MESSAGES = "unpruuf_reporter_messages";
const LS_RELAY_URL = "unpruuf_reporter_relay_url";
const LS_RELAY_TOKEN = "unpruuf_reporter_relay_token";

interface CaseState {
  /** The officer's relay connection string from the QR (used for the intake). */
  officerRelay?: string;
  /** This browser's own pairing code — sent to the officer automatically (intake). */
  myPairingJson?: string;
  intakeStartedAt?: number | null;
  intakeLastSentAt?: number | null;
  caseInfo?: CaseInfo | null;
  officerUserId: string;
  officerMessageKeyB64: string;
  officerX25519PubB64: string;
  myGeneration: number;
  theirGeneration: number;
  ratchetStateJson: string;
}

interface StoredMessage { direction: "in" | "out"; text: string; ts: number }

function loadIdentity(): Identity | null {
  const raw = localStorage.getItem(LS_IDENTITY);
  if (!raw) return null;
  const s = JSON.parse(raw);
  return {
    userId: s.userId,
    messageKey: base64ToBytes(s.messageKeyB64),
    x25519PrivateKey: base64ToBytes(s.x25519PrivB64),
    x25519PublicKey: base64ToBytes(s.x25519PubB64),
  };
}

function saveIdentity(identity: Identity): void {
  localStorage.setItem(LS_IDENTITY, JSON.stringify({
    userId: identity.userId,
    messageKeyB64: bytesToBase64(identity.messageKey),
    x25519PrivB64: bytesToBase64(identity.x25519PrivateKey),
    x25519PubB64: bytesToBase64(identity.x25519PublicKey),
  }));
}

function ensureIdentity(): Identity {
  const existing = loadIdentity();
  if (existing) return existing;
  const messageKey = crypto.getRandomValues(new Uint8Array(32));
  const { privateKey, publicKey } = generateRatchetKeyPair();
  const identity: Identity = { userId: crypto.randomUUID(), messageKey, x25519PrivateKey: privateKey, x25519PublicKey: publicKey };
  saveIdentity(identity);
  return identity;
}

function loadCase(): CaseState | null {
  const raw = localStorage.getItem(LS_CASE);
  return raw ? JSON.parse(raw) : null;
}
function saveCase(c: CaseState): void { localStorage.setItem(LS_CASE, JSON.stringify(c)); }

function loadMessages(): StoredMessage[] {
  const raw = localStorage.getItem(LS_MESSAGES);
  return raw ? JSON.parse(raw) : [];
}
function saveMessages(msgs: StoredMessage[]): void { localStorage.setItem(LS_MESSAGES, JSON.stringify(msgs)); }

function getRelayUrl(): string | null { return localStorage.getItem(LS_RELAY_URL); }
function setRelayUrl(url: string): void { localStorage.setItem(LS_RELAY_URL, url); }

// ---- DOM wiring -------------------------------------------------------------

const setupView = document.getElementById("setupView") as HTMLElement;
const chatView = document.getElementById("chatView") as HTMLElement;
const officerCodeInput = document.getElementById("officerCodeInput") as HTMLTextAreaElement;
const relayUrlInput = document.getElementById("relayUrlInput") as HTMLInputElement;
const startBtn = document.getElementById("startBtn") as HTMLButtonElement;
const setupError = document.getElementById("setupError") as HTMLElement;
const myCodeBox = document.getElementById("myCodeBox") as HTMLTextAreaElement;
const thread = document.getElementById("thread") as HTMLElement;
const composeInput = document.getElementById("composeInput") as HTMLTextAreaElement;
const sendBtn = document.getElementById("sendBtn") as HTMLButtonElement;
const sendError = document.getElementById("sendError") as HTMLElement;
const resetBtn = document.getElementById("resetBtn") as HTMLButtonElement;
const casePanel = document.getElementById("casePanel") as HTMLElement;

let identity: Identity;
let caseState: CaseState;
let relay: RelayClient;

const STATUS_RO: Record<string, string> = { acknowledged: "Primită și confirmată", in_progress: "În analiză", closed: "Închis" };
const fmtDay = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString("ro-RO") : "—");

function renderCase(): void {
  const info = caseState?.caseInfo;
  if (!info) {
    casePanel.innerHTML = `<h2>Cazul meu</h2><p class="hint"><b>Sesizarea este în curs de transmitere.</b> Imediat ce oficiul de raportare confirmă primirea, numărul cazului apare aici. Nu trebuie să faci nimic.</p>`;
    return;
  }
  const steps = ["Primită", "Analiză", "Închis"];
  const current = info.status === "closed" ? 2 : info.status === "in_progress" ? 1 : 0;
  casePanel.innerHTML = `
    <h2>Cazul meu</h2>
    <div class="case-number">${info.number}</div>
    <div class="case-status">${STATUS_RO[info.status]}</div>
    <ol class="case-steps">${steps.map((s, i) => `<li class="${i <= current ? "done" : ""}">${s}</li>`).join("")}</ol>
    <p class="hint">Primită la ${fmtDay(info.openedAt)}${info.status !== "closed" ? ` · răspuns până la ${fmtDay(info.feedbackDueAt)}` : ""} · ultima actualizare ${new Date(info.updatedAt).toLocaleString("ro-RO")}</p>`;
}

/** Sends this browser's pairing code to the organisation's letterbox until the receipt arrives. */
async function sendIntakeIfDue(): Promise<void> {
  if (!caseState || caseState.caseInfo || !caseState.intakeStartedAt || !caseState.myPairingJson) return;
  const now = Date.now();
  if (now - caseState.intakeStartedAt > INTAKE_GIVE_UP_MS) return;
  if (caseState.intakeLastSentAt && now - caseState.intakeLastSentAt < INTAKE_RETRY_MS) return;
  const sealed = sealIntake(base64ToBytes(caseState.officerX25519PubB64), base64ToBytes(caseState.officerMessageKeyB64), caseState.myPairingJson);
  const ok = await relay.push(intakeTag(base64ToBytes(caseState.officerMessageKeyB64), intakeHour(now)), bytesToBase64(padPacket(sealed)));
  if (ok) {
    caseState.intakeLastSentAt = now;
    saveCase(caseState);
  }
}

/** Hidden first ratchet message — lets the officer answer at once when it is the receiving side. */
function trySendHello(): void {
  const state: RatchetState = ratchetStateFromJson(caseState.ratchetStateJson);
  const secret = pairSecret(identity.messageKey, caseState.officerMessageKeyB64);
  let enc;
  try {
    enc = ratchetEncrypt(state, encodeText(CASE_HELLO_TEXT), secret);
  } catch {
    return; // we are the receiving side — the officer's receipt opens our chain
  }
  caseState.ratchetStateJson = ratchetStateToJson(state);
  saveCase(caseState);
  const tag = wireTag(secret, identity.userId, caseState.myGeneration);
  const officerKeyBytes = base64ToBytes(caseState.officerMessageKeyB64);
  for (const frame of splitFrame(enc.header, enc.ciphertext)) {
    void relay.push(tag, bytesToBase64(padPacket(encryptForContact(encodeFrame(frame), officerKeyBytes))));
  }
}

function render(): void {
  renderCase();
  const msgs = loadMessages();
  thread.innerHTML = "";
  for (const m of msgs) {
    const div = document.createElement("div");
    div.className = `msg ${m.direction}`;
    const textDiv = document.createElement("div");
    textDiv.textContent = m.text;
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${m.direction === "in" ? "ofițer" : "tu"} · ${new Date(m.ts).toLocaleTimeString("ro-RO")}`;
    div.appendChild(textDiv);
    div.appendChild(meta);
    thread.appendChild(div);
  }
  thread.scrollTop = thread.scrollHeight;
}

async function sendReport(text: string): Promise<void> {
  const state: RatchetState = ratchetStateFromJson(caseState.ratchetStateJson);
  const secret = pairSecret(identity.messageKey, caseState.officerMessageKeyB64);
  let encrypted;
  try {
    encrypted = ratchetEncrypt(state, encodeText(text), secret);
  } catch {
    throw new Error("Canalul se deschide imediat ce oficiul confirmă primirea (de obicei în câteva secunde) — încearcă din nou puțin mai târziu.");
  }
  const { header, ciphertext } = encrypted;
  caseState.ratchetStateJson = ratchetStateToJson(state);

  const officerKeyBytes = base64ToBytes(caseState.officerMessageKeyB64);
  const tag = wireTag(secret, identity.userId, caseState.myGeneration);
  let anyOk = false;
  for (const frame of splitFrame(header, ciphertext)) {
    const framed = encodeFrame(frame);
    const outer = encryptForContact(framed, officerKeyBytes);
    const packet = padPacket(outer);
    const ok = await relay.push(tag, bytesToBase64(packet));
    anyOk = anyOk || ok;
  }
  saveCase(caseState);
  if (anyOk) {
    const msgs = loadMessages();
    msgs.push({ direction: "out", text, ts: Date.now() });
    saveMessages(msgs);
    render();
  } else {
    throw new Error("Releul nu a acceptat mesajul — verifică adresa releului și încearcă din nou.");
  }
}

const chunkBuffers = new Map<string, { totalChunks: number; header: import("./ratchetHeader").RatchetHeader; pieces: Map<number, Uint8Array> }>();

async function pollOnce(): Promise<void> {
  const secret = pairSecret(identity.messageKey, caseState.officerMessageKeyB64);
  const tags: string[] = [];
  for (let g = Math.max(0, caseState.theirGeneration - 1); g <= caseState.theirGeneration + 3; g++) {
    tags.push(wireTag(secret, caseState.officerUserId, g));
  }
  const blobsByTag = await relay.fetchMany(tags);
  const state: RatchetState = ratchetStateFromJson(caseState.ratchetStateJson);
  let changed = false;

  for (const blobs of Object.values(blobsByTag)) {
    for (const blobB64 of blobs) {
      try {
        const packet = unpadPacket(base64ToBytes(blobB64));
        const framed = decryptWithKey(packet, identity.messageKey);
        const frame = decodeFrame(framed);
        if (!frame) continue;

        let header;
        let ciphertext: Uint8Array;
        if (frame.kind === "single") {
          header = frame.header;
          ciphertext = frame.ciphertext;
        } else if (frame.kind === "chunkStart") {
          chunkBuffers.set("x", { totalChunks: frame.totalChunks, header: frame.header, pieces: new Map([[0, frame.piece]]) });
          continue;
        } else {
          const buf = chunkBuffers.get("x");
          if (!buf) continue;
          buf.pieces.set(frame.index, frame.piece);
          if (buf.pieces.size < buf.totalChunks) continue;
          chunkBuffers.delete("x");
          header = buf.header;
          const total = Array.from(buf.pieces.values()).reduce((n, p) => n + p.length, 0);
          ciphertext = new Uint8Array(total);
          let off = 0;
          for (let i = 0; i < buf.totalChunks; i++) { const p = buf.pieces.get(i)!; ciphertext.set(p, off); off += p.length; }
        }

        const plaintext = ratchetDecrypt(state, header, ciphertext, secret);
        changed = true;
        const content = decodeMessagePayload(plaintext);
        if (content?.kind === "text" && content.text === CASE_HELLO_TEXT) continue;
        const caseInfo = content?.kind === "text" ? parseCaseSignal(content.text) : null;
        if (caseInfo) {
          caseState.caseInfo = caseInfo;
          caseState.intakeStartedAt = null;
          continue;
        }
        if (content?.kind === "text") {
          const msgs = loadMessages();
          msgs.push({ direction: "in", text: content.text, ts: Date.now() });
          saveMessages(msgs);
        }
      } catch (err) {
        console.error("[poll] failed to ingest a packet:", err);
      }
    }
  }

  if (changed) {
    caseState.ratchetStateJson = ratchetStateToJson(state);
    saveCase(caseState);
    render();
  }
}

function startPolling(): void {
  const tick = () =>
    pollOnce()
      .then(() => sendIntakeIfDue())
      .catch((err) => console.error("[poll] round failed:", err));
  tick();
  setInterval(tick, 6000);
}

function enterChat(): void {
  setupView.classList.add("hidden");
  chatView.classList.remove("hidden");
  render();
  startPolling();
}

startBtn.addEventListener("click", () => {
  setupError.textContent = "";
  const officerJson = officerCodeInput.value.trim();
  const relayUrl = relayUrlInput.value.trim().replace(/\/+$/, "");
  if (!officerJson || !relayUrl) {
    setupError.textContent = "Sunt necesare atât codul ofițerului, cât și adresa releului.";
    return;
  }
  const payload = decodeCrossPlatformPayload(officerJson);
  if (!payload) {
    setupError.textContent = "Acesta nu pare a fi un cod de împerechere unpruuf valid.";
    return;
  }
  if (payload.appEdition !== "officer") {
    setupError.textContent = `Acest cod provine dintr-o aplicație "${payload.appEdition}", nu din panoul unui ofițer de conformitate.`;
    return;
  }
  const officerConn = payload.relayConnectionStrings[0];
  const parsed = officerConn?.split(":");
  const authToken = parsed && parsed.length >= 4 ? parsed[parsed.length - 1] : null;
  if (!authToken) {
    setupError.textContent = "Codul ofițerului nu conține un token de releu utilizabil.";
    return;
  }

  identity = ensureIdentity();
  setRelayUrl(relayUrl);
  localStorage.setItem(LS_RELAY_TOKEN, authToken);
  relay = new RelayClient({ baseUrl: relayUrl, authToken });

  const ratchetState = createRatchetSession(identity, payload.x25519RatchetPublicKeyBase64, payload.messageKeyBase64);
  caseState = {
    officerRelay: officerConn,
    intakeStartedAt: Date.now(),
    intakeLastSentAt: null,
    caseInfo: null,
    officerUserId: payload.userId,
    officerMessageKeyB64: payload.messageKeyBase64,
    officerX25519PubB64: payload.x25519RatchetPublicKeyBase64,
    myGeneration: 0,
    theirGeneration: 0,
    ratchetStateJson: ratchetStateToJson(ratchetState),
  };
  saveCase(caseState);

  const myCodeJson = encodeCrossPlatformPayload({
    version: 2,
    userId: identity.userId,
    messageKeyBase64: bytesToBase64(identity.messageKey),
    x25519RatchetPublicKeyBase64: bytesToBase64(identity.x25519PublicKey),
    relayConnectionStrings: [officerConn],
    appEdition: WHISTLEBLOWER_EDITION,
  });
  myCodeBox.value = myCodeJson;
  caseState.myPairingJson = myCodeJson;
  saveCase(caseState);
  trySendHello();

  enterChat();
});

sendBtn.addEventListener("click", async () => {
  sendError.textContent = "";
  const text = composeInput.value.trim();
  if (!text) return;
  sendBtn.disabled = true;
  try {
    await sendReport(text);
    composeInput.value = "";
  } catch (err) {
    sendError.textContent = err instanceof Error ? err.message : String(err);
  } finally {
    sendBtn.disabled = false;
  }
});

resetBtn.addEventListener("click", () => {
  if (!confirm("Aceasta șterge identitatea locală, cazul și istoricul mesajelor din acest browser. Vei avea nevoie de un cod de împerechere nou ca să reiei. Continui?")) return;
  localStorage.removeItem(LS_IDENTITY);
  localStorage.removeItem(LS_CASE);
  localStorage.removeItem(LS_MESSAGES);
  location.reload();
});

// ---- Boot --------------------------------------------------------------------

(function boot() {
  const existingCase = loadCase();
  const existingIdentity = loadIdentity();
  const existingRelayUrl = getRelayUrl();
  const existingToken = localStorage.getItem(LS_RELAY_TOKEN);
  if (existingCase && existingIdentity && existingRelayUrl && existingToken) {
    identity = existingIdentity;
    caseState = existingCase;
    relay = new RelayClient({ baseUrl: existingRelayUrl, authToken: existingToken });
    enterChat();
  }
})();
