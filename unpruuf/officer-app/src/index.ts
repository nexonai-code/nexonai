import { loadConfig, relayBaseUrlFromAddress } from "./config";
import { loadOrCreateOfficerIdentity, WrongPasswordError } from "./officer/officerIdentity";
import { CaseStore, deriveDbKey } from "./store/caseStore";
import { RelayClient } from "./relay/relayClient";
import { PollAndIngestLoop } from "./officer/pollAndIngest";
import { createDashboardApp, DashboardStatus } from "./web/app";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { startTorAndWaitReady, TorClient } from "./tor/tor";
import { PressSettingsStore } from "./settings/pressSettings";
import { AccessOptions, LOOPBACK_HOSTS } from "./web/accessGuard";

/** Opens the dashboard in the default browser so a live demo needs no typing. OFFICER_OPEN_BROWSER=0 turns it off. */
function openInBrowser(url: string): void {
  if (process.env.OFFICER_OPEN_BROWSER === "0") return;
  try {
    const child =
      process.platform === "win32" ? spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true })
      : process.platform === "darwin" ? spawn("open", [url], { stdio: "ignore", detached: true })
      : spawn("xdg-open", [url], { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    // no browser available: the URL is printed above anyway
  }
}

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

  const status: DashboardStatus = { viaTor: Boolean(torClient), lastPollAt: null, lastPollOk: true };
  const press = config.edition === "press" ? new PressSettingsStore(config.settingsPath) : undefined;
  if (press) console.log("[startup] unpruuf Press: fără termene legale, păstrare reglabilă, ștergere pe caz.");
  // Dashboard access (security test finding OFF-1): loopback only by default. Listening on another
  // address needs OFFICER_BIND_HOST plus a dashboard password, and the names it may be called by.
  const bindHost = process.env.OFFICER_BIND_HOST?.trim() || "127.0.0.1";
  const loopbackOnly = ["127.0.0.1", "::1", "localhost"].includes(bindHost);
  const dashboardPassword = process.env.OFFICER_DASHBOARD_PASSWORD || undefined;
  if (!loopbackOnly && (!dashboardPassword || dashboardPassword.length < 12)) {
    console.error(`\n[startup] OFFICER_BIND_HOST=${bindHost} deschide panoul în rețea. Setează și OFFICER_DASHBOARD_PASSWORD (cel puțin 12 caractere), altfel nu pornesc.\n`);
    process.exit(1);
  }
  const extraHosts = (process.env.OFFICER_ALLOWED_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  const access: AccessOptions = {
    allowedHosts: [...LOOPBACK_HOSTS, ...(loopbackOnly ? [] : [bindHost.toLowerCase()]), ...extraHosts],
    password: dashboardPassword,
    // SEC-009: second factor, new at every start (see accessGuard.ts).
    token: randomBytes(32).toString("base64url"),
  };
  const app = createDashboardApp(identity, store, relay, config.relayConnectionString, relayReachableBaseUrl, () => status, config.edition, press, access);
  app.listen(config.dashboardPort, bindHost, () => {
    console.log(`[startup] Panoul ascultă pe http://localhost:${config.dashboardPort}${loopbackOnly ? " (doar acest calculator)" : ` — ATENȚIE: deschis în rețea pe ${bindHost}, cu parolă`}`);
    const link = `http://localhost:${config.dashboardPort}/?t=${access.token}`;
    if (process.stdout.isTTY) {
      // Only a person at a terminal sees the token; it never goes into a log stream.
      console.log(`[startup] Deschide panoul cu cheia de acces (nouă la fiecare pornire) / Open the dashboard with its access key: ${link}`);
      openInBrowser(link);
    } else {
      const tokenPath = path.join(config.dataDir, "dashboard-token");
      fs.mkdirSync(config.dataDir, { recursive: true });
      fs.writeFileSync(tokenPath, access.token + "\n", { mode: 0o600 });
      fs.chmodSync(tokenPath, 0o600);
      console.log(`[startup] Panoul cere o cheie de acces, nouă la fiecare pornire; nu este afișată aici (ieșirea nu este un terminal). / The dashboard needs an access key; it is not printed here.`);
      console.log(`[startup] Cheia este în / The key is in ${tokenPath}. Deschide / Open http://localhost:${config.dashboardPort}/?t=<cheie/key>`);
    }
    console.log(`[startup] Interoghez releul la ${relayReachableBaseUrl} la fiecare ${config.pollIntervalMs}ms${torClient ? " (prin Tor)" : ""}.`);
  });

  const pollTick = async () => {
    try {
      await pollLoop.pollOnce();
      status.lastPollOk = true;
      press?.recordPoll();
    } catch (err) {
      status.lastPollOk = false;
      console.error("[poll] rundă eșuată:", err instanceof Error ? err.message : err);
    }
    status.lastPollAt = Date.now();
  };
  setInterval(pollTick, config.pollIntervalMs).unref();
  void pollTick();

  // unpruuf Press: tips with no activity for the chosen number of days are deleted for good.
  if (press) {
    const sweep = () => {
      const days = press.get().retentionDays;
      if (days <= 0) return;
      try {
        const n = store.deleteInactiveBefore(Date.now() - days * 24 * 60 * 60 * 1000);
        if (n > 0) console.log(`[retention] ${n} sesizări șterse (fără activitate de peste ${days} zile).`);
      } catch (err) {
        console.error("[retention] eșuat:", err instanceof Error ? err.message : err);
      }
    };
    sweep();
    setInterval(sweep, 60 * 60 * 1000).unref();
  }

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
