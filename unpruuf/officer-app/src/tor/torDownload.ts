import * as https from "https";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import { createHash } from "crypto";

/**
 * Downloads and installs the Tor Project's official Expert Bundle on first run — same mechanism
 * and same pinned version as `server/src/torDownload.ts` (kept as a separate copy rather than a
 * shared package: this project doesn't have a shared module between `server/` and `officer-app/`
 * — see CROSS_PLATFORM_PLAN.md's "no shared code between the two runtimes" precedent for why
 * that's the accepted norm here, not an oversight).
 *
 * Officer-app only ever needs Tor as an outbound SOCKS client (reach the relay's onion address)
 * — never a hidden service — so unlike `server/`'s copy this only ever needs ONE binary layout
 * per platform, no separate "verified onion" concerns. Windows and macOS are the real targets;
 * Linux is included too because this is also what a development/CI environment without Docker
 * needs, and the Tor Project publishes that Expert Bundle too.
 */

const TOR_EXPERT_BUNDLE_VERSION = "15.0.19";

/**
 * SHA-256 of every Tor Expert Bundle this program may download, pinned in the source. Taken from
 * the Tor Project's `sha256sums-signed-build.txt` for 15.0.19 (archive.torproject.org) whose
 * detached signature `.asc` verified against the "Tor Browser Developers (signing key)", primary
 * fingerprint EF6E 286D DA85 EA2A 4BA7 DE68 4E2C 6E87 9329 8290, on 2026-10-14. The archive is
 * hashed after the download and BEFORE anything is extracted or run; a different hash aborts.
 * Changing TOR_EXPERT_BUNDLE_VERSION means pinning new hashes, in the same commit.
 */
const TOR_EXPERT_BUNDLE_SHA256: Record<string, string> = {
  "windows-x86_64": "6ac067402c7b4a3dc37887ed3754b3914b67fdc220c966190683e9ccf91abf0f",
  "linux-x86_64": "5a8f19f5f119b5fa2a8fd799a3a532e3236ad36164241800d6302e32f0e1c2a9",
  "macos-x86_64": "95243f76bcf05d6179d017c3f3e4ece7b53cc58dff1ba617b03a2fe2c8298b5b",
  "macos-aarch64": "c99cf6f69740a443c7fffaf598ceb0952b3914041507c8afe11bed84a3333eb1",
};

/** The pinned hash for [platform]-[arch], or null for a combination that is not pinned. */
export function pinnedTorSha256(platform: string, arch: string): string | null {
  return TOR_EXPERT_BUNDLE_SHA256[`${platform}-${arch}`] ?? null;
}

/** Throws unless the file at [archivePath] has exactly the pinned SHA-256 for [platform]-[arch]. */
export function verifyTorArchive(archivePath: string, platform: string, arch: string): void {
  const expected = pinnedTorSha256(platform, arch);
  if (!expected) {
    throw new Error(`no pinned SHA-256 for tor-expert-bundle-${platform}-${arch}-${TOR_EXPERT_BUNDLE_VERSION}; refusing to run an unchecked download`);
  }
  const actual = createHash("sha256").update(fs.readFileSync(archivePath)).digest("hex");
  if (actual !== expected) {
    throw new Error(`SHA-256 of the downloaded Tor bundle does not match the pinned value (expected ${expected}, got ${actual}); not extracting it`);
  }
}

export type TorPlatform = "windows" | "macos" | "linux";

function torExpertBundleUrl(platform: TorPlatform, arch: string): string {
  return (
    `https://archive.torproject.org/tor-package-archive/torbrowser/${TOR_EXPERT_BUNDLE_VERSION}/` +
    `tor-expert-bundle-${platform}-${arch}-${TOR_EXPERT_BUNDLE_VERSION}.tar.gz`
  );
}

function currentPlatformAndArch(): { platform: TorPlatform; arch: string; exeName: string } {
  if (process.platform === "win32") return { platform: "windows", arch: "x86_64", exeName: "tor.exe" };
  if (process.platform === "darwin") return { platform: "macos", arch: process.arch === "arm64" ? "aarch64" : "x86_64", exeName: "tor" };
  return { platform: "linux", arch: process.arch === "arm64" ? "aarch64" : "x86_64", exeName: "tor" };
}

/** Returns the path to the `tor`/`tor.exe` binary inside [targetDir], downloading+installing it
 *  there first if missing. Mirrors `server/src/torDownload.ts`'s `ensureTorBinary`/
 *  `ensureTorBinaryMac`, generalized to all three platforms since officer-app runs on whichever
 *  machine the compliance officer's laptop happens to be. */
