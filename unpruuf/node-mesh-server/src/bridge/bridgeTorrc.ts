import { cleanBridgeLine } from "../bridgeLines";

/**
 * The company's private Tor bridge: a Tor relay that is NOT published anywhere, with an obfs4
 * front (lyrebird). Phones that cannot reach Tor directly connect to it first; the traffic looks
 * like random noise to a network filter, and nobody outside the company knows the address.
 * Pure helpers here (torrc text, reading the generated bridge line), unit-tested; the runner is
 * bridgeIndex.ts.
 */

export interface BridgeConfig {
  dataDir: string;
  /** Path of the lyrebird (obfs4) program. */
  lyrebirdPath: string;
  /** TCP port the phones connect to (obfs4). Ports 443 or 80 pass most company networks. */
  port: number;
  ownerPid: number;
}

export function buildBridgeTorrc(c: BridgeConfig): string {
  return [
    "SocksPort 0",
    `DataDirectory ${c.dataDir}`,
    "BridgeRelay 1",
    // Private bridge: never listed. Only whoever has the bridge line can use it.
    "PublishServerDescriptor 0",
    // Tor needs an ORPort for a bridge; it is only used by the obfs4 front (through ExtORPort),
    // so it stays on this machine (also avoids IPv6 binding errors on hosts without IPv6);
    // nobody has to reach it from outside.
    "ORPort 127.0.0.1:auto",
    "ExtORPort auto",
    "AssumeReachable 1",
    // The Expert Bundle ships no GeoIP file; without this Tor warns about it on every start.
    "BridgeRecordUsageByCountry 0",
    `ServerTransportPlugin obfs4 exec ${c.lyrebirdPath}`,
    `ServerTransportListenAddr obfs4 0.0.0.0:${c.port}`,
    `__OwningControllerProcess ${c.ownerPid}`,
    "Log notice stdout",
    "",
  ].join("\n");
}

/** The 40-hex fingerprint inside Tor's `fingerprint` file ("Nickname ABCD…"), or null. */
export function parseFingerprintFile(text: string): string | null {
  const m = /^\S+\s+([0-9A-Fa-f ]{40,60})\s*$/m.exec(text.trim());
  const hex = m ? m[1].replace(/ /g, "").toUpperCase() : "";
  return /^[0-9A-F]{40}$/.test(hex) ? hex : null;
}

/** The `cert=… iat-mode=…` part of the template line lyrebird writes to pt_state/obfs4_bridge_line.txt. */
export function parseObfs4Template(text: string): { cert: string; iat: string } | null {
  const m = /^Bridge obfs4 <IP ADDRESS>:<PORT> <FINGERPRINT> (cert=\S+) (iat-mode=[0-2])\s*$/m.exec(text);
  return m ? { cert: m[1], iat: m[2] } : null;
}

/** The finished line for the phones, or null if any ingredient is missing or the result is not a valid line. */
export function composeBridgeLine(host: string, port: number, fingerprint: string, template: { cert: string; iat: string }): string | null {
  if (!/^[A-Za-z0-9.-]+$|^\[[0-9a-fA-F:]+\]$/.test(host)) return null;
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return cleanBridgeLine(`obfs4 ${host}:${port} ${fingerprint} ${template.cert} ${template.iat}`);
}
