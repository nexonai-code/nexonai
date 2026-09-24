import * as https from "https";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";

/**
 * Downloads and installs the Tor Project's official Expert Bundle into `windows/tor/` or
 * `mac/tor/` on first run, so nobody has to manually find/download/extract it themselves. The
 * Expert Bundle is real and still maintained, but easy to miss on torproject.org/download/tor/ —
 * it's a small technical table buried below the much more prominent Tor Browser download button
 * (this is a known point of confusion, not specific to us — see the Tor Project forum thread
 * "Downloading Tor Expert Bundle for Windows (x86_64)").
 *
 * Deliberately NOT bundled directly in this repo/ZIP (see windowsTor.ts's/macTor.ts's
 * `resolveTorExePath` doc comments) — fetched fresh from the Tor Project's own archive whenever
 * it's missing, so it's always the genuine current binary rather than something we'd have to
 * keep re-distributing and ourselves vouch for.
 *
 * Extraction shells out to the platform's own built-in `tar` (Windows' `tar.exe`, present since
 * Windows 10 1803 / all of Windows 11; macOS's BSD `tar`, present on every macOS version this app
 * targets) rather than adding a new npm dependency just to unpack one `.tar.gz` file.
 */

const TOR_EXPERT_BUNDLE_VERSION = "15.0.19";

function torExpertBundleUrl(platform: "windows" | "macos", arch: string): string {
  return (
    `https://archive.torproject.org/tor-package-archive/torbrowser/${TOR_EXPERT_BUNDLE_VERSION}/` +
    `tor-expert-bundle-${platform}-${arch}-${TOR_EXPERT_BUNDLE_VERSION}.tar.gz`
  );
}

const TOR_EXPERT_BUNDLE_URL = torExpertBundleUrl("windows", "x86_64");

/**
 * Shared download+extract logic behind [ensureTorBinary] (Windows) and [ensureTorBinaryMac]
 * (macOS) — the only difference between the two platforms is the binary's filename and which
 * Expert Bundle URL to fetch.
 */
async function ensureTorBinaryGeneric(opts: { targetDir: string; exeName: string; url: string }): Promise<string> {
  const targetExe = path.join(opts.targetDir, opts.exeName);
  if (fs.existsSync(targetExe)) return targetExe;

  console.log(`[tor] ${opts.exeName} not found — downloading the official Tor Expert Bundle (one-time, ~30-50 MB)...`);
  console.log(`[tor] source: ${opts.url}`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "unpruuf-tor-"));
  try {
    const archivePath = path.join(tmpDir, "tor-expert-bundle.tar.gz");
    await downloadFile(opts.url, archivePath);

    console.log("[tor] extracting...");
    execFileSync("tar", ["-xzf", archivePath, "-C", tmpDir]);

    const foundExe = findFileRecursive(tmpDir, opts.exeName);
    if (!foundExe) {
      throw new Error(`${opts.exeName} not found inside the downloaded bundle — its internal layout may have changed.`);
    }
    const sourceDir = path.dirname(foundExe);
    fs.mkdirSync(opts.targetDir, { recursive: true });
    // Regression caught against a real download+extract: the bundle's tor/ folder isn't flat —
    // it also has a pluggable_transports/ subdirectory (obfs4proxy, snowflake-client, ...), which
    // fs.copyFileSync can't handle (EISDIR). fs.cpSync's recursive mode copies files and
    // subdirectories alike.
    for (const entry of fs.readdirSync(sourceDir)) {
      fs.cpSync(path.join(sourceDir, entry), path.join(opts.targetDir, entry), { recursive: true });
    }
    // tar doesn't reliably preserve the executable bit through every extraction path — belt and
    // suspenders, matching what a manual `chmod +x` would do (a no-op on Windows' tor.exe).
    if (fs.existsSync(targetExe)) fs.chmodSync(targetExe, 0o755);
    // Real bug found on real hardware (Apple Silicon Mac, 2026‑08‑29): every Mach-O file in the
    // freshly-downloaded bundle has no code signature at all, and macOS's kernel/dyld refuses to
    // run or load any of them on Apple Silicon. First symptom: `tor` itself got killed outright
    // (`signal SIGKILL`, no log output — only a kernel-level kill, not tor choosing to exit).
    // Signing just `tor` moved the failure one step later, to a *second*, equally real bug:
    // `dyld[...]: Library not loaded: @executable_path/libevent-2.1.7.dylib ... missing code
    // signature` — dyld enforces the same signed-binary requirement on every `.dylib` the main
    // executable loads, not just the executable itself. So every Mach-O file in the extracted
    // bundle needs an ad-hoc signature (`codesign -s -`, no real identity/entitlements needed —
    // just "a signature exists"), not only `tor`. No-op on Windows/Linux, where `codesign`
    // doesn't exist and isn't needed.
    if (process.platform === "darwin") {
      adHocSignAllMachOFiles(opts.targetDir);
    }
    console.log(`[tor] installed to ${opts.targetDir}\n`);
    return targetExe;
  } catch (err) {
    const message = (err as Error).message;
    console.error(`[tor] automatic download failed: ${message}`);
    console.error("[tor] you can still install it by hand:");
    console.error(`[tor]   1. download ${opts.url}`);
    console.error(`[tor]   2. extract it so ${opts.exeName} ends up at: ${targetExe}`);
    throw err;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Ad-hoc code-signs every `.dylib` and every executable file under [dir], recursively — covers
 * `tor` itself, `libevent-2.1.7.dylib` (loaded via `@executable_path`, confirmed to need its own
 * signature too — see the real-bug doc comment above), and any pluggable-transport binaries
 * (`obfs4proxy`, `snowflake-client`, ...) the bundle may also carry under a subdirectory. Best
 * effort: a failure on one file (e.g. a stray non-Mach-O file that happens to be executable) is
 * logged and skipped rather than aborting the whole install.
 */
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

/** Returns the path to tor.exe inside [targetDir], downloading+installing it there first if missing. */
export async function ensureTorBinary(targetDir: string): Promise<string> {
  return ensureTorBinaryGeneric({ targetDir, exeName: "tor.exe", url: TOR_EXPERT_BUNDLE_URL });
}

/**
 * macOS counterpart of [ensureTorBinary] — same mechanism, arch-aware (Apple Silicon vs. Intel)
 * since the Tor Project ships separate Expert Bundles for `aarch64` and `x86_64` macOS.
 */
export async function ensureTorBinaryMac(targetDir: string): Promise<string> {
  const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
  return ensureTorBinaryGeneric({ targetDir, exeName: "tor", url: torExpertBundleUrl("macos", arch) });
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
        // archive.torproject.org can redirect (e.g. to a mirror) — follow one hop.
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
