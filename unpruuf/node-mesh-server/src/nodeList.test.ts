import test from "node:test";
import assert from "node:assert/strict";
import { buildNodeListFile, NODE_LIST_HEADER, parseNodeListFile } from "./nodeList";

const SECRET = "Secret_0123456789abcdef-XYZ";
const addr = (i: number) => `${String(i).padStart(4, "a")}${"b".repeat(52)}.onion`;
const addresses = Array.from({ length: 250 }, (_, i) => addr(i));

test("a node list round-trips with name, secret, control address and all 250 addresses", () => {
  const text = buildNodeListFile({ name: "Acme GmbH · Server 1", ownerSecret: SECRET, control: "ctrl.onion", addresses });
  assert.ok(text.startsWith(NODE_LIST_HEADER + "\n"));
  const parsed = parseNodeListFile(text)!;
  assert.equal(parsed.name, "Acme GmbH · Server 1");
  assert.equal(parsed.ownerSecret, SECRET);
  assert.equal(parsed.control, "ctrl.onion");
  assert.deepEqual(parsed.addresses, addresses);
});

test("control line is optional, Windows line endings and a BOM are fine, duplicates collapse", () => {
  const text = buildNodeListFile({ name: "x", ownerSecret: SECRET, control: null, addresses: [addr(1), addr(2)] });
  assert.doesNotMatch(text, /control:/);
  const crlf = "﻿" + text.replace(/\n/g, "\r\n");
  assert.deepEqual(parseNodeListFile(crlf)!.addresses, [addr(1), addr(2)]);
  const dup = text.replace("count: 2", "count: 2") + addr(1) + "\n";
  assert.equal(parseNodeListFile(dup)!.addresses.length, 2);
});

test("anything malformed is refused: wrong header, weak secret, no addresses, wrong count, bad address", () => {
  const good = buildNodeListFile({ name: "x", ownerSecret: SECRET, control: null, addresses: [addr(1)] });
  assert.ok(parseNodeListFile(good));
  assert.equal(parseNodeListFile(good.replace(NODE_LIST_HEADER, "unpruuf-node-list:v2")), null);
  assert.equal(parseNodeListFile(good.replace(SECRET, "short")), null);
  assert.equal(parseNodeListFile(good.replace("count: 1", "count: 5")), null);
  assert.equal(parseNodeListFile(good + "not an address!\n"), null);
  assert.equal(parseNodeListFile(buildNodeListFile({ name: "x", ownerSecret: SECRET, control: null, addresses: [] })), null);
  assert.equal(parseNodeListFile(""), null);
});

test("a name with line breaks cannot inject extra header lines", () => {
  const text = buildNodeListFile({ name: "A\nsecret: Evil_secret_0123456789", ownerSecret: SECRET, control: null, addresses: [addr(1)] });
  assert.equal(parseNodeListFile(text)!.ownerSecret, SECRET);
});

test("the company's Tor bridge travels in the list file; broken bridge lines are dropped", () => {
  const obfs4 = "obfs4 203.0.113.9:443 D9A82D2F9C2F65A18407B1D2B764F130847F8B5D cert=bjRaMrr1BRiAW8IE9U5z27fQaYgOhX1UCmOpg2pFpoMvo6ZgQMzLsaTzzQNTlm7hNcb+Sg iat-mode=0";
  const text = buildNodeListFile({ name: "x", ownerSecret: SECRET, control: null, addresses: [addr(1)], bridges: [obfs4, "not a bridge"] });
  assert.equal((text.match(/^bridge: /gm) ?? []).length, 1);
  const parsed = parseNodeListFile(text)!;
  assert.deepEqual(parsed.bridges, [obfs4]);
  assert.deepEqual(parsed.addresses, [addr(1)]);
  const none = parseNodeListFile(buildNodeListFile({ name: "x", ownerSecret: SECRET, control: null, addresses: [addr(1)] }))!;
  assert.deepEqual(none.bridges, []);
});
