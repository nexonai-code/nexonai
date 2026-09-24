import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import * as qrcode from "qrcode-terminal";
import { createApp } from "./app";
import { buildConnectionString } from "./connectionString";
import { DB_PATH, IDENTITY_PATH, PORT, SWEEP_INTERVAL_MS } from "./config";
import { loadOrCreateIdentity, regenerateToken, saveIdentity } from "./identity";
import { BlobStore } from "./store/blobStore";
import { ensureTorBinaryMac } from "./torDownload";
import { keepTorAlive, resolveTorExePath, startTor, waitForHostname } from "./macTor";
import { formatQueueSnapshot, formatUptime, readOnionAddress } from "./relayStatus";

/**
 * macOS entrypoint: no Docker, no Tor sidecar container — this process runs the relay app AND
 * manages a Tor child process itself (see macTor.ts), then prints a QR code plus a plain-text
 * connection string so a phone can be pointed at this relay by scanning or by pasting into
 * Settings → Relay in the app. Run via `npm run mac` or double-click start-mac.command (see
 * mac/README.md for the one-time Gatekeeper step an unsigned script needs). This is the macOS
 * sibling of windows-start.ts — same shape, deliberately kept nearly line-for-line identical so
 * the two stay easy to compare and keep in sync.
 *
 * Beyond the shared shape it also supports running unattended (see mac/install-service.command),
 * which is why the two read-only subcommands below exist: with the relay running in the
 * background there is no console to look at, so `--show-code` and `--status` answer "what do I
 * scan?" and "is it working?" from the relay's own files without disturbing the running process.
 * `windows-start.ts` can adopt the same three additions unchanged — the logic all lives in
 * shared modules (`torProcess.ts`, `relayStatus.ts`) rather than here.
 */

