import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Server } from "http";
import QRCode from "qrcode";
import { createApp } from "./app";
import { createAdminApp, ownerConnectionString } from "./admin/adminApp";
import { NodeStore } from "./store/nodeStore";
import {
  ADMIN_PORT, DATA_DIR, DB_PATH, IDENTITY_PATH, KEY_STORAGE, LICENSE_PATH, NODE_PROFILE, NODE_SLOT, PORT, POW, STORE_IN_RAM, PACKAGE_ROOT, REQUIRE_SIGNED,
  RESET_INTERVAL_MS, RESET_OFFSET_MS, SWEEP_INTERVAL_MS, TOR_BIN_DIR, TOR_ENABLED,
} from "./config";
import {
  createEphemeralIdentity, isLocked, loadOrCreateIdentity, NodeIdentity, regenerateSecret, saveIdentity, unlockIdentity,
} from "./nodeIdentity";
import { NodeOnionService } from "./tor/onionService";
import { Metrics } from "./metrics";
import { LicenseGuard } from "./license";
import { describeIntegrity, IntegrityResult, verifyIntegrity } from "./integrity";

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
  const loaded = loadOrCreateIdentity(IDENTITY_PATH, NODE_PROFILE.ttlHours, KEY_STORAGE);
  identity = loaded.identity;
  wasCreated = loaded.wasCreated;
  torWorkDir = DATA_DIR;
}
const sealed = !ephemeral && identity.keyStorage === "sealed";

// Server license (license.ts): checked offline. A Temp Node is one address for one chat and needs
// none. Every other server starts its API and its onion services only once a genuine license is
// present — until then only the setup page runs, where the license is pasted in.
const license = new LicenseGuard({ filePath: ephemeral ? null : LICENSE_PATH, envCode: process.env.NODE_MESH_LICENSE, free: ephemeral });

// A Temp Node is one address for one chat by definition. Otherwise the license caps the node count.
// Not a setting: a licensed server runs every node its licence allows (never more than 250).
let nodeCount = ephemeral ? 1 : Math.max(1, license.maxNodes());
// Release integrity (integrity.ts): once at start, then hourly. A changed file is reported loudly;
// with NODE_MESH_REQUIRE_SIGNED=1 the server does not start at all.
let integrity: IntegrityResult = verifyIntegrity(PACKAGE_ROOT);
console.log(`[integrity] ${describeIntegrity(integrity)}`);
if (REQUIRE_SIGNED && integrity.state !== "ok" && integrity.state !== "exe") {
  console.error("[integrity] NODE_MESH_REQUIRE_SIGNED=1 and the program files are not a verified release. Not starting.");
  process.exit(1);
}
setInterval(() => {
  const before = integrity.state;
  integrity = verifyIntegrity(PACKAGE_ROOT);
  if (integrity.state !== before) {
    console.log(`[integrity] changed: ${describeIntegrity(integrity)}`);
    for (const f of [...integrity.changed, ...integrity.missing, ...integrity.extra].slice(0, 8)) console.log(`[integrity]   ${f}`);
  }
}, 60 * 60 * 1000).unref();

const messagesInRam = ephemeral || STORE_IN_RAM;
const store = new NodeStore(messagesInRam ? ":memory:" : DB_PATH, identity.ttlHours);

let onion: NodeOnionService | null = null;
let apiServer: Server | null = null;
let serviceStarted = false;

function createOnionService(): NodeOnionService {
  const saved = ephemeral ? [] : identity.onionKeys ?? [];
  return new NodeOnionService({
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
    controlKey: sealed ? identity.controlKey ?? null : undefined,
    onNewControlKey: (key) => {
      identity.controlKey = key;
      saveIdentity(IDENTITY_PATH, identity);
    },
    locked: sealed && isLocked(identity),
    pow: POW,
  });
}

// Sealed servers: the owner app (or the setup page) proves the owner secret, the node keys are
// unsealed into memory and the node onions go online again under their old addresses.
async function unlock(secret: string): Promise<string[] | null> {
  if (!unlockIdentity(identity, secret)) return null;
  if (KEY_STORAGE === "disk") identity.keyStorage = "disk";
  saveIdentity(IDENTITY_PATH, identity);
  if (!onion) return publicAddresses();
  const keys = identity.onionKeys ?? [];
  const addresses = await onion.unlock(Array.from({ length: nodeCount }, (_, i) => keys[i] ?? null));
  console.log(`[keys] unlocked by the owner — ${addresses.length} node onion(s) published again`);
  return addresses;
}
const lockControl = sealed
  ? {
      isLocked: () => isLocked(identity),
      unlock,
      controlAddress: () => onion?.getStatus().controlAddress ?? null,
    }
  : undefined;

const operatorAddress = process.env.NODE_MESH_PUBLIC_ADDRESS?.trim() || null;
const publicAddress = (): string | null => (onion ? onion.getStatus().onionAddress : operatorAddress);
const publicAddresses = (): string[] =>
  onion ? onion.getStatus().onionAddresses : operatorAddress ? [operatorAddress] : [];
const metrics = new Metrics();
const app = createApp(store, () => identity.ownerSecret, publicAddresses, lockControl, metrics, () => license.depositBlocked());

