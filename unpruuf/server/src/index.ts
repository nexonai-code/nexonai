import { createApp } from "./app";
import { BlobStore } from "./store/blobStore";
import { DB_PATH, IDENTITY_PATH, PORT, SWEEP_INTERVAL_MS } from "./config";
import { loadOrCreateIdentity } from "./identity";

const { identity, wasCreated } = loadOrCreateIdentity(IDENTITY_PATH);
if (wasCreated) {
  // Only path to retrieve the token for a Docker deployment is the container logs (`docker
  // compose logs relay`) — printed once, at generation time, not on every subsequent start.
  console.log(`[identity] generated a new auth token (TTL ${identity.ttlHours}h): ${identity.authToken}`);
  console.log("[identity] clients need this token to use this relay — see server/README.md");
} else {
  console.log(`[identity] loaded existing identity (TTL ${identity.ttlHours}h)`);
}

const store = new BlobStore(DB_PATH, identity.ttlHours);
const app = createApp(store, identity.authToken);

setInterval(() => {
  const removed = store.sweepExpired();
  if (removed > 0) console.log(`[sweep] removed ${removed} expired blob(s)`);
}, SWEEP_INTERVAL_MS).unref();

// Deliberately 127.0.0.1 by default — reach this relay only via its Tor hidden service, never
// directly. RELAY_BIND_HOST is an explicit, documented escape hatch for a demo/LAN scenario
// (e.g. the officer-app and a web-based reporter reaching this relay directly over Wi-Fi
// without Tor — see officer-app/README.md's "Known gaps") — never set it to 0.0.0.0 on a
// relay meant to be reached only through Tor, since that would defeat the whole point of
// running it as a hidden service in the first place.
const BIND_HOST = process.env.RELAY_BIND_HOST ?? "127.0.0.1";
app.listen(PORT, BIND_HOST, () => {
  const reachability = BIND_HOST === "127.0.0.1"
    ? "reach it only via the Tor sidecar"
    : `reachable directly on ${BIND_HOST} — RELAY_BIND_HOST is set, this is a deliberate demo/LAN mode, not the default`;
  console.log(`unpruuf-relay listening on ${BIND_HOST}:${PORT} (${reachability})`);
});

process.on("SIGTERM", () => { store.close(); process.exit(0); });
process.on("SIGINT", () => { store.close(); process.exit(0); });
