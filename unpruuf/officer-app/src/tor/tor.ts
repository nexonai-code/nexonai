import * as path from "path";
import { ensureTorBinary } from "./torDownload";
import { startTorClient, waitForBootstrap, TorHandle } from "./torProcess";

/**
 * Officer-app's Tor bootstrap entry point — downloads the Tor binary if needed, spawns it as a
 * pure outbound SOCKS client, waits for a real 100% bootstrap, and hands back the local SOCKS
 * port every relay request should be routed through (see relay/torRelayClient.ts). This is what
 * lets the officer's laptop reach a relay's `.onion` address directly, the same way the Android
 * app already does — closing the "officer-app is LAN/HTTP-only" gap this project's docs have
 * flagged since the Whistleblower line was first built.
 */

export interface TorClient {
  socksPort: number;
  stop: () => void;
}

export async function startTorAndWaitReady(
  dataDir: string,
  opts: { socksPort?: number; onProgress?: (pct: number, line: string) => void } = {},
): Promise<TorClient> {
  const binDir = path.join(dataDir, "tor-bin");
  const torExePath = process.env.TOR_EXE_PATH ?? (await ensureTorBinary(binDir));
  const socksPort = opts.socksPort ?? 19050;

  const handle: TorHandle = startTorClient({ torExePath, dataDir, socksPort });
  try {
    await waitForBootstrap(handle, { onProgress: opts.onProgress });
  } catch (err) {
    handle.proc.kill();
    throw err;
  }

  return {
    socksPort,
    stop: () => {
      handle.proc.kill();
    },
  };
}
