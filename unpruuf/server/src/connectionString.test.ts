import test from "node:test";
import assert from "node:assert/strict";
import { buildConnectionString, parseConnectionString } from "./connectionString";

test("build then parse round-trips a bare onion address", () => {
  const s = buildConnectionString("abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqrstuvwxyz2345.onion", "tok123");
  assert.deepEqual(parseConnectionString(s), {
    address: "abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqrstuvwxyz2345.onion",
    authToken: "tok123",
  });
});

test("build then parse round-trips a host:port address", () => {
  const s = buildConnectionString("192.168.1.50:8787", "tok123");
  assert.deepEqual(parseConnectionString(s), { address: "192.168.1.50:8787", authToken: "tok123" });
});

test("parse rejects a string without the prefix", () => {
  assert.equal(parseConnectionString("not-a-relay-string"), null);
});

test("parse rejects a malformed body", () => {
  assert.equal(parseConnectionString("unpruuf-relay:v1:"), null);
  assert.equal(parseConnectionString("unpruuf-relay:v1:onlyaddress"), null);
  assert.equal(parseConnectionString("unpruuf-relay:v1:address:"), null);
});

test("parse tolerates surrounding whitespace (copy-paste artifact)", () => {
  const s = "  " + buildConnectionString("abc.onion", "tok123") + "\n";
  assert.deepEqual(parseConnectionString(s), { address: "abc.onion", authToken: "tok123" });
});
