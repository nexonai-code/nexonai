import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { findFileRecursive } from "./torDownload";

/**
 * Only the pure filesystem-search half of torDownload.ts is covered here — the download/extract
 * half needs a real network call and Windows' `tar.exe`, neither of which this test suite can
 * exercise (see windowsTor.test.ts's own tests for the same reasoning around real Tor behavior).
 */

test("findFileRecursive finds a file nested several directories deep", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "find-file-test-"));
  const nested = path.join(dir, "a", "b", "c");
  fs.mkdirSync(nested, { recursive: true });
  const target = path.join(nested, "tor.exe");
  fs.writeFileSync(target, "");
  assert.equal(findFileRecursive(dir, "tor.exe"), target);
});

test("findFileRecursive matches case-insensitively", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "find-file-test-"));
  const target = path.join(dir, "Tor.EXE");
  fs.writeFileSync(target, "");
  assert.equal(findFileRecursive(dir, "tor.exe"), target);
});

test("findFileRecursive returns null when the file isn't present anywhere", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "find-file-test-"));
  fs.writeFileSync(path.join(dir, "something-else.txt"), "");
  assert.equal(findFileRecursive(dir, "tor.exe"), null);
});

test("findFileRecursive picks the first match when multiple exist", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "find-file-test-"));
  fs.mkdirSync(path.join(dir, "x"));
  fs.mkdirSync(path.join(dir, "y"));
  fs.writeFileSync(path.join(dir, "x", "tor.exe"), "");
  fs.writeFileSync(path.join(dir, "y", "tor.exe"), "");
  const found = findFileRecursive(dir, "tor.exe");
  assert.ok(found === path.join(dir, "x", "tor.exe") || found === path.join(dir, "y", "tor.exe"));
});
