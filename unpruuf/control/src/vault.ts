import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

/**
 * The vault: everything Control knows (servers, SSH keys, owner codes, licence codes) in ONE file,
 * encrypted with a passphrase. Nothing is stored in clear and nothing leaves this PC.
 *
 *   file    = JSON { v, kdf: {n,r,p,salt}, iv, tag, data }       (all base64)
 *   key     = scrypt(passphrase, salt)  (32 bytes)
 *   cipher  = AES-256-GCM over the JSON text of VaultData; the header is authenticated as AAD
 *
 * Honest limit: whoever has the file AND the passphrase has every key in it. Choose a long passphrase,
 * keep an encrypted backup (Settings → Export backup), and let a second admin hold one.
 */

export type Product = "business" | "safeline" | "press";
export type Profile = "standard" | "high-security" | "offline-tolerant";
export type StoreMode = "disk" | "ram";

export interface ServerRecord {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  /** Hosting company and region as typed by the admin: used for the spread warning. */
  provider: string;
  region: string;
  product: Product;
  profile: Profile;
  store: StoreMode;
  slot: 1 | 2 | 3;
  createdAt: number;
  /** Control's own key for THIS server (OpenSSH format). The password is never stored. */
  sshPrivateKey: string;
  sshPublicKey: string;
  /** "SHA256:…" of the server's host key, pinned when the server was added. */
  hostKey: string;
  installedAt: number | null;
  installedVersion: string | null;
  bundleSha256: string | null;
  /** The write ("owner") code of the server: lets Control unlock it after a restart and export lists. */
  ownerCode: string | null;
  licenseSerial: string | null;
  bridgeText: string;
  passwordLoginDisabled: boolean;
}

export interface LicenseRecord {
  code: string;
  kind: "server" | "app";
  serial: string;
  customer: string;
  /** App licences only: the app edition the code unlocks (standard, pro, client, group). */
  edition: string | null;
  maxNodes: number | null;
  issuedAtMs: number;
  expiresAtMs: number;
  importedAt: number;
  assigned: null | { type: "server"; serverId: string; at: number } | { type: "device"; label: string; at: number };
}

export interface VaultData {
  v: 1;
  company: string;
  createdAt: number;
  servers: ServerRecord[];
  licenses: LicenseRecord[];
}

const KDF = { n: 1 << 15, r: 8, p: 1 };
const MIN_PASSPHRASE = 10;

function deriveKey(passphrase: string, salt: Buffer, n = KDF.n, r = KDF.r, p = KDF.p): Buffer {
  return crypto.scryptSync(passphrase.normalize("NFKC"), salt, 32, { N: n, r, p, maxmem: 128 * 1024 * 1024 });
}

interface VaultFile {
  v: 1;
  kdf: { n: number; r: number; p: number; salt: string };
  iv: string;
  tag: string;
  data: string;
}

function encrypt(data: VaultData, passphrase: string, salt: Buffer): VaultFile {
  const iv = crypto.randomBytes(12);
  const header = { v: 1 as const, kdf: { n: KDF.n, r: KDF.r, p: KDF.p, salt: salt.toString("base64") } };
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(passphrase, salt), iv);
  cipher.setAAD(Buffer.from(JSON.stringify(header)));
  const enc = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  return { ...header, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: enc.toString("base64") };
}

function decrypt(file: VaultFile, passphrase: string): VaultData | null {
  try {
    const salt = Buffer.from(file.kdf.salt, "base64");
    const header = { v: file.v, kdf: file.kdf };
    const key = deriveKey(passphrase, salt, file.kdf.n, file.kdf.r, file.kdf.p);
    const d = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(file.iv, "base64"));
    d.setAAD(Buffer.from(JSON.stringify(header)));
    d.setAuthTag(Buffer.from(file.tag, "base64"));
    const text = Buffer.concat([d.update(Buffer.from(file.data, "base64")), d.final()]).toString("utf8");
    const parsed = JSON.parse(text) as VaultData;
    return parsed.v === 1 ? parsed : null;
  } catch {
    return null;
  }
}

export class Vault {
  private constructor(
    private readonly file: string,
    private passphrase: string,
    private salt: Buffer,
    public data: VaultData,
  ) {}

  static path(dir: string): string {
    return path.join(dir, "vault.enc");
  }

  static exists(dir: string): boolean {
    return fs.existsSync(Vault.path(dir));
  }

  static validatePassphrase(p: string): string | null {
    if (p.length < MIN_PASSPHRASE) return "too-short";
    return null;
  }

  static create(dir: string, passphrase: string, company: string): Vault {
    if (Vault.exists(dir)) throw new Error("vault-exists");
    if (Vault.validatePassphrase(passphrase)) throw new Error("passphrase-too-short");
    fs.mkdirSync(dir, { recursive: true });
    const v = new Vault(Vault.path(dir), passphrase, crypto.randomBytes(16), {
      v: 1, company: company.trim().slice(0, 80), createdAt: Date.now(), servers: [], licenses: [],
    });
    v.save();
    return v;
  }

  /** The unlocked vault, or null for a wrong passphrase or a file that was changed. */
  static open(dir: string, passphrase: string): Vault | null {
    if (!Vault.exists(dir)) return null;
    let file: VaultFile;
    try {
      file = JSON.parse(fs.readFileSync(Vault.path(dir), "utf8"));
    } catch {
      return null;
    }
    const data = decrypt(file, passphrase);
    return data ? new Vault(Vault.path(dir), passphrase, Buffer.from(file.kdf.salt, "base64"), data) : null;
  }

  save(): void {
    const tmp = this.file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(encrypt(this.data, this.passphrase, this.salt)), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  changePassphrase(oldP: string, newP: string): boolean {
    if (oldP !== this.passphrase || Vault.validatePassphrase(newP)) return false;
    this.passphrase = newP;
    this.salt = crypto.randomBytes(16);
    this.save();
    return true;
  }

  /** The encrypted file as it is on disk (for the backup download). */
  exportEncrypted(): Buffer {
    return fs.readFileSync(this.file);
  }
}