export async function ensureTorBinary(targetDir: string): Promise<string> {
  const { platform, arch, exeName } = currentPlatformAndArch();
  const targetExe = path.join(targetDir, exeName);
  if (fs.existsSync(targetExe)) return targetExe;

  const url = torExpertBundleUrl(platform, arch);
  console.log(`[tor] ${exeName} not found — downloading the official Tor Expert Bundle (one-time, ~30-50 MB)...`);
  console.log(`[tor] source: ${url}`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "unpruuf-officer-tor-"));
  try {
    const archivePath = path.join(tmpDir, "tor-expert-bundle.tar.gz");
    await downloadFile(url, archivePath);
    verifyTorArchive(archivePath, platform, arch);
    console.log("[tor] SHA-256 matches the pinned value");

    console.log("[tor] extracting...");
    execFileSync("tar", ["-xzf", archivePath, "-C", tmpDir]);

    // Real bug found running this for the first time (2026-09-26): the bundle also ships a
    // `debug/` directory with its own same-named, full-debug-symbols `tor` binary (`tor -tzf`
    // confirms both `tor/tor` and `debug/tor` exist) — a blind recursive search can match
    // `debug/tor` first depending on directory read order ("debug" sorts before "tor"
    // alphabetically), silently copying the wrong build (12.5MB debug binary + its own,
    // differently-linked libs instead of the intended `tor/` directory's release build) —
    // confirmed by hash-comparing the two and finding the debug one fails to execute at all
    // ("Exec format error"), not just assumed slower/bigger. The real release layout's top-level
    // `tor/` directory is always the canonical one; only fall back to a blind search if that
    // exact path is ever missing (e.g. a future bundle reorganizes itself).
    const canonical = path.join(tmpDir, "tor", exeName);
    const foundExe = fs.existsSync(canonical) ? canonical : findFileRecursive(tmpDir, exeName);
    if (!foundExe) {
      throw new Error(`${exeName} not found inside the downloaded bundle — its internal layout may have changed.`);
    }
    const sourceDir = path.dirname(foundExe);
    fs.mkdirSync(targetDir, { recursive: true });
    for (const entry of fs.readdirSync(sourceDir)) {
      fs.cpSync(path.join(sourceDir, entry), path.join(targetDir, entry), { recursive: true });
    }
    if (fs.existsSync(targetExe)) fs.chmodSync(targetExe, 0o755);
    if (process.platform === "darwin") {
      adHocSignAllMachOFiles(targetDir);
    }
    console.log(`[tor] installed to ${targetDir}\n`);
    return targetExe;
  } catch (err) {
    const message = (err as Error).message;
    console.error(`[tor] automatic download failed: ${message}`);
    console.error("[tor] you can still install it by hand:");
    console.error(`[tor]   1. download ${url}`);
    console.error(`[tor]   2. extract it so ${exeName} ends up at: ${targetExe}`);
    throw err;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** Same real bug/fix as `server/src/torDownload.ts` — see that file's doc comment: every Mach-O
 *  file in the Expert Bundle needs an ad-hoc code signature on Apple Silicon or the kernel/dyld
 *  refuses to run or load it (confirmed on real hardware in that project, not assumed here). */
function adHocSignAllMachOFiles(dir: string): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      adHocSignAllMachOFiles(full);
      continue;
    }
    const isDylib = entry.name.endsWith(".dylib");
    const isExecutable = (fs.statSync(full).mode & 0o111) !== 0;
    if (!isDylib && !isExecutable) continue;
    try {
      execFileSync("codesign", ["--sign", "-", "--force", full]);
    } catch (signError) {
      console.error(`[tor] warning: could not ad-hoc code-sign ${full}: ${(signError as Error).message}`);
      console.error(`[tor] if macOS refuses to run/load it, sign it by hand: codesign --sign - --force "${full}"`);
    }
  }
}

function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const cleanupAndReject = (err: Error) => {
      file.close();
      fs.unlink(destPath, () => reject(err));
    };
    https
      .get(url, (response) => {
        if (
          response.statusCode &&
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          file.close();
          fs.unlink(destPath, () => {
            downloadFile(response.headers.location!, destPath).then(resolve, reject);
          });
          return;
        }
        if (response.statusCode !== 200) {
          cleanupAndReject(new Error(`HTTP ${response.statusCode} — the Tor Project may have moved/retired this version`));
          return;
        }
        response.pipe(file);
        file.on("finish", () => file.close(() => resolve()));
      })
      .on("error", cleanupAndReject);
  });
}

export function findFileRecursive(dir: string, filename: string): string | null {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFileRecursive(full, filename);
      if (found) return found;
    } else if (entry.name.toLowerCase() === filename.toLowerCase()) {
      return full;
    }
  }
  return null;
}
