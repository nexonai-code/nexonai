import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { cleanBridgeLine, cleanBridgeLines, MAX_BRIDGE_LINES, readBridgeLines, writeBridgeLines } from "./bridgeLines";

const OBFS4 = "obfs4 203.0.113.9:443 D9A82D2F9C2F65A18407B1D2B764F130847F8B5D cert=bjRaMrr1BRiAW8IE9U5z27fQaYgOhX1UCmOpg2pFpoMvo6ZgQMzLsaTzzQNTlm7hNcb+Sg iat-mode=0";

test("obfs4 and plain IP:port lines are accepted, a leading 'Bridge ' is dropped", () => {
  assert.equal(cleanBridgeLine(OBFS4), OBFS4);
  assert.equal(cleanBridgeLine("Bridge " + OBFS4), OBFS4);
  assert.equal(cleanBridgeLine("bridge " + OBFS4), OBFS4);
  assert.equal(cleanBridgeLine("203.0.113.9:443"), "203.0.113.9:443");
  assert.equal(cleanBridgeLine("203.0.113.9:443 D9A82D2F9C2F65A18407B1D2B764F130847F8B5D"), "203.0.113.9:443 D9A82D2F9C2F65A18407B1D2B764F130847F8B5D");
});

test("anything else is refused, and a newline never gets into a Tor configuration", () => {
  for (const bad of [
    "", "hello", "obfs4 1.2.3.4:443 short cert=abc", "obfs4 1.2.3.4:443 D9A82D2F9C2F65A18407B1D2B764F130847F8B5D",
    "webtunnel 1.2.3.4:443 D9A82D2F9C2F65A18407B1D2B764F130847F8B5D url=https://x/y",
    OBFS4 + "\nControlPort 1", "203.0.113.9:443\nSocksPort 0", "x".repeat(700),
  ]) assert.equal(cleanBridgeLine(bad), null, JSON.stringify(bad));
});

test("lines are distinct and capped", () => {
  assert.equal(cleanBridgeLines([OBFS4, OBFS4, "junk"]).length, 1);
  const many = Array.from({ length: 30 }, (_, i) => `203.0.113.${i + 1}:443`);
  assert.equal(cleanBridgeLines(many).length, MAX_BRIDGE_LINES);
});

test("the lines are saved to a file, read back, and an empty save removes the file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-"));
  const file = path.join(dir, "data", "bridge-lines.txt");
  try {
    assert.deepEqual(readBridgeLines(file), []);
    assert.deepEqual(writeBridgeLines(file, [OBFS4, "garbage"]), [OBFS4]);
    assert.deepEqual(readBridgeLines(file), [OBFS4]);
    assert.deepEqual(writeBridgeLines(file, []), []);
    assert.equal(fs.existsSync(file), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
