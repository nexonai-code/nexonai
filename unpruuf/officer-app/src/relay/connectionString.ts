/**
 * Direct port of `server/src/connectionString.ts` / `RelayManager`'s Kotlin companion object.
 * Format: `unpruuf-relay:v1:<onion-or-host:port>:<authToken>`. Keep all three implementations
 * (Node relay, Android, here) in lockstep — no shared code enforces it automatically.
 */
const PREFIX = "unpruuf-relay:v1:";
export const RELAY_POOL_MAX_SIZE = 3;

export interface ParsedConnection {
  address: string;
  authToken: string;
}

export function buildConnectionString(address: string, authToken: string): string {
  return `${PREFIX}${address}:${authToken}`;
}

export function parseConnectionString(raw: string): ParsedConnection | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith(PREFIX)) return null;
  const rest = trimmed.slice(PREFIX.length);
  const lastColon = rest.lastIndexOf(":");
  if (lastColon <= 0 || lastColon === rest.length - 1) return null;
  const address = rest.slice(0, lastColon);
  const authToken = rest.slice(lastColon + 1);
  if (address.length === 0 || authToken.length === 0) return null;
  return { address, authToken };
}

export function buildConnectionStringList(list: string[]): string {
  return list.map((s) => s.trim()).filter((s) => s.length > 0).slice(0, RELAY_POOL_MAX_SIZE).join(";");
}

export function parseConnectionStringList(raw: string): string[] {
  return raw.split(";").map((s) => s.trim()).filter((s) => s.length > 0);
}
