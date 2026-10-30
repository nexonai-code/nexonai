import { ensureTorBinary } from "../tor/torDownload";
import { TorControl } from "../tor/torControl";
import { startTorProcess, TorProcessHandle, waitForControlPort, watchTorLog } from "../tor/torProcess";
import { activeEpochs, deriveEpochKey, epochOf } from "./feedCrypto";

/**
 * The feed's onion service. Unlike a node (one fixed address for good), this one MOVES: every
 * period the address is a different one, derived from the address seed (feedCrypto.ts). Each minute
 * it compares the epochs that must be online (the current one, the next one shortly before the
 * switch, the previous one shortly after) with what Tor has published, adds what is missing and
 * takes the rest offline. So at any moment one to two addresses are alive, and an address that
 * leaked is dead a few hours later.
 *
 * Self-healing like the node service: if Tor dies, it is restarted and the right epochs come back.
 */

export interface FeedOnionStatus {
  state: "starting" | "bootstrapping" | "ready" | "restarting" | "failed" | "stopped";
  bootstrapPercent: number;
  /** The address the apps are looking for right now. */
  currentAddress: string | null;
  /** When it moves on (ms since epoch). */
  nextSwitchAt: number | null;
  /** Every address Tor currently has published for the feed. */
  published: string[];
  lastError: string | null;
}

/** The slice of the Tor control connection the feed uses — also what the tests fake. */
export interface OnionControl {
  readonly isClosed: boolean;
  addOnion(opts: { privateKey: string | null; localPort: number; pow: { queueRate: number; queueBurst: number } | null }): Promise<{ serviceId: string; privateKey: string }>;
  delOnion(serviceId: string): Promise<void>;
}

export interface FeedOnionOptions {
  workDir: string;
  torBinDir: string;
  localPort: number;
  addressSeed: Buffer;
  periodHours: number;
  pow: { queueRate: number; queueBurst: number };
  log?: (line: string) => void;
  now?: () => number;
}

const TICK_MS = 60_000;
const MAX_BACKOFF_MS = 60_000;

export class FeedOnionService {
  private proc: TorProcessHandle | null = null;
  private control: OnionControl | null = null;
  private published = new Map<number, string>(); // epoch -> service id
  private timer: NodeJS.Timeout | null = null;
  private stopping = false;
  private backoffMs = 2_000;
  private status: FeedOnionStatus = { state: "starting", bootstrapPercent: 0, currentAddress: null, nextSwitchAt: null, published: [], lastError: null };
  private readonly log: (line: string) => void;
  private readonly now: () => number;

  constructor(private readonly opts: FeedOnionOptions) {
    this.log = opts.log ?? ((l) => console.log(l));
    this.now = opts.now ?? Date.now;
  }

  getStatus(): FeedOnionStatus {
    return { ...this.status, published: [...this.status.published] };
  }

  async start(): Promise<void> {
    const torExePath = process.env.TOR_EXE_PATH ?? (await ensureTorBinary(this.opts.torBinDir));
    await this.launch(torExePath);
    this.timer = setInterval(() => void this.tick().catch((e) => this.log(`[feed] tick failed: ${(e as Error).message}`)), TICK_MS);
    this.timer.unref();
  }

  private async launch(torExePath: string): Promise<void> {
    const handle = startTorProcess({ torExePath, workDir: this.opts.workDir });
    this.proc = handle;
    watchTorLog(
      handle,
      (pct) => {
        this.status.bootstrapPercent = pct;
        this.status.state = pct >= 100 ? "ready" : "bootstrapping";
      },
      (line) => {
        if (/\[(warn|err)\]/.test(line) && !/running Tor as root/.test(line)) this.log(`[tor] ${line}`);
      },
    );
    handle.proc.once("exit", (code, signal) => {
      if (!this.stopping) this.lose(`tor process exited (${signal ?? `code ${code}`})`, torExePath);
    });
    try {
      const control = await TorControl.connect(await waitForControlPort(handle));
      await control.authenticateWithCookie(handle.cookiePath);
      this.useControl(control);
      control.onClose(() => {
        if (!this.stopping && this.control === control) this.lose("tor control connection closed", torExePath);
      });
      await this.tick();
      if (this.status.state !== "ready") this.status.state = "bootstrapping";
      this.status.lastError = null;
    } catch (err) {
      this.status.lastError = (err as Error).message;
      handle.proc.kill();
      throw err;
    }
  }

  /** Attaches a control connection (what [start] does after connecting; the tests pass a fake). */
  useControl(control: OnionControl): void {
    this.control = control;
    this.published.clear();
  }

  /** One pass: bring Tor's published addresses in line with the epochs that must be online. */
  async tick(): Promise<void> {
    const control = this.control;
    if (!control || control.isClosed) return;
    const nowMs = this.now();
    const want = activeEpochs(nowMs, this.opts.periodHours);
    for (const epoch of want) {
      if (this.published.has(epoch)) continue;
      const k = deriveEpochKey(this.opts.addressSeed, epoch);
      const { serviceId } = await control.addOnion({ privateKey: k.torPrivateKey, localPort: this.opts.localPort, pow: this.opts.pow });
      if (`${serviceId}.onion` !== k.address) {
        // Tor derived a different address from the key: the two sides would never meet. Never happens with a correct key blob.
        throw new Error(`Tor published ${serviceId}.onion, expected ${k.address} — the key format does not match this Tor version`);
      }
      this.published.set(epoch, serviceId);
      this.log(`[feed] address for period ${epoch} is online (${want.length} active)`);
    }
    for (const [epoch, serviceId] of [...this.published]) {
      if (want.includes(epoch)) continue;
      await control.delOnion(serviceId).catch(() => undefined);
      this.published.delete(epoch);
      this.log(`[feed] address of period ${epoch} taken offline`);
    }
    const cur = epochOf(nowMs, this.opts.periodHours);
    this.status.currentAddress = deriveEpochKey(this.opts.addressSeed, cur).address;
    this.status.nextSwitchAt = (cur + 1) * this.opts.periodHours * 3_600_000;
    this.status.published = [...this.published.values()].map((id) => `${id}.onion`);
  }

  private lose(reason: string, torExePath: string): void {
    if (this.stopping) return;
    this.status.state = "restarting";
    this.status.lastError = reason;
    (this.control as unknown as { close?: () => void } | null)?.close?.();
    this.control = null;
    this.proc?.proc.kill();
    this.proc = null;
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
    this.log(`[tor] ${reason} — restarting in ${Math.round(delay / 1000)}s`);
    setTimeout(() => {
      if (this.stopping) return;
      this.launch(torExePath).then(() => (this.backoffMs = 2_000)).catch((err) => this.lose(`restart failed: ${(err as Error).message}`, torExePath));
    }, delay).unref();
  }

  stop(): void {
    this.stopping = true;
    this.status.state = "stopped";
    if (this.timer) clearInterval(this.timer);
    (this.control as unknown as { close?: () => void } | null)?.close?.();
    this.proc?.proc.kill();
  }
}
