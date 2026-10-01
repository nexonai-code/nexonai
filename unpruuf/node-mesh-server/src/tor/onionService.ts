import * as path from "path";
import { ensureTorBinary } from "./torDownload";
import { TorControl } from "./torControl";
import { startTorProcess, TorProcessHandle, waitForControlPort, watchTorLog } from "./torProcess";

/**
 * The node's own Tor onion service, fully managed by this process — the operator never touches
 * Tor, a torrc, or a hidden-service directory. What this guarantees:
 *
 *  - Mandatory: the public API (/deposit, /fetch, /fetchMany) is bound to 127.0.0.1 and only
 *    reachable from outside through this onion service. "The node never learns a sender IP" is
 *    therefore structural (Tor never hands one over), not a logging policy.
 *  - Stable address: the onion key is persisted by the caller (see nodeIdentity.ts) and reused on
 *    every start, so restarts and the staggered Reset never change the node's address
 *    (NODE_MESH_SPEC.md §5).
 *  - Sealed keys: when the caller keeps the node keys encrypted under the owner secret, the
 *    service starts LOCKED — only a control onion is published until [unlock] hands the keys
 *    over (after the owner app proved the secret).
 *  - Temp Node: the key is kept in process memory only and handed to Tor over the control port —
 *    it is never written to disk by this code or by Tor (no HiddenServiceDir).
 *  - Tor's own proof-of-work DoS defense is always on for the service.
 *  - Self-healing: if Tor dies or the control connection drops, Tor is restarted with backoff and
 *    the same key re-added, so the address comes back unchanged.
 */

export type OnionState = "starting" | "bootstrapping" | "ready" | "restarting" | "failed" | "stopped";

export interface OnionStatus {
  state: OnionState;
  bootstrapPercent: number;
  /** First node's address — the one shown in the owner QR. */
  onionAddress: string | null;
  /** Every node's address, index = node number. Empty until Tor has registered them — and
   *  while a sealed server is locked (see nodeIdentity.ts). */
  onionAddresses: string[];
  /** Sealed mode: the control onion, the only address published while locked. */
  controlAddress: string | null;
  /** True while node onions are held back until the owner unlocks the server. */
  locked: boolean;
  restarts: number;
  lastError: string | null;
  powEnabled: boolean;
}

export interface OnionServiceOptions {
  /** Directory for Tor's DataDirectory + torrc (a temp dir for a Temp Node). */
  workDir: string;
  /** Where the Tor Expert Bundle gets installed if TOR_EXE_PATH isn't set. */
  torBinDir: string;
  /** Local port of the public API that the onion's virtual port 80 maps to. */
  localPort: number;
  /** One entry per node: its persisted onion key (`ED25519-V3:...`), or null to generate one.
   *  Ignored while [locked] — then [unlock] hands over the keys later. */
  privateKeys: Array<string | null>;
  /** Called once per newly generated key — persist it (or, for a Temp Node, don't). */
  onNewKey: (index: number, privateKey: string) => void;
  /** Sealed mode: publish a control onion (persisted key, or null to create one) that stays up
   *  even while the node onions are locked. Undefined = no control onion. */
  controlKey?: string | null;
  onNewControlKey?: (privateKey: string) => void;
  /** Start with node onions held back until [NodeOnionService.unlock]. */
  locked?: boolean;
  pow: { queueRate: number; queueBurst: number };
  log?: (line: string) => void;
}

const MAX_BACKOFF_MS = 60_000;
const STABLE_RESET_MS = 10 * 60_000;

export class NodeOnionService {
  private status: OnionStatus;
  private proc: TorProcessHandle | null = null;
  private control: TorControl | null = null;
  private privateKeys: Array<string | null>;
  private serviceIds: string[] = [];
  private controlKey: string | null | undefined;
  private controlServiceId: string | null = null;
  private locked: boolean;
  private stopping = false;
  private backoffMs = 2_000;
  private restartTimer: NodeJS.Timeout | null = null;
  private lastStartAt = 0;
  private readonly log: (line: string) => void;

  constructor(private readonly opts: OnionServiceOptions) {
    this.privateKeys = [...opts.privateKeys];
    this.controlKey = opts.controlKey;
    this.locked = opts.locked ?? false;
    this.log = opts.log ?? ((l) => console.log(l));
    this.status = {
      state: "starting",
      bootstrapPercent: 0,
      onionAddress: null,
      onionAddresses: [],
      controlAddress: null,
      locked: this.locked,
      restarts: 0,
      lastError: null,
      powEnabled: true,
    };
  }

  getStatus(): OnionStatus {
    return { ...this.status };
  }

  /** Starts Tor and publishes the onion. Resolves as soon as the address is known — publishing
   *  to the Tor network continues in the background (see status.bootstrapPercent). */
  async start(): Promise<string> {
    const torExePath = process.env.TOR_EXE_PATH ?? (await ensureTorBinary(this.opts.torBinDir));
    return this.launch(torExePath);
  }

