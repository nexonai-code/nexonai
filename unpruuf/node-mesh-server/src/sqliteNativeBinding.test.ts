import test from "node:test";
import assert from "node:assert/strict";
import { getSqliteNativeBinding, setSqliteNativeBinding } from "./sqliteNativeBinding";

test("returns undefined until something has been set", () => {
  // Only safe to assert this in isolation since the module holds shared mutable state — the
  // other test in this file sets it, so this one must run first (node:test runs a file's tests
  // in declaration order by default).
  assert.equal(getSqliteNativeBinding(), undefined);
});

test("setSqliteNativeBinding makes the same object come back out", () => {
  const fakeAddon = { Database: class {} };
  setSqliteNativeBinding(fakeAddon);
  assert.equal(getSqliteNativeBinding(), fakeAddon);
});
