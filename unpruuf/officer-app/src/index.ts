import { loadConfig, relayBaseUrlFromAddress } from "./config";
import { loadOrCreateOfficerIdentity, WrongPasswordError } from "./officer/officerIdentity";
import { CaseStore, deriveDbKey } from "./store/caseStore";
import { RelayClient } from "./relay/relayClient";
import { PollAndIngestLoop } from "./officer/pollAndIngest";
import { createDashboardApp } from "./web/app";
import { startTorAndWaitReady, TorClient } from "./tor/tor";

async function main() {
  const config = loadConfig();

  let identityResult;
  try {
    identityResult = loadOrCreateOfficerIdentity(config.identityPath, config.password);
  } catch (err) {
    if (err instanceof WrongPasswordError) {
      console.error(`\n[startup] ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
  const { identity, wasCreated } = identityResult;
  if (wasCreated) {
    console.log(`[startup] Generated a new officer identity (userId ${identity.userId}).`);
    console.log(`[startup] Wrote it, encrypted with OFFICER_PASSWORD, to ${config.identityPath}.`);
    console.log(`[startup] Back this file up — losing it means every existing case's messages become unreadable.`);
  } else {
    console.log(`[startup] Loaded existing officer identity (userId ${identity.userId}).`);
  }

  const store = new CaseStore(config.dbPath, deriveDbKey(identity));

  let torClient: TorClient | undefined;
  let relayReachableBaseUrl: string;
  if (config.torEnabled) {
    console.log("[startup] Starting Tor (this reaches the relay's real .onion address — the same path the Android app uses, not a LAN shortcut)...");
    try {
      torClient = await startTorAndWaitReady(config.dataDir, {
        onProgress: (pct, line) => console.log(`[tor] ${pct}% — ${line}`),
      });
      console.log(`[startup] Tor bootstrapped — SOCKS proxy on 127.0.0.1:${torClient.socksPort}.`);
    } catch (err) {
      console.error(`\n[startup] Tor failed to bootstrap: ${(err as Error).message}`);
      console.error("[startup] Check this machine's internet connection and try again.");
      console.error("[startup] To run without Tor instead (LAN-only, weaker — see README.md's Known gaps),");
      console.error("[startup] set RELAY_REACHABLE_BASE_URL to the relay's LAN address and restart.\n");
      process.exit(1);
    }
    relayReachableBaseUrl = relayBaseUrlFromAddress(config.relayAddress);
  } else {
    relayReachableBaseUrl = config.relayReachableBaseUrlOverride!;
    console.log(`[startup] TOR DISABLED — talking directly to ${relayReachableBaseUrl} (see README.md's Known gaps for what this trades away).`);
  }

  const relay = new RelayClient({
    baseUrl: relayReachableBaseUrl,
    authToken: config.relayAuthToken,
    socksPort: torClient?.socksPort,
  });
  const pollLoop = new PollAndIngestLoop(identity, store, relay);

  const app = createDashboardApp(identity, store, relay, config.relayConnectionString, relayReachableBaseUrl);
  app.listen(config.dashboardPort, () => {
    console.log(`[startup] Dashboard listening on http://localhost:${config.dashboardPort}`);
    console.log(`[startup] Polling relay at ${relayReachableBaseUrl} every ${config.pollIntervalMs}ms${torClient ? " (via Tor)" : ""}.`);
  });

  const pollTick = async () => {
    try {
      await pollLoop.pollOnce();
    } catch (err) {
      console.error("[poll] round failed:", err instanceof Error ? err.message : err);
    }
  };
  setInterval(pollTick, config.pollIntervalMs).unref();
  void pollTick();

  const shutdown = () => {
    torClient?.stop();
    store.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
