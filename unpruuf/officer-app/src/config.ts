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
  relayReachableBaseUrl: string;
  dashboardPort: number;
  dataDir: string;
  identityPath: string;
  dbPath: string;
  pollIntervalMs: number;
}

export function loadConfig(): OfficerConfig {
  const password = requireEnv(
    "OFFICER_PASSWORD",
    "Set it once, e.g. in start-windows.bat, before running this app — it protects the case " +
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
  const relayReachableBaseUrl = requireEnv(
    "RELAY_REACHABLE_BASE_URL",
    "This process talks plain HTTP(S) to the relay, not Tor — see relayClient.ts's doc comment " +
      'for why. Point this at wherever the relay is actually reachable, e.g. "http://192.168.1.50:8787" ' +
      "for the tablet relay on the same Wi-Fi during a demo.",
  );

  const dataDir = process.env.OFFICER_DATA_DIR ?? path.join(__dirname, "..", "data");
  return {
    password,
    relayConnectionString,
    relayAuthToken: parsed.authToken,
    relayReachableBaseUrl: relayReachableBaseUrl.replace(/\/+$/, ""),
    dashboardPort: Number(process.env.PORT ?? 3000),
    dataDir,
    identityPath: path.join(dataDir, "officer-identity.json"),
    dbPath: path.join(dataDir, "cases.sqlite"),
    pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 8000),
  };
}
