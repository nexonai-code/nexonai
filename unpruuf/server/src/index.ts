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

app.listen(PORT, "127.0.0.1", () => {
  console.log(`unpruuf-relay listening on 127.0.0.1:${PORT} (reach it only via the Tor sidecar)`);
});

process.on("SIGTERM", () => { store.close(); process.exit(0); });
process.on("SIGINT", () => { store.close(); process.exit(0); });