const adminApp = createAdminApp(
  {
    getOwnerSecret: () => identity.ownerSecret,
    isLocked: () => isLocked(identity),
    unlock: sealed ? unlock : undefined,
    sealed,
    controlAddress: () => onion?.getStatus().controlAddress ?? null,
    rotateOwnerSecret: ephemeral
      ? undefined
      : () => {
          identity = regenerateSecret(IDENTITY_PATH, identity);
          console.log("[identity] owner secret rotated — scan the new owner QR into your own app");
        },
    profile: NODE_PROFILE,
    slot: NODE_SLOT,
    ephemeral,
    messagesInRam,
    integrity: () => integrity,
    torEnabled: TOR_ENABLED,
    publicAddress,
    publicAddresses,
    torStatus: () => onion?.getStatus() ?? null,
    stats: () => store.stats(),
    metrics,
    get configuredNodes() {
      return nodeCount;
    },
    registeredNodes: () => (onion ? onion.registeredNodeCount() : Promise.resolve(null)),
    license: () => license.summary(),
    applyLicense: async (code: string) => {
      const result = license.apply(code);
      if (!result.ok) return result;
      console.log(`[license] applied — ${result.license.customer}, serial ${result.license.serial}, ${result.license.maxNodes} node(s), until ${new Date(result.license.expiresAtMs).toISOString().slice(0, 10)}`);
      if (!serviceStarted) startService();
      return { ok: true, summary: license.summary() };
    },
  },
  ADMIN_PORT,
);

const kind = ephemeral
  ? "Temp Node"
  : `Business Node server (slot ${NODE_SLOT}/3)`;
console.log(`unpruuf ${kind} — profile "${NODE_PROFILE.name}" (TTL ${NODE_PROFILE.ttlHours}h)`);
if (ephemeral) console.log("[identity] Temp Node — identity, onion key and messages exist in memory only");
else if (messagesInRam) console.log("[store] NODE_MESH_STORE=ram — waiting packets live in memory only; a restart drops them");
else console.log(wasCreated ? "[identity] new node identity created" : "[identity] existing node identity loaded");
if (sealed && isLocked(identity)) {
  console.log("[keys] LOCKED — node keys are sealed and only exist on disk encrypted. Nodes stay offline until");
  console.log("[keys] you unlock: unpruuf app → Settings → Your own nodes → Unlock (or the setup page).");
} else if (sealed) {
  console.log("[keys] sealed storage — after a restart this server stays locked until your app unlocks it");
}

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

// API + onion services. Runs once: at start when a license is already present, otherwise the
// moment the license is pasted on the setup page.
function startService(): void {
  if (serviceStarted) return;
  serviceStarted = true;
  nodeCount = ephemeral ? 1 : Math.max(1, license.maxNodes());
  if (process.env.NODE_MESH_NODES) {
    console.warn("[node] NODE_MESH_NODES is no longer a setting and is ignored — a server always runs the full licensed number of nodes.");
  }
  console.log(`[node] ${nodeCount} node${nodeCount === 1 ? "" : "s"}`);

  apiServer = app.listen(PORT, "127.0.0.1", () => {
    console.log(`[api] listening on 127.0.0.1:${PORT} — reachable from outside only through the onion service`);
  });
  apiServer.keepAliveTimeout = 5_000;

  if (TOR_ENABLED) {
    onion = createOnionService();
    onion
      .start()
      .then(async (address) => {
        const st = onion!.getStatus();
        const all = st.onionAddresses;
        if (st.locked) {
          console.log(`[tor] locked — only the control onion is online: ${st.controlAddress}`);
          return;
        }
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
}

if (license.activated()) {
  startService();
} else {
  console.log("[license] LICENSE REQUIRED — this server runs once it has a server license from NexonAI.");
  console.log(`[license] Paste it on the setup page (http://localhost:${ADMIN_PORT}) or put it in ${LICENSE_PATH}.`);
}

// Logs the license state when it changes (valid → expiring → expired), and once at start.
let lastLicenseStatus = "";
function logLicense(): void {
  const l = license.summary();
  if (l.status === lastLicenseStatus || l.status === "free") return;
  lastLicenseStatus = l.status;
  const until = l.expiresAtMs ? new Date(l.expiresAtMs).toISOString().slice(0, 10) : "";
  if (l.status === "valid") console.log(`[license] valid until ${until} (${l.customer}, up to ${l.maxNodes} nodes)`);
  else if (l.status === "expiring") console.warn(`[license] expires in ${l.daysLeft} day(s), on ${until} — paste the renewal on the setup page`);
  else if (l.status === "expired") console.error(`[license] EXPIRED on ${until} — new deposits are refused, fetching still works. Paste a new license on the setup page.`);
  else if (l.status === "invalid") console.error("[license] the stored license code is not valid");
}
logLicense();
setInterval(logLicense, 60 * 60 * 1000).unref();

// The only deletion path (NODE_MESH_SPEC.md §4) — Reset below never touches message data.
setInterval(() => {
  const removed = store.sweepExpired();
  if (removed > 0) console.log(`[sweep] removed ${removed} expired blob(s)`);
}, SWEEP_INTERVAL_MS).unref();

// NODE_MESH_SPEC.md §5 staggered Reset — connection/socket hygiene only: drop idle HTTP
// keep-alive sockets, confirm the onion service is still registered (re-add with the same key if
// not), fold the SQLite WAL back. Never messages, never rate-limit counters, never the address.
async function resetHygiene(label: string): Promise<void> {
  apiServer?.closeIdleConnections();
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
  apiServer?.close();
  adminServer.close();
  store.close();
  if (ephemeral) fs.rmSync(torWorkDir, { recursive: true, force: true });
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
