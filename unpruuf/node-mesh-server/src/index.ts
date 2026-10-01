import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Server } from "http";
import QRCode from "qrcode";
import { createApp } from "./app";
import { createAdminApp, ownerConnectionString } from "./admin/adminApp";
import { NodeStore } from "./store/nodeStore";
import {
  ADMIN_PORT, DATA_DIR, DB_PATH, IDENTITY_PATH, NODE_COUNT, NODE_PROFILE, NODE_SLOT, PORT, POW,
  RESET_INTERVAL_MS, RESET_OFFSET_MS, SWEEP_INTERVAL_MS, TOR_BIN_DIR, TOR_ENABLED,
} from "./config";
import { createEphemeralIdentity, loadOrCreateIdentity, NodeIdentity, regenerateSecret, saveIdentity } from "./nodeIdentity";
import { NodeOnionService } from "./tor/onionService";

// Temp Node (NODE_MESH_SPEC.md §7): identity, onion key and message store live in memory only;
// Tor's own working files go to a throwaway temp folder that is deleted on exit.
const ephemeral = process.env.EPHEMERAL === "1" || process.argv.includes("--ephemeral");
const adminBind = process.env.ADMIN_BIND ?? "127.0.0.1";

let identity: NodeIdentity;
let torWorkDir: string;
let wasCreated = false;
if (ephemeral) {
  identity = createEphemeralIdentity(NODE_PROFILE.ttlHours);
  torWorkDir = fs.mkdtempSync(path.join(os.tmpdir(), "unpruuf-tempnode-"));
} else {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const loaded = loadOrCreateIdentity(IDENTITY_PATH, NODE_PROFILE.ttlHours);
  identity = loaded.identity;
  wasCreated = loaded.wasCreated;
  torWorkDir = DATA_DIR;
}

// A Temp Node is one address for one chat by definition.
const nodeCount = ephemeral ? 1 : NODE_COUNT;
const store = new NodeStore(ephemeral ? ":memory:" : DB_PATH, identity.ttlHours);

let onion: NodeOnionService | null = null;
if (TOR_ENABLED) {
  const saved = ephemeral ? [] : identity.onionKeys ?? [];
  onion = new NodeOnionService({
    workDir: torWorkDir,
    torBinDir: TOR_BIN_DIR,
    localPort: PORT,
    privateKeys: Array.from({ length: nodeCount }, (_, i) => saved[i] ?? null),
    onNewKey: (index, key) => {
      if (ephemeral) return;
      const keys = identity.onionKeys ?? [];
      keys[index] = key;
      identity.onionKeys = keys;
      saveIdentity(IDENTITY_PATH, identity);
    },
    pow: POW,
  });
}

const operatorAddress = process.env.NODE_MESH_PUBLIC_ADDRESS?.trim() || null;
const publicAddress = (): string | null => (onion ? onion.getStatus().onionAddress : operatorAddress);
const publicAddresses = (): string[] =>
  onion ? onion.getStatus().onionAddresses : operatorAddress ? [operatorAddress] : [];
const app = createApp(store, () => identity.ownerSecret, publicAddresses);

const adminApp = createAdminApp(
  {
    getOwnerSecret: () => identity.ownerSecret,
    rotateOwnerSecret: ephemeral
      ? undefined
      : () => {
          identity = regenerateSecret(IDENTITY_PATH, identity);
          console.log("[identity] owner secret rotated — scan the new owner QR into your own app");
        },
    profile: NODE_PROFILE,
    slot: NODE_SLOT,
    ephemeral,
    torEnabled: TOR_ENABLED,
    publicAddress,
    publicAddresses,
    torStatus: () => onion?.getStatus() ?? null,
    stats: () => store.stats(),
  },
  ADMIN_PORT,
);

const kind = ephemeral
  ? "Temp Node"
  : `Business Node server (slot ${NODE_SLOT}/3, ${nodeCount} node${nodeCount === 1 ? "" : "s"})`;
