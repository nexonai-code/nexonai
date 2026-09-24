import { createApp } from "./app";
import { NodeStore } from "./store/nodeStore";
import { DB_PATH, IDENTITY_PATH, PORT, RESET_INTERVAL_MS, RESET_OFFSET_MS, SWEEP_INTERVAL_MS } from "./config";
import { createEphemeralIdentity, loadOrCreateIdentity, NodeIdentity } from "./nodeIdentity";

// unpruuf Business Temp Node (NODE_MESH_SPEC.md §7 step 8): EPHEMERAL=1 starts this process as a
// one-off Temp Node whose identity — and, since a persisted DB would otherwise outlive the
// process and let a restart quietly pick the same messages back up, its message store too — never
// touch disk at all. A regular (non-ephemeral) node keeps its usual on-disk identity/DB so a
// restart doesn't lock the owner's own app instance(s) out; that distinction is the whole reason
// this branches here instead of always going through loadOrCreateIdentity.
const ephemeral = process.env.EPHEMERAL === "1" || process.argv.includes("--ephemeral");
let identity: NodeIdentity;
if (ephemeral) {
  identity = createEphemeralIdentity();
  console.log(`[identity] EPHEMERAL mode — Temp Node identity generated in memory only, TTL ${identity.ttlHours}h, nothing written to disk`);
  console.log(`[identity] owner secret (configure the app's "Activate Temp Node" screen with this): ${identity.ownerSecret}`);
} else {
  const { identity: loaded, wasCreated } = loadOrCreateIdentity(IDENTITY_PATH);
  identity = loaded;
  if (wasCreated) {
    // Only path to retrieve the secret for a Docker deployment is the container logs — printed
    // once, at generation time, not on every subsequent start. Unlike the consumer relay's token,
    // this NEVER gets handed to a contact — only into this node's own paired app instance(s), see
    // NODE_MESH_SPEC.md §1/§8.
    console.log(`[identity] generated a new owner secret (TTL ${identity.ttlHours}h): ${identity.ownerSecret}`);
    console.log("[identity] configure this node's OWNER app instance(s) with this secret — see node-mesh-server/README.md");
  } else {
    console.log(`[identity] loaded existing identity (TTL ${identity.ttlHours}h)`);
  }
}

const store = new NodeStore(ephemeral ? ":memory:" : DB_PATH, identity.ttlHours);
const app = createApp(store, identity.ownerSecret);

// The only deletion path (NODE_MESH_SPEC.md §4) — Reset below never touches message data.
setInterval(() => {
  const removed = store.sweepExpired();
  if (removed > 0) console.log(`[sweep] removed ${removed} expired blob(s)`);
}, SWEEP_INTERVAL_MS).unref();

// NODE_MESH_SPEC.md §5's staggered Reset — connection/socket hygiene only. This Express +
// better-sqlite3 process holds no outbound connection pool of its own to recycle (better-sqlite3
// is a single synchronous connection, not a pool; there are no long-lived outbound sockets here
// the way an Android/Windows client maintaining live Tor circuits would have) — so for this
// specific implementation, Reset's real, honest content is a best-effort SQLite housekeeping
// pass (WAL checkpoint) rather than invented connection-pool work that doesn't apply to this
// process shape. Still on its own staggered schedule per §5, in case a future client-facing
// (rather than server-facing) implementation of this same interval does need real connection
// recycling — keeping the timing contract identical now avoids a later behavioral surprise.
setInterval(() => {
  store.checkpointWal();
  console.log("[reset] connection/socket hygiene pass complete");
}, RESET_INTERVAL_MS).unref();
if (RESET_OFFSET_MS > 0) {
  // First reset of THIS process's lifetime waits out its configured offset into the cycle before
  // the regular interval above takes over — see config.ts's RESET_OFFSET_MS doc comment for why
  // running multiple node instances each need a different offset.
  setTimeout(() => {
    store.checkpointWal();
    console.log("[reset] connection/socket hygiene pass complete (initial, offset-aligned)");
  }, RESET_OFFSET_MS).unref();
}

app.listen(PORT, "127.0.0.1", () => {
  console.log(`unpruuf-node-mesh listening on 127.0.0.1:${PORT} (reach it only via this node's own Tor hidden service)`);
});

process.on("SIGTERM", () => { store.close(); process.exit(0); });
process.on("SIGINT", () => { store.close(); process.exit(0); });
