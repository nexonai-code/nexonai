import { loadConfig } from "./config";
import { loadOrCreateOfficerIdentity, WrongPasswordError } from "./officer/officerIdentity";
import { CaseStore, deriveDbKey } from "./store/caseStore";
import { RelayClient } from "./relay/relayClient";
import { PollAndIngestLoop } from "./officer/pollAndIngest";
import { createDashboardApp } from "./web/app";

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
  const relay = new RelayClient({ baseUrl: config.relayReachableBaseUrl, authToken: config.relayAuthToken });
  const pollLoop = new PollAndIngestLoop(identity, store, relay);

  const app = createDashboardApp(identity, store, relay, config.relayConnectionString, config.relayReachableBaseUrl);
  app.listen(config.dashboardPort, () => {
    console.log(`[startup] Dashboard listening on http://localhost:${config.dashboardPort}`);
    console.log(`[startup] Polling relay at ${config.relayReachableBaseUrl} every ${config.pollIntervalMs}ms.`);
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

  process.on("SIGTERM", () => { store.close(); process.exit(0); });
  process.on("SIGINT", () => { store.close(); process.exit(0); });
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