console.log(`unpruuf ${kind} — profile "${NODE_PROFILE.name}" (TTL ${NODE_PROFILE.ttlHours}h)`);
if (ephemeral) console.log("[identity] Temp Node — identity, onion key and messages exist in memory only");
else console.log(wasCreated ? "[identity] new node identity created" : "[identity] existing node identity loaded");

const apiServer: Server = app.listen(PORT, "127.0.0.1", () => {
  console.log(`[api] listening on 127.0.0.1:${PORT} — reachable from outside only through the onion service`);
});
apiServer.keepAliveTimeout = 5_000;

const adminServer: Server = adminApp.listen(ADMIN_PORT, adminBind, () => {
  console.log(`[setup] open http://localhost:${ADMIN_PORT} on THIS computer to connect your app (owner QR)`);
});

async function printOwnerCode(address: string): Promise<void> {
  const code = ownerConnectionString(address, identity.ownerSecret);
  const qr = await QRCode.toString(code, { type: "terminal", small: true });
  console.log("\n================ OWNER CODE — scan with YOUR OWN app only, never share ================");
  console.log(qr);
  console.log(code);
  console.log("========================================================================================\n");
}

if (onion) {
  onion
    .start()
    .then(async (address) => {
      const all = onion!.getStatus().onionAddresses;
      if (all.length > 1) console.log(`[tor] ${all.length} onion addresses registered, first: ${address} (Tor proof-of-work defense on)`);
      else console.log(`[tor] onion address: ${address} (Tor proof-of-work defense on)`);
      if (ephemeral || wasCreated) await printOwnerCode(address);
    })
    .catch((err) => {
      console.error(`[tor] could not start yet: ${(err as Error).message}`);
      console.error("[tor] keeps retrying automatically — the setup page shows the current state");
    });
} else {
  console.warn("[tor] NODE_MESH_TOR=0 — this process publishes NO onion service itself.");
  console.warn(`[tor] Only valid if you run your own Tor hidden service mapping port 80 to 127.0.0.1:${PORT}.`);
  if (operatorAddress && (ephemeral || wasCreated)) void printOwnerCode(operatorAddress);
}

// The only deletion path (NODE_MESH_SPEC.md §4) — Reset below never touches message data.
setInterval(() => {
  const removed = store.sweepExpired();
  if (removed > 0) console.log(`[sweep] removed ${removed} expired blob(s)`);
}, SWEEP_INTERVAL_MS).unref();

// NODE_MESH_SPEC.md §5 staggered Reset — connection/socket hygiene only: drop idle HTTP
// keep-alive sockets, confirm the onion service is still registered (re-add with the same key if
// not), fold the SQLite WAL back. Never messages, never rate-limit counters, never the address.
async function resetHygiene(label: string): Promise<void> {
  apiServer.closeIdleConnections();
  adminServer.closeIdleConnections();
  store.checkpointWal();
  let torNote = "tor disabled";
  if (onion) torNote = await onion.hygiene().catch((err) => `tor check failed: ${(err as Error).message}`);
  console.log(`[reset] ${label}: idle sockets closed, WAL checkpointed, ${torNote}`);
}

// Aligned to the wall clock (UTC), not to process start — three nodes on three different machines,
// started at arbitrary times, still land on 0 / 20 / 40 min of the same daily cycle.
const msUntilFirstReset = (RESET_OFFSET_MS - (Date.now() % RESET_INTERVAL_MS) + RESET_INTERVAL_MS) % RESET_INTERVAL_MS;
setTimeout(() => {
  void resetHygiene("scheduled");
  setInterval(() => void resetHygiene("scheduled"), RESET_INTERVAL_MS).unref();
}, msUntilFirstReset).unref();

function shutdown(): void {
  onion?.stop();
  apiServer.close();
  adminServer.close();
  store.close();
  if (ephemeral) fs.rmSync(torWorkDir, { recursive: true, force: true });
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
