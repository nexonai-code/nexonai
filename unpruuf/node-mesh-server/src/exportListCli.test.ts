import test from "node:test";
import assert from "node:assert/strict";
import * as http from "http";
import { AddressInfo } from "net";
import { explain, requestList } from "./exportListCli";
import { ADMIN_TOKEN_HEADER } from "./admin/adminToken";
import { buildNodeListFile } from "./nodeList";

function stub(handler: http.RequestListener): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve) => {
    const s = http.createServer(handler).listen(0, "127.0.0.1", () => resolve({ port: (s.address() as AddressInfo).port, close: () => s.close() }));
  });
}

test("requestList sends the CSRF header and the token and returns the file", async () => {
  const seen: Record<string, unknown> = {};
  const file = buildNodeListFile({ name: "x", ownerSecret: "A".repeat(32), control: null, addresses: ["a".repeat(56) + ".onion"] });
  const s = await stub((req, res) => {
    seen.method = req.method; seen.url = req.url; seen.csrf = req.headers["x-unpruuf-admin"]; seen.token = req.headers[ADMIN_TOKEN_HEADER];
    res.setHeader("content-type", "text/plain"); res.end(file);
  });
  try {
    const a = await requestList(s.port, "tok123");
    assert.equal(a.status, 200);
    assert.equal(a.text, file);
    assert.deepEqual(seen, { method: "POST", url: "/export-list", csrf: "1", token: "tok123" });
  } finally { s.close(); }
});

test("explain: 409 keeps waiting, the others give a clear sentence", () => {
  assert.equal(explain({ status: 409, text: "" }), null);
  assert.match(explain({ status: 423, text: "" })!, /gesperrt/);
  assert.match(explain({ status: 403, text: "" })!, /Schluessel/);
  assert.match(explain({ status: 500, text: "" })!, /500/);
});

test("requestList fails when nothing listens", async () => {
  const s = await stub((_q, r) => r.end());
  const port = s.port; s.close();
  await assert.rejects(requestList(port, "t", 2000));
});
