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
