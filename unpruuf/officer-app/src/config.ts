import * as path from "node:path";
import { parseConnectionString } from "./relay/connectionString";

function requireEnv(name: string, hint: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    console.error(`\n[config] Missing required environment variable ${name}.\n${hint}\n`);
    process.exit(1);
  }
  return value.trim();
}

export interface OfficerConfig {
  password: string;
  relayConnectionString: string;
  relayAuthToken: string;
  relayAddress: string;
  /** True unless RELAY_REACHABLE_BASE_URL is explicitly set (an opt-out to a direct LAN/dev
   *  connection — see relayReachableBaseUrlOverride) or TOR_ENABLED=false. Default posture:
   *  reach the relay over Tor, exactly like every other unpruuf peer, not a LAN shortcut. */
  torEnabled: boolean;
  /** Set only when the operator explicitly opted out of Tor — see torEnabled. */
  relayReachableBaseUrlOverride: string | null;
  dashboardPort: number;
  dataDir: string;
  identityPath: string;
  dbPath: string;
  pollIntervalMs: number;
}

export function loadConfig(): OfficerConfig {
  const password = requireEnv(
    "OFFICER_PASSWORD",
    "Set it once, e.g. in start.bat, before running this app — it protects the case " +
      "database and this officer's private keys at rest. Pick something you can remember: " +
      "losing it means losing access to every case (there is no recovery — see README.md).",
  );
  const relayConnectionString = requireEnv(
    "RELAY_CONNECTION_STRING",
    'The full "unpruuf-relay:v1:<onion>:<token>" string printed by the relay you\'re pairing ' +
      "against (the tablet's relay-android app, or server/'s own start script). Reporters need " +
      "the SAME relay's connection string in Settings → Relay for anything to reach this app.",
  );
  const parsed = parseConnectionString(relayConnectionString);
  if (!parsed) {
    console.error(`\n[config] RELAY_CONNECTION_STRING doesn't look like a valid "unpruuf-relay:v1:<address>:<token>" string.\n`);
    process.exit(1);
  }

  const relayReachableBaseUrlOverride = process.env.RELAY_REACHABLE_BASE_URL?.trim().replace(/\/+$/, "") || null;
  const torExplicitlyDisabled = process.env.TOR_ENABLED === "false";
  if (torExplicitlyDisabled && !relayReachableBaseUrlOverride) {
    console.error(
      "\n[config] TOR_ENABLED=false requires RELAY_REACHABLE_BASE_URL too — without Tor this " +
        "process has no other way to reach the relay. Set both, or unset TOR_ENABLED to use Tor.\n",
    );
    process.exit(1);
  }
  const torEnabled = !torExplicitlyDisabled && !relayReachableBaseUrlOverride;

  const dataDir = process.env.OFFICER_DATA_DIR ?? path.join(__dirname, "..", "data");
  return {
    password,
    relayConnectionString,
    relayAuthToken: parsed.authToken,
    relayAddress: parsed.address,
    torEnabled,
    relayReachableBaseUrlOverride,
    dashboardPort: Number(process.env.PORT ?? 3000),
    dataDir,
    identityPath: path.join(dataDir, "officer-identity.json"),
    dbPath: path.join(dataDir, "cases.sqlite"),
    pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 8000),
  };
}

/** The relay's own advertised address (`unpruuf-relay:v1:<address>:<token>`, e.g. a bare
 *  `.onion` or a `host:port`) always describes where it's *actually* reachable — over Tor for a
 *  bare onion, matching the exact port-80 convention the Android app's RelayClient.kt already
 *  uses for onion addresses (a bare onion has no explicit port; 80 is the hidden service's
 *  virtual port every relay torrc publishes). A `host:port` address (a non-Tor deployment) is
 *  used as given. */
export function relayBaseUrlFromAddress(address: string): string {
  return address.includes(":") ? `http://${address}` : `http://${address}:80`;
}
