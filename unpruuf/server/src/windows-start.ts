import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import * as qrcode from "qrcode-terminal";
import { createApp } from "./app";
import { buildConnectionString } from "./connectionString";
import { DB_PATH, IDENTITY_PATH, PORT, SWEEP_INTERVAL_MS } from "./config";
import { loadOrCreateIdentity, regenerateToken, saveIdentity } from "./identity";
import { BlobStore } from "./store/blobStore";
import { ensureTorBinary } from "./torDownload";
import { resolveTorExePath, startTor, waitForHostname } from "./windowsTor";

/**
 * Windows entrypoint: no Docker, no Tor sidecar container — this process runs the relay app
 * AND manages a Tor child process itself (see windowsTor.ts), then prints a QR code plus a
 * plain-text connection string so a phone can be pointed at this relay by scanning or by
 * pasting into Settings → Relay in the app. Run via `npm run win` or double-click
 * start-windows.bat (see windows/README.md for the one-time Tor Expert Bundle setup).
 */

function parseArgs(argv: string[]) {
  const args: { ttl?: number; dataDir?: string; torExe?: string; regenerate: boolean } = {
    regenerate: false,
  };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--ttl":
        args.ttl = Number(argv[++i]);
        break;
      case "--data-dir":
        args.dataDir = argv[++i];
        break;
      case "--tor-exe":
        args.torExe = argv[++i];
        break;
      case "--regenerate":
        args.regenerate = true;
        break;
    }
  }
  return args;
}

function promptTtlHours(defaultHours: number): Promise<number> {
  if (!process.stdin.isTTY) return Promise.resolve(defaultHours);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(
      `How many hours should the relay hold an undelivered message before dropping it? [${defaultHours}] `,
      (answer) => {
        rl.close();
        const trimmed = answer.trim();
        const parsed = trimmed.length === 0 ? defaultHours : Number(trimmed);
        resolve(Number.isFinite(parsed) && parsed > 0 ? parsed : defaultHours);
      }
    );
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let { identity, wasCreated } = loadOrCreateIdentity(IDENTITY_PATH, args.ttl);
  if (wasCreated && args.ttl === undefined) {
    // First run, no --ttl given on the command line — ask interactively instead of silently
    // picking the default, since this is exactly the "possibility to set a TTL" the setup needs.
    const ttlHours = await promptTtlHours(identity.ttlHours);
    identity = { ...identity, ttlHours };
    saveIdentity(IDENTITY_PATH, identity);
  }
  if (args.regenerate) {
    identity = regenerateToken(IDENTITY_PATH, identity);
    console.log("[identity] --regenerate: issued a new auth token. Any already-configured app must be re-scanned.");
  }

  console.log(wasCreated ? "[identity] generated new credentials." : "[identity] reusing existing credentials.");
  console.log(`[identity] message TTL: ${identity.ttlHours}h`);
  console.log("[identity] to force new credentials next time, pass --regenerate\n");

  const store = new BlobStore(DB_PATH, identity.ttlHours);
  const app = createApp(store, identity.authToken);

  setInterval(() => {
    const removed = store.sweepExpired();
    if (removed > 0) console.log(`[sweep] removed ${removed} expired blob(s)`);
  }, SWEEP_INTERVAL_MS).unref();

  await new Promise<void>((resolve) => app.listen(PORT, "127.0.0.1", resolve));
  console.log(`[server] listening on 127.0.0.1:${PORT}`);

  // Auto-download the Tor Expert Bundle on first run so nobody has to manually find/extract it
  // (see torDownload.ts) — but only if the user hasn't already pointed us at a specific tor.exe,
  // either via --tor-exe or TOR_EXE_PATH; an explicit override always wins and is never touched.
  const bundledTorDir = path.join(__dirname, "..", "windows", "tor");
  if (!args.torExe && !process.env.TOR_EXE_PATH && !fs.existsSync(path.join(bundledTorDir, "tor.exe"))) {
    await ensureTorBinary(bundledTorDir).catch(() => {
      // ensureTorBinary already printed the reason and a manual fallback — resolveTorExePath()
      // below still gets a chance to find a bare `tor`/`tor.exe` on PATH before giving up.
    });
  }

  const torExePath = resolveTorExePath(args.torExe);
  console.log(`[tor] starting ${torExePath} …`);
  const dataDir = path.dirname(IDENTITY_PATH);
  const tor = startTor({ torExePath, dataDir, localPort: PORT });
  tor.proc.on("error", (err) => {
    console.error(`[tor] failed to start: ${err.message}`);
    console.error("[tor] see windows/README.md — tor.exe must be on PATH, at windows/tor/tor.exe, or set via --tor-exe / TOR_EXE_PATH.");
    process.exit(1);
  });
  // Tor logs its own notice/warn/err output to stdout by default (confirmed by spawning it
  // directly and inspecting which stream each line arrived on — NOT stderr, which is easy to
  // assume and would otherwise silently discard every real diagnostic Tor prints, including the
  // exact reason for a startup failure).
  const torLogTail = { value: "" };
  const captureTorOutput = (chunk: Buffer) => {
    process.stderr.write(`[tor] ${chunk}`);
    torLogTail.value = (torLogTail.value + chunk.toString()).slice(-4000); // keep it bounded
  };
  tor.proc.stdout?.on("data", captureTorOutput);
  tor.proc.stderr?.on("data", captureTorOutput);

  console.log("[tor] waiting for the hidden service to publish (usually 10-30s, can take longer on first run) …");
  let onion: string;
  try {
    onion = await waitForHostname(tor.hostnamePath, 60_000, tor.proc, torLogTail);
  } catch (err) {
    console.error(`[tor] ${(err as Error).message}`);
    process.exit(1);
    return;
  }

  const connectionString = buildConnectionString(onion, identity.authToken);
  console.log(`\n[tor] hidden service ready: ${onion}\n`);
  printCredentials(connectionString);

  const shutdown = () => {
    console.log("\n[shutdown] stopping…");
    tor.proc.kill();
    store.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function printCredentials(connectionString: string) {
  console.log("Scan this in the app under Settings -> Relay -> Scan QR code:\n");
  qrcode.generate(connectionString, { small: true }, (qr: string) => console.log(qr));
  console.log("Or paste this into Settings -> Relay -> Connection string:\n");
  console.log(`  ${connectionString}\n`);
  console.log("Keep this window open — closing it stops the relay. Ctrl+C to stop.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
