import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { parseNodeListFile } from "../nodeList";
import {
  buildFeedCode, cleanName, ed25519PublicKeyBytes, FeedCode, LIST_SEPARATOR, MAX_PERIOD_HOURS, MIN_PERIOD_HOURS, sealList,
} from "./feedCrypto";

/**
 * Everything the list feed keeps on disk (data/feed/):
 *   feed-config.json  name, period, address seed, signing PUBLIC key, and the content key + signing
 *                     private seed sealed under the admin's passphrase (scrypt + AES-256-GCM)
 *   current-list.txt  the published, encrypted and signed list (what the onion service hands out)
 *
 * Why the split: the server must run unattended, so it keeps the address seed readable. The content
 * key and the signing key are only needed at the moment a list is published, so they stay sealed.
 * Someone who steals the server learns where the feed lives (not who reads it) but can neither read
 * nor forge a list.
 */

export const MIN_PASSPHRASE = 10;
const MAX_LISTS = 20;
const MAX_TOTAL_CHARS = 400_000;

interface FeedConfig {
  v: 1;
  name: string;
  periodHours: number;
  addressSeed: string; // base64url
  signPublicKey: string; // base64url
  salt: string; // base64
  sealed: string; // base64: iv | tag | ciphertext of {contentKey, signSeed}
  createdAt: number;
}

interface Secrets {
  contentKey: Buffer;
  signSeed: Buffer;
}

function sealKey(passphrase: string, salt: Buffer): Buffer {
  return crypto.scryptSync(passphrase, salt, 32);
}

function seal(passphrase: string, salt: Buffer, s: Secrets): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", sealKey(passphrase, salt), iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify({ c: s.contentKey.toString("base64"), s: s.signSeed.toString("base64") }), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

function unseal(passphrase: string, salt: Buffer, sealed: string): Secrets | null {
  try {
    const raw = Buffer.from(sealed, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", sealKey(passphrase, salt), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const j = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8"));
    return { contentKey: Buffer.from(j.c, "base64"), signSeed: Buffer.from(j.s, "base64") };
  } catch {
    return null;
  }
}

export class FeedStore {
  private readonly configPath: string;
  private readonly listPath: string;

  constructor(readonly dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    this.configPath = path.join(dir, "feed-config.json");
    this.listPath = path.join(dir, "current-list.txt");
  }

  isSetUp(): boolean {
    return fs.existsSync(this.configPath);
  }

  private config(): FeedConfig | null {
    try {
      return JSON.parse(fs.readFileSync(this.configPath, "utf8")) as FeedConfig;
    } catch {
      return null;
    }
  }

  /** What the running service needs: name, period and the address seed. Null until set up. */
  runtime(): { name: string; periodHours: number; addressSeed: Buffer } | null {
    const c = this.config();
    return c ? { name: c.name, periodHours: c.periodHours, addressSeed: Buffer.from(c.addressSeed, "base64url") } : null;
  }

  /** Creates the feed: all keys, the sealed secrets, and the code the employees' apps are given. */
  setup(opts: { name: string; periodHours: number; passphrase: string }): FeedCode {
    if (this.isSetUp()) throw new Error("already set up");
    if (opts.passphrase.length < MIN_PASSPHRASE) throw new Error(`passphrase needs at least ${MIN_PASSPHRASE} characters`);
    if (!Number.isInteger(opts.periodHours) || opts.periodHours < MIN_PERIOD_HOURS || opts.periodHours > MAX_PERIOD_HOURS) {
      throw new Error(`period must be ${MIN_PERIOD_HOURS}..${MAX_PERIOD_HOURS} hours`);
    }
    const addressSeed = crypto.randomBytes(32);
    const secrets: Secrets = { contentKey: crypto.randomBytes(32), signSeed: crypto.randomBytes(32) };
    const salt = crypto.randomBytes(16);
    const signPublicKey = ed25519PublicKeyBytes(secrets.signSeed);
    const cfg: FeedConfig = {
      v: 1,
      name: cleanName(opts.name) || "Firma",
      periodHours: opts.periodHours,
      addressSeed: addressSeed.toString("base64url"),
      signPublicKey: signPublicKey.toString("base64url"),
      salt: salt.toString("base64"),
      sealed: seal(opts.passphrase, salt, secrets),
      createdAt: Date.now(),
    };
    fs.writeFileSync(this.configPath, JSON.stringify(cfg, null, 2), { mode: 0o600 });
    return { name: cfg.name, periodHours: cfg.periodHours, addressSeed, contentKey: secrets.contentKey, signPublicKey };
  }

  /** The feed code again (e.g. for a new employee) — needs the passphrase. Null if it is wrong. */
  feedCode(passphrase: string): FeedCode | null {
    const c = this.config();
    if (!c) return null;
    const s = unseal(passphrase, Buffer.from(c.salt, "base64"), c.sealed);
    if (!s) return null;
    return { name: c.name, periodHours: c.periodHours, addressSeed: Buffer.from(c.addressSeed, "base64url"), contentKey: s.contentKey, signPublicKey: Buffer.from(c.signPublicKey, "base64url") };
  }

  feedCodeText(passphrase: string): string | null {
    const f = this.feedCode(passphrase);
    return f ? buildFeedCode(f) : null;
  }

  /**
   * Publishes the company's current node lists. Every entry must be a well-formed node-list file
   * (the file a node server exports). seq goes up by one, so an app never accepts an older list
   * than one it already has. Throws with a message the setup page shows.
   */
  publish(passphrase: string, listFiles: string[]): { seq: number; lists: number } {
    const c = this.config();
    if (!c) throw new Error("not set up");
    const s = unseal(passphrase, Buffer.from(c.salt, "base64"), c.sealed);
    if (!s) throw new Error("wrong passphrase");
    const files = listFiles.map((f) => f.trim()).filter((f) => f.length > 0);
    if (files.length === 0) throw new Error("no list given");
    if (files.length > MAX_LISTS) throw new Error(`at most ${MAX_LISTS} lists`);
    const names = new Set<string>();
    files.forEach((f, i) => {
      const parsed = parseNodeListFile(f);
      if (!parsed) throw new Error(`list ${i + 1} is not a node-list file`);
      if (names.has(parsed.name)) throw new Error(`two lists are called "${parsed.name}" — names must differ`);
      names.add(parsed.name);
    });
    const plaintext = files.join(LIST_SEPARATOR);
    if (plaintext.length > MAX_TOTAL_CHARS) throw new Error("lists are too large");
    const seq = (this.currentSeq() ?? 0) + 1;
    const blob = sealList({ plaintext, contentKey: s.contentKey, signSeed: s.signSeed, seq, issuedAtMs: Date.now() });
    const tmp = this.listPath + ".tmp";
    fs.writeFileSync(tmp, blob, { mode: 0o600 });
    fs.renameSync(tmp, this.listPath);
    return { seq, lists: files.length };
  }

  /** The published list file, exactly as handed out. */
  current(): string | null {
    try {
      return fs.readFileSync(this.listPath, "utf8");
    } catch {
      return null;
    }
  }

  currentSeq(): number | null {
    const m = /^seq: (\d+)$/m.exec(this.current() ?? "");
    return m ? Number(m[1]) : null;
  }

  currentIssuedAt(): number | null {
    const m = /^issued: (\d+)$/m.exec(this.current() ?? "");
    return m ? Number(m[1]) : null;
  }
}
