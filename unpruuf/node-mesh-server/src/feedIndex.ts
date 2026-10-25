import { spawn } from "child_process";
import * as path from "path";
import { ADMIN_TOKEN_FILE, createAdminToken, writeAdminToken } from "./admin/adminToken";
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
 * http://localhost:8841 (needs the access token, new at every start, like the node setup page).
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

// Second factor of the setup page (admin/adminToken.ts): new at every start, printed only to an
// interactive terminal, written 0600 into the data folder for the customer's own tools.
const adminToken = createAdminToken();
const adminTokenPath = path.join(DATA_DIR, ADMIN_TOKEN_FILE);
writeAdminToken(adminTokenPath, adminToken);

function openInBrowser(url: string): void {
  try {
    const [cmd, args] = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
      : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
    spawn(cmd as string, args as string[], { detached: true, stdio: "ignore" }).on("error", () => { /* no browser here: the link is printed above */ }).unref();
  } catch { /* the link is printed above */ }
}

const admin = createFeedAdminApp({ store, onion: () => onion?.getStatus() ?? null, startService, served: () => served }, ADMIN_PORT, adminToken).listen(ADMIN_PORT, "127.0.0.1", () => {
  if (process.stdout.isTTY) {
    console.log(`[feed] setup page: open http://localhost:${ADMIN_PORT}/?t=${adminToken} on THIS computer`);
    // start-feed.bat asks for it: the browser is opened from here, so the token never has to leave this process.
    if (process.env.NODE_MESH_OPEN_BROWSER === "1") openInBrowser(`http://localhost:${ADMIN_PORT}/?t=${adminToken}`);
  } else {
    console.log(`[feed] the setup page on port ${ADMIN_PORT} needs an access token. It is not printed here because this output is not a terminal;`);
    console.log(`[feed] it is in ${adminTokenPath} (new at every start). Open http://localhost:${ADMIN_PORT}/?t=<token> on THIS computer.`);
  }
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
