import * as path from "path";
import { PACKAGE_ROOT, POW, TOR_BIN_DIR, TOR_ENABLED } from "./config";
import { createFeedAdminApp } from "./feed/feedAdmin";
import { createFeedApp } from "./feed/feedApp";
import { FeedOnionService } from "./feed/feedOnion";
import { FeedStore } from "./feed/feedStore";

/**
 * Rotating list feed (see feed/feedCrypto.ts for what it is and why): a small service on the
 * company's own server that hands the employees' apps the company's current node lists, at an onion
 * address that changes every few hours. Start with start-feed.bat (or `npm run start:feed`).
 *
 * Ports: the feed itself 127.0.0.1:8840 (only the onion service reaches it), the setup page
 * http://localhost:8841.
 */

const DATA_DIR = process.env.FEED_DATA_DIR ?? path.join(PACKAGE_ROOT, "data", "feed");
const PORT = Number(process.env.FEED_PORT ?? 8840);
const ADMIN_PORT = Number(process.env.FEED_ADMIN_PORT ?? 8841);

const store = new FeedStore(DATA_DIR);
let served = 0;
let onion: FeedOnionService | null = null;

function startService(): void {
  if (onion) return;
  const rt = store.runtime();
  if (!rt) return;
  if (!TOR_ENABLED) {
    console.warn("[feed] NODE_MESH_TOR=0 — no onion service is published by this process.");
    return;
  }
  onion = new FeedOnionService({
    workDir: path.join(DATA_DIR, "tor"),
    torBinDir: TOR_BIN_DIR,
    localPort: PORT,
    addressSeed: rt.addressSeed,
    periodHours: rt.periodHours,
    pow: POW,
  });
  onion.start().then(
    () => console.log(`[feed] online — the address changes every ${rt.periodHours} h (apps compute it, it is not shown here)`),
    (err) => console.error(`[feed] could not start yet: ${(err as Error).message} — retrying automatically`),
  );
}

const api = createFeedApp(store, () => void served++).listen(PORT, "127.0.0.1", () => {
  console.log(`[feed] listening on 127.0.0.1:${PORT} — reachable from outside only through the rotating onion address`);
});
const admin = createFeedAdminApp({ store, onion: () => onion?.getStatus() ?? null, startService, served: () => served }, ADMIN_PORT).listen(ADMIN_PORT, "127.0.0.1", () => {
  console.log(`[feed] setup page: http://localhost:${ADMIN_PORT}`);
});

if (store.isSetUp()) startService();
else console.log("[feed] not set up yet — open the setup page and create the feed.");

function shutdown(): void {
  onion?.stop();
  api.close();
  admin.close();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
