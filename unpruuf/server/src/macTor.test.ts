import test from "node:test";
import assert from "node:assert/strict";
import { spawn as spawnChild } from "child_process";
import { keepTorAlive, resolveTorExePath } from "./macTor";

/**
 * Only resolveTorExePath is tested here — buildTorrc/startTor/waitForHostname are the exact same
 * shared implementation windowsTor.test.ts already exercises (see torProcess.ts), so re-testing
 * them again through this file's re-export would just be duplicate coverage.
 */

test("resolveTorExePath uses an explicit override before anything else", () => {
  assert.equal(resolveTorExePath("/custom/tor"), "/custom/tor");
});

test("resolveTorExePath uses TOR_EXE_PATH env var when no override is passed", () => {
  const prev = process.env.TOR_EXE_PATH;
  process.env.TOR_EXE_PATH = "/from-env/tor";
  try {
    assert.equal(resolveTorExePath(), "/from-env/tor");
  } finally {
    if (prev === undefined) delete process.env.TOR_EXE_PATH;
    else process.env.TOR_EXE_PATH = prev;
  }
});

test("resolveTorExePath falls back to bare 'tor' on PATH when nothing is bundled or overridden", () => {
  assert.equal(resolveTorExePath(), "tor");
});


test("keepTorAlive restarts a Tor process that dies after a successful start", async () => {
  // The gap this closes: before the watchdog, a Tor that died *after* publishing its hostname was
  // invisible — the relay kept running and logging nothing while its advertised onion was
  // silently unreachable. A short-lived real child process exercises the restart wiring itself.
  const logs: string[] = [];
  let spawnCount = 0;
  const makeHandle = () => {
    spawnCount += 1;
    return {
      proc: spawnChild(process.execPath, ["-e", "setTimeout(() => process.exit(3), 30)"]),
      hostnamePath: "/nonexistent",
    };
  };

  const supervisor = keepTorAlive({
    initial: makeHandle(),
    respawn: makeHandle,
    attachOutput: () => {},
    log: (message) => logs.push(message),
    restartDelayMs: 20,
    maxRestarts: 3,
  });

  await new Promise((resolve) => setTimeout(resolve, 250));
  supervisor.stop();
  supervisor.handle().proc.kill();

  assert.ok(spawnCount >= 2, `expected at least one restart, saw ${spawnCount} spawn(s)`);
  assert.ok(logs.some((l) => l.includes("restarting")), `no restart logged:\n${logs.join("\n")}`);
});

test("keepTorAlive gives up after maxRestarts rather than looping forever", async () => {
  // A Tor that dies instantly and repeatedly is a configuration problem, not a transient one —
  // retrying it forever would fill the operator's log with noise instead of surfacing the cause.
  const logs: string[] = [];
  let spawnCount = 0;
  const makeHandle = () => {
    spawnCount += 1;
    return {
      proc: spawnChild(process.execPath, ["-e", "process.exit(3)"]),
      hostnamePath: "/nonexistent",
    };
  };

  const supervisor = keepTorAlive({
    initial: makeHandle(),
    respawn: makeHandle,
    attachOutput: () => {},
    log: (message) => logs.push(message),
    restartDelayMs: 10,
    maxRestarts: 2,
  });

  await new Promise((resolve) => setTimeout(resolve, 400));
  supervisor.stop();

  assert.ok(logs.some((l) => l.includes("giving up")), `never gave up:\n${logs.join("\n")}`);
  assert.ok(spawnCount <= 4, `restarted too many times: ${spawnCount}`);
});

test("keepTorAlive stops restarting once stop() is called", async () => {
  // Shutdown path: Ctrl+C kills Tor deliberately, and the watchdog must not fight that by
  // bringing it straight back up.
  let spawnCount = 0;
  const makeHandle = () => {
    spawnCount += 1;
    return {
      proc: spawnChild(process.execPath, ["-e", "setTimeout(() => process.exit(0), 5000)"]),
      hostnamePath: "/nonexistent",
    };
  };

  const supervisor = keepTorAlive({
    initial: makeHandle(),
    respawn: makeHandle,
    attachOutput: () => {},
    log: () => {},
    restartDelayMs: 10,
  });

  supervisor.stop();
  supervisor.handle().proc.kill();
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(spawnCount, 1, "a deliberate shutdown must not trigger a restart");
});
