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
    console.log(`[startup] Identitate nouă de ofițer generată (userId ${identity.userId}).`);
    console.log(`[startup] Salvată, criptată cu OFFICER_PASSWORD, în ${config.identityPath}.`);
    console.log(`[startup] Fă o copie de siguranță a acestui fișier — dacă îl pierzi, mesajele din toate cazurile existente devin ilizibile.`);
  } else {
    console.log(`[startup] Identitate de ofițer existentă încărcată (userId ${identity.userId}).`);
  }

  const store = new CaseStore(config.dbPath, deriveDbKey(identity));

  let torClient: TorClient | undefined;
  let relayReachableBaseUrl: string;
  if (config.torEnabled) {
    console.log("[startup] Se pornește Tor (ajunge la adresa .onion reală a releului — aceeași cale folosită de aplicația Android, nu un scurtcircuit LAN)...");
    try {
      torClient = await startTorAndWaitReady(config.dataDir, {
        onProgress: (pct, line) => console.log(`[tor] ${pct}% — ${line}`),
      });
      console.log(`[startup] Tor pornit cu succes — proxy SOCKS pe 127.0.0.1:${torClient.socksPort}.`);
    } catch (err) {
      console.error(`\n[startup] Tor nu a reușit să pornească: ${(err as Error).message}`);
      console.error("[startup] Verifică conexiunea la internet a acestui calculator și încearcă din nou.");
      console.error("[startup] Pentru a rula fără Tor (doar LAN, mai slab — vezi README.md, secțiunea Known gaps),");
      console.error("[startup] setează RELAY_REACHABLE_BASE_URL la adresa LAN a releului și repornește.\n");
      process.exit(1);
    }
    relayReachableBaseUrl = relayBaseUrlFromAddress(config.relayAddress);
  } else {
    relayReachableBaseUrl = config.relayReachableBaseUrlOverride!;
    console.log(`[startup] TOR DEZACTIVAT — se comunică direct cu ${relayReachableBaseUrl} (vezi README.md, secțiunea Known gaps, pentru ce se pierde astfel).`);
  }

  const relay = new RelayClient({
    baseUrl: relayReachableBaseUrl,
    authToken: config.relayAuthToken,
    socksPort: torClient?.socksPort,
  });
  const pollLoop = new PollAndIngestLoop(identity, store, relay);

  const app = createDashboardApp(identity, store, relay, config.relayConnectionString, relayReachableBaseUrl);
  app.listen(config.dashboardPort, () => {
    console.log(`[startup] Panoul ascultă pe http://localhost:${config.dashboardPort}`);
    console.log(`[startup] Interoghez releul la ${relayReachableBaseUrl} la fiecare ${config.pollIntervalMs}ms${torClient ? " (prin Tor)" : ""}.`);
  });

  const pollTick = async () => {
    try {
      await pollLoop.pollOnce();
    } catch (err) {
      console.error("[poll] rundă eșuată:", err instanceof Error ? err.message : err);
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
