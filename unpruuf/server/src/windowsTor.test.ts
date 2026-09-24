import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { buildTorrc, resolveTorExePath, startTor, waitForHostname } from "./windowsTor";

test("buildTorrc points the hidden service at 127.0.0.1:<localPort> with SOCKS disabled", () => {
  const torrc = buildTorrc({ hsDir: "/data/hs", torDataDir: "/data/tor", localPort: 8787 });
  assert.match(torrc, /^SocksPort 0$/m);
  assert.match(torrc, /^DataDirectory \/data\/tor$/m);
  assert.match(torrc, /^HiddenServiceDir \/data\/hs$/m);
  assert.match(torrc, /^HiddenServicePort 80 127\.0\.0\.1:8787$/m);
});

test("resolveTorExePath uses an explicit override before anything else", () => {
  assert.equal(resolveTorExePath("C:\\custom\\tor.exe"), "C:\\custom\\tor.exe");
});

test("resolveTorExePath uses TOR_EXE_PATH env var when no override is passed", () => {
  const prev = process.env.TOR_EXE_PATH;
  process.env.TOR_EXE_PATH = "C:\\from-env\\tor.exe";
  try {
    assert.equal(resolveTorExePath(), "C:\\from-env\\tor.exe");
  } finally {
    if (prev === undefined) delete process.env.TOR_EXE_PATH;
    else process.env.TOR_EXE_PATH = prev;
  }
});

test("waitForHostname resolves once the hostname file appears", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tor-hostname-test-"));
  const hostnamePath = path.join(dir, "hostname");
  setTimeout(() => fs.writeFileSync(hostnamePath, "abc123xyz.onion\n"), 200);
  const hostname = await waitForHostname(hostnamePath, 5_000);
  assert.equal(hostname, "abc123xyz.onion");
});

test("waitForHostname rejects if the file never appears within the timeout", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tor-hostname-test-"));
  const hostnamePath = path.join(dir, "never-written");
  await assert.rejects(() => waitForHostname(hostnamePath, 300));
});

test("waitForHostname rejects immediately (not after the full timeout) when the process exits early", async () => {
  // Regression test: caught for real against the actual `tor` binary in this session — a bad
  // torrc made tor exit almost instantly, but waitForHostname had no way to know that and would
  // have sat out the full 60s timeout with a generic, useless error instead of surfacing what
  // actually went wrong. A short-lived real child process (not tor specifically) is enough to
  // exercise the exit-detection wiring itself.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tor-hostname-test-"));
  const hostnamePath = path.join(dir, "never-written");
  const proc = spawn(process.execPath, ["-e", "process.exit(1)"]);
  const logTail = { value: "" };
  const started = Date.now();
  await assert.rejects(
    () => waitForHostname(hostnamePath, 60_000, proc, logTail),
    /exited \(exit code 1\) before publishing a hostname/
  );
  assert.ok(Date.now() - started < 5_000, "should reject almost immediately, not wait out the 60s timeout");
});

test("waitForHostname includes the captured log tail in the rejection when the process exits early", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tor-hostname-test-"));
  const hostnamePath = path.join(dir, "never-written");
  const proc = spawn(process.execPath, ["-e", "process.exit(1)"]);
  const logTail = { value: "Permissions on directory ... are too permissive." };
  await assert.rejects(
    () => waitForHostname(hostnamePath, 60_000, proc, logTail),
    /too permissive/
  );
});

test("startTor creates the hidden-service and data directories restricted to the owner (mode 0700)", { skip: process.platform === "win32" }, () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "tor-start-test-"));
  // Regression test: caught for real against the actual `tor` binary — plain `fs.mkdirSync`
  // (even with a `mode` option) came out 0755 here because of the process umask, and the real
  // tor binary refuses to start against a HiddenServiceDir that permissive ("Permissions on
  // directory ... are too permissive"). Uses a bogus torExePath — this test only checks the
  // directories startTor creates before it ever tries to spawn anything.
  const handle = startTor({ torExePath: "/bin/true", dataDir, localPort: 8787 });
  handle.proc.on("error", () => {}); // /bin/true spawns fine; ignore if it didn't on some platform
  const hsDir = path.join(dataDir, "tor-hidden-service");
  const torDataDir = path.join(dataDir, "tor-data");
  assert.equal(fs.statSync(hsDir).mode & 0o777, 0o700);
  assert.equal(fs.statSync(torDataDir).mode & 0o777, 0o700);
});