function parseArgs(argv: string[]) {
  const args: {
    ttl?: number;
    dataDir?: string;
    torExe?: string;
    regenerate: boolean;
    showCode: boolean;
    status: boolean;
    showCodeJson: boolean;
    statusJson: boolean;
  } = {
    regenerate: false,
    showCode: false,
    status: false,
    showCodeJson: false,
    statusJson: false,
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
      case "--show-code":
        args.showCode = true;
        break;
      case "--status":
        args.status = true;
        break;
      case "--show-code-json":
        args.showCodeJson = true;
        break;
      case "--status-json":
        args.statusJson = true;
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

/**
 * `--show-code`: reprint the QR/connection string without starting or touching anything. Needed
 * because the code is otherwise only printed once at startup — adding a device later used to mean
 * restarting the relay (dropping every queued message) or scrolling back through the console,
 * and neither is possible at all once it runs as a background service.
 */
function showCode(dataDir: string): number {
  if (!fs.existsSync(IDENTITY_PATH)) {
    console.error("No relay identity yet — run ./start-mac.command once first to create one.");
    return 1;
  }
  const { identity } = loadOrCreateIdentity(IDENTITY_PATH);
  const onion = readOnionAddress(dataDir);
  if (!onion) {
    console.error("Tor hasn't published a hidden-service address yet. Start the relay and wait for it to finish bootstrapping, then try again.");
    return 1;
  }
  printCredentials(buildConnectionString(onion, identity.authToken), { keepOpenHint: false });
  return 0;
}

/**
 * `--status`: answer "is this thing actually working?" from outside the running process — the
 * only way to check when the relay runs in the background. Reads the same files the relay
 * maintains; SQLite's WAL mode allows this second reader alongside the live writer.
 */
function showStatus(dataDir: string): number {
  if (!fs.existsSync(IDENTITY_PATH)) {
    console.error("No relay identity yet — run ./start-mac.command once first.");
    return 1;
  }
  const { identity } = loadOrCreateIdentity(IDENTITY_PATH);
  const onion = readOnionAddress(dataDir);

  console.log("unpruuf relay — status\n");
  console.log(`  Onion address:  ${onion ?? "not published yet (Tor still bootstrapping, or relay never started)"}`);
  console.log(`  Message TTL:    ${identity.ttlHours}h`);

  if (!fs.existsSync(DB_PATH)) {
    console.log("  Queue:          no database yet — the relay has not stored anything so far");
    return 0;
  }
  const store = new BlobStore(DB_PATH, identity.ttlHours);
  try {
    console.log(`  Queue:          ${formatQueueSnapshot(store.stats())}`);
  } finally {
    store.close();
  }
  console.log("\n  Note: a queue that is empty while your contacts are online is the normal, healthy state —");
  console.log("  messages only sit here until the recipient's device collects them.");
  return 0;
}

/**
 * `--show-code-json`: same data as `--show-code`, as machine-readable JSON on stdout instead of a
 * terminal QR + human text. For a GUI (e.g. the menu-bar app in mac/MenuBarApp/) that wants to
 * render its own QR image and doesn't want to re-implement `buildConnectionString`'s format by
 * hand — parsing this is the one source of truth for what a valid connection string looks like.
 */
function showCodeJson(dataDir: string): number {
  if (!fs.existsSync(IDENTITY_PATH)) {
    console.log(JSON.stringify({ error: "not-set-up" }));
    return 1;
  }
  const { identity } = loadOrCreateIdentity(IDENTITY_PATH);
  const onion = readOnionAddress(dataDir);
  if (!onion) {
    console.log(JSON.stringify({ error: "not-published-yet" }));
    return 1;
  }
  console.log(JSON.stringify({ connectionString: buildConnectionString(onion, identity.authToken) }));
  return 0;
}

/**
 * `--status-json`: same data as `--status`, as machine-readable JSON on stdout — see
 * `showCodeJson`'s doc comment for why a GUI needs this instead of scraping the human-formatted
 * text. `queue` is `null` only when the relay has never stored anything yet (no database file).
 */
function showStatusJson(dataDir: string): number {
  if (!fs.existsSync(IDENTITY_PATH)) {
    console.log(JSON.stringify({ error: "not-set-up" }));
    return 1;
  }
  const { identity } = loadOrCreateIdentity(IDENTITY_PATH);
  const onion = readOnionAddress(dataDir);

  if (!fs.existsSync(DB_PATH)) {
    console.log(JSON.stringify({ onion, ttlHours: identity.ttlHours, queue: null }));
    return 0;
  }
  const store = new BlobStore(DB_PATH, identity.ttlHours);
  try {
    console.log(JSON.stringify({ onion, ttlHours: identity.ttlHours, queue: store.stats() }));
  } finally {
    store.close();
  }
  return 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataDir = path.dirname(IDENTITY_PATH);

  // Read-only subcommands: never start a server, never spawn Tor, safe to run while the real
  // relay is running in the background.
  if (args.showCode) {
    process.exit(showCode(dataDir));
  }
  if (args.status) {
    process.exit(showStatus(dataDir));
  }
  if (args.showCodeJson) {
    process.exit(showCodeJson(dataDir));
  }
  if (args.statusJson) {
    process.exit(showStatusJson(dataDir));
  }

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
  // (see torDownload.ts) — but only if the user hasn't already pointed us at a specific tor
  // binary, either via --tor-exe or TOR_EXE_PATH; an explicit override always wins and is never
  // touched. Also skipped if `tor` is already reachable (e.g. installed via `brew install tor`)
  // — resolveTorExePath below falls back to a bare `tor` on PATH in that case.
  const bundledTorDir = path.join(__dirname, "..", "mac", "tor");
  if (!args.torExe && !process.env.TOR_EXE_PATH && !fs.existsSync(path.join(bundledTorDir, "tor"))) {
    await ensureTorBinaryMac(bundledTorDir).catch(() => {
      // ensureTorBinaryMac already printed the reason and a manual fallback — resolveTorExePath()
      // below still gets a chance to find a bare `tor` on PATH before giving up.
    });
  }

  const torExePath = resolveTorExePath(args.torExe);
  console.log(`[tor] starting ${torExePath} …`);
  const spawnTor = () => startTor({ torExePath, dataDir, localPort: PORT });
  let tor = spawnTor();
  tor.proc.on("error", (err) => {
    console.error(`[tor] failed to start: ${err.message}`);
    console.error("[tor] see mac/README.md — tor must be on PATH (e.g. `brew install tor`), at mac/tor/tor, or set via --tor-exe / TOR_EXE_PATH.");
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
  const attachTorOutput = (handle: { proc: { stdout?: unknown; stderr?: unknown } }) => {
    (handle.proc as any).stdout?.on("data", captureTorOutput);
    (handle.proc as any).stderr?.on("data", captureTorOutput);
  };
  attachTorOutput(tor);

  console.log("[tor] waiting for the hidden service to publish (usually 10-30s, can take longer on first run) …");
  let onion: string;
  try {
    onion = await waitForHostname(tor.hostnamePath, 60_000, tor.proc, torLogTail);
  } catch (err) {
    console.error(`[tor] ${(err as Error).message}`);
    process.exit(1);
    return;
  }

  // Only supervise once the first start actually succeeded — before that, an exit is a
  // configuration failure worth surfacing immediately (handled above), not something to retry.
  const supervisor = keepTorAlive({
    initial: tor,
    respawn: spawnTor,
    attachOutput: attachTorOutput,
    log: (message) => console.log(message),
  });

  const connectionString = buildConnectionString(onion, identity.authToken);
  console.log(`\n[tor] hidden service ready: ${onion}\n`);
  printCredentials(connectionString, { keepOpenHint: true });

  // Periodic heartbeat: proves the relay is alive even during a long quiet stretch, and surfaces
  // a queue that is filling up without being collected. Deliberately infrequent — the per-message
  // activity log (see relayEventLog.ts) already covers everything that actually happens.
  const startedAt = Date.now();
  const HEARTBEAT_MS = 30 * 60 * 1000;
  setInterval(() => {
    console.log(`[relay] alive ${formatUptime(startedAt)} · ${formatQueueSnapshot(store.stats())}`);
  }, HEARTBEAT_MS).unref();

  const shutdown = () => {
    console.log("\n[shutdown] stopping…");
    supervisor.stop();
    supervisor.handle().proc.kill();
    store.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function printCredentials(connectionString: string, opts: { keepOpenHint: boolean }) {
  console.log("Scan this in the app under Settings -> Relay -> Scan QR code:\n");
  qrcode.generate(connectionString, { small: true }, (qr: string) => console.log(qr));
  console.log("Or paste this into Settings -> Relay -> Connection string:\n");
  console.log(`  ${connectionString}\n`);
  if (opts.keepOpenHint) {
    console.log("Keep this window open — closing it stops the relay. Ctrl+C to stop.");
    console.log("To run it in the background instead (survives closing this window), see mac/install-service.command.\n");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