  private async launch(torExePath: string): Promise<string> {
    this.lastStartAt = Date.now();
    this.status.bootstrapPercent = 0;
    const handle = startTorProcess({ torExePath, workDir: this.opts.workDir });
    this.proc = handle;
    watchTorLog(
      handle,
      (pct) => {
        this.status.bootstrapPercent = pct;
        if (pct >= 100) {
          this.status.state = "ready";
          this.log(`[tor] bootstrapped 100% — onion service reachable at ${this.status.onionAddress}`);
        } else if (this.status.state !== "ready") {
          this.status.state = "bootstrapping";
          this.log(`[tor] bootstrapping ${pct}%`);
        }
      },
      (line) => {
        if (/\[(warn|err)\]/.test(line) && !/running Tor as root/.test(line)) this.log(`[tor] ${line}`);
      },
    );
    handle.proc.once("exit", (code, signal) => {
      if (this.stopping) return;
      this.onUnexpectedLoss(`tor process exited (${signal ?? `code ${code}`})`, torExePath);
    });

    try {
      const controlPort = await waitForControlPort(handle);
      const control = await TorControl.connect(controlPort);
      await control.authenticateWithCookie(handle.cookiePath);
      if (this.controlKey !== undefined) {
        const { serviceId, privateKey } = await control.addOnion({
          privateKey: this.controlKey,
          localPort: this.opts.localPort,
          pow: this.opts.pow,
        });
        if (!this.controlKey) {
          this.controlKey = privateKey;
          this.opts.onNewControlKey?.(privateKey);
        }
        this.controlServiceId = serviceId;
        this.status.controlAddress = `${serviceId}.onion`;
      }
      this.control = control;
      if (!this.locked) await this.publishNodes(control);
      if (this.status.state !== "ready") this.status.state = "bootstrapping";
      this.status.lastError = null;
      control.onClose(() => {
        if (this.stopping || this.control !== control) return;
        this.onUnexpectedLoss("tor control connection closed", torExePath);
      });
      return (this.status.onionAddress ?? this.status.controlAddress)!;
    } catch (err) {
      this.status.lastError = (err as Error).message;
      handle.proc.kill();
      throw err;
    }
  }

  private async publishNodes(control: TorControl): Promise<void> {
    const serviceIds: string[] = [];
    for (let i = 0; i < this.privateKeys.length; i++) {
      const { serviceId, privateKey } = await control.addOnion({
        privateKey: this.privateKeys[i],
        localPort: this.opts.localPort,
        pow: this.opts.pow,
      });
      if (!this.privateKeys[i]) {
        this.privateKeys[i] = privateKey;
        this.opts.onNewKey(i, privateKey);
      }
      serviceIds.push(serviceId);
    }
    this.serviceIds = serviceIds;
    this.status.onionAddresses = serviceIds.map((id) => `${id}.onion`);
    this.status.onionAddress = this.status.onionAddresses[0] ?? null;
  }

  /**
   * Sealed mode: the owner just proved the secret (POST /unlock) — publish the node onions with
   * [keys] (unsealed from disk; a null slot gets a new key). If Tor isn't connected right now,
   * the next (re)start publishes them. Resolves with every node address once published.
   */
  async unlock(keys: Array<string | null>): Promise<string[]> {
    if (!this.locked) return this.status.onionAddresses;
    this.privateKeys = keys;
    this.locked = false;
    this.status.locked = false;
    const control = this.control;
    if (control && !control.isClosed) await this.publishNodes(control);
    return this.status.onionAddresses;
  }

  private onUnexpectedLoss(reason: string, torExePath: string): void {
    if (this.restartTimer || this.stopping) return;
    this.status.state = "restarting";
    this.status.lastError = reason;
    this.control?.close();
    this.control = null;
    this.proc?.proc.kill();
    this.proc = null;
    if (Date.now() - this.lastStartAt > STABLE_RESET_MS) this.backoffMs = 2_000;
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
    this.log(`[tor] ${reason} — restarting in ${Math.round(delay / 1000)}s (same key, same address)`);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.status.restarts += 1;
      this.launch(torExePath).catch((err) => {
        this.log(`[tor] restart failed: ${(err as Error).message}`);
        this.onUnexpectedLoss(`restart failed: ${(err as Error).message}`, torExePath);
      });
    }, delay);
  }

  /**
   * Part of the staggered Reset (NODE_MESH_SPEC.md §5): connection hygiene only. Confirms Tor
   * still has every node's onion registered and re-adds any missing one (same key → same
   * address). Never touches message data, rate-limit counters, or any address.
   */
  async hygiene(): Promise<string> {
    const control = this.control;
    if (!control || control.isClosed || (this.serviceIds.length === 0 && !this.controlServiceId)) return "tor not connected — self-healing restart handles it";
    const current = new Set((await control.getInfo("onions/current")).split(/\s+/));
    let readded = 0;
    if (this.controlServiceId && this.controlKey && !current.has(this.controlServiceId)) {
      await control.addOnion({ privateKey: this.controlKey, localPort: this.opts.localPort, pow: this.opts.pow });
      readded++;
    }
    for (let i = 0; i < this.serviceIds.length; i++) {
      if (current.has(this.serviceIds[i])) continue;
      await control.addOnion({ privateKey: this.privateKeys[i], localPort: this.opts.localPort, pow: this.opts.pow });
      readded++;
    }
    const total = this.serviceIds.length + (this.controlServiceId ? 1 : 0);
    if (this.locked) return `locked — only the control onion is published (${readded ? "re-added" : "registered"})`;
    return readded === 0
      ? `${total} onion service(s) registered`
      : `${readded} of ${total} onion service(s) were missing — re-added with the same key`;
  }

  stop(): void {
    this.stopping = true;
    this.status.state = "stopped";
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.control?.close();
    this.proc?.proc.kill();
  }
}

export function defaultTorBinDir(packageRoot: string): string {
  return path.join(packageRoot, "tor-bin");
}
