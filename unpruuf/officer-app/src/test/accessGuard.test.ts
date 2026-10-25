import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { AddressInfo } from "node:net";
import { x25519GenerateKeyPair } from "../crypto/primitives";
import { OfficerIdentity } from "../officer/officerIdentity";
import { CaseStore, deriveDbKey } from "../store/caseStore";
import { RelayClient } from "../relay/relayClient";
import { createDashboardApp } from "../web/app";
import { AccessOptions, defaultAccess, hostName } from "../web/accessGuard";

function identity(): OfficerIdentity {
  const kp = x25519GenerateKeyPair();
  return { userId: randomUUID(), messageKey: new Uint8Array(randomBytes(32)), x25519PrivateKey: kp.privateKey, x25519PublicKey: kp.publicKey };
}

async function withApp(access: AccessOptions, run: (port: number) => Promise<void>) {
  const id = identity();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "officer-access-"));
  const store = new CaseStore(path.join(dir, "cases.sqlite"), deriveDbKey(id));
  const relay = { push: async () => true, fetchMany: async () => ({}) } as unknown as RelayClient;
  const app = createDashboardApp(id, store, relay, "unpruuf-relay:v1:abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzab.onion:tok", "http://relay.example", undefined, "compliance", undefined, access);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", () => r()));
  try {
    await run((server.address() as AddressInfo).port);
  } finally {
    server.close();
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** fetch() cannot set Host, so the tests talk to the server with http.request. */
function call(port: number, method: string, urlPath: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: urlPath, headers }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

test("host names are read without port and brackets", () => {
  assert.equal(hostName("localhost:3000"), "localhost");
  assert.equal(hostName("[::1]:3000"), "::1");
  assert.equal(hostName("EXAMPLE.com"), "example.com");
  assert.equal(hostName(undefined), null);
});

test("OFF-1: a request addressed to a foreign or LAN host name is refused (DNS rebinding, LAN reach)", async () => {
  await withApp(defaultAccess(), async (port) => {
    for (const host of ["evil.example", "192.168.1.20:3000", "evil.example:3000", "localhost.evil.example"]) {
      const r = await call(port, "GET", "/api/cases", { host });
      assert.equal(r.status, 403, host);
      assert.doesNotMatch(r.body, /cases|caseNumber/);
    }
    for (const host of [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]) {
      assert.equal((await call(port, "GET", "/api/status", { host })).status, 200, host);
    }
  });
});

test("OFF-1: changing requests need the dashboard header, and a foreign Origin is refused", async () => {
  await withApp(defaultAccess(), async (port) => {
    const host = `localhost:${port}`;
    assert.equal((await call(port, "DELETE", "/api/cases/x", { host })).status, 403);
    assert.equal((await call(port, "POST", "/api/recherchen", { host, "content-type": "text/plain" })).status, 403);
    assert.equal((await call(port, "DELETE", "/api/cases/x", { host, "x-officer-ui": "1", origin: "https://evil.example" })).status, 403);
    assert.equal((await call(port, "GET", "/api/status", { host, origin: "null" })).status, 403);
    assert.equal((await call(port, "DELETE", "/api/cases/x", { host, "x-officer-ui": "1", origin: `http://${host}` })).status, 404);
  });
});

test("OFF-1: no CORS preflight is ever answered", async () => {
  await withApp(defaultAccess(), async (port) => {
    const r = await call(port, "OPTIONS", "/api/cases", { host: `localhost:${port}`, origin: "https://evil.example", "access-control-request-method": "DELETE" });
    assert.equal(r.status, 403);
  });
});

test("OFF-1: with a password every request needs it, wrong or missing gets 401", async () => {
  const access: AccessOptions = { allowedHosts: ["localhost", "127.0.0.1", "officer.lan"], password: "a-long-test-password" };
  await withApp(access, async (port) => {
    const host = `officer.lan:${port}`;
    assert.equal((await call(port, "GET", "/api/status", { host })).status, 401);
    const bad = "Basic " + Buffer.from("officer:wrong").toString("base64");
    assert.equal((await call(port, "GET", "/api/status", { host, authorization: bad })).status, 401);
    const good = "Basic " + Buffer.from("officer:a-long-test-password").toString("base64");
    assert.equal((await call(port, "GET", "/api/status", { host, authorization: good })).status, 200);
    assert.equal((await call(port, "GET", "/", { host })).status, 401);
  });
});

test("SEC-009: with an access token nothing answers without it, even on loopback with the UI header", async () => {
  const token = randomBytes(32).toString("base64url");
  await withApp({ ...defaultAccess(), token }, async (port) => {
    const host = `localhost:${port}`;
    assert.equal((await call(port, "GET", "/api/status", { host })).status, 403);
    assert.equal((await call(port, "GET", "/", { host })).status, 403);
    assert.equal((await call(port, "GET", "/api/cases/x/export", { host })).status, 403);
    assert.equal((await call(port, "DELETE", "/api/cases/x", { host, "x-officer-ui": "1" })).status, 403);
    assert.equal((await call(port, "GET", "/api/status", { host, "x-officer-token": "wrong" })).status, 403);
    assert.equal((await call(port, "GET", "/api/status", { host, cookie: `unpruuf_officer_token_${port}=wrong` })).status, 403);
    // ?t= is a link for the browser, not a way to change things.
    assert.equal((await call(port, "DELETE", `/api/cases/x?t=${token}`, { host, "x-officer-ui": "1" })).status, 403);
  });
});

test("SEC-009: the token works as header and as cookie; the UI header rule still applies on top", async () => {
  const token = randomBytes(32).toString("base64url");
  await withApp({ ...defaultAccess(), token }, async (port) => {
    const host = `localhost:${port}`;
    assert.equal((await call(port, "GET", "/api/status", { host, "x-officer-token": token })).status, 200);
    assert.equal((await call(port, "GET", "/api/status", { host, cookie: `other=1; unpruuf_officer_token_${port}=${token}` })).status, 200);
    assert.equal((await call(port, "DELETE", "/api/cases/x", { host, cookie: `unpruuf_officer_token_${port}=${token}` })).status, 403);
    assert.equal((await call(port, "DELETE", "/api/cases/x", { host, cookie: `unpruuf_officer_token_${port}=${token}`, "x-officer-ui": "1" })).status, 404);
  });
});

test("SEC-009: the ?t= link sets an HttpOnly SameSite=Strict cookie and redirects to the clean address", async () => {
  const token = randomBytes(32).toString("base64url");
  await withApp({ ...defaultAccess(), token }, async (port) => {
    const host = `localhost:${port}`;
    const r = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port, method: "GET", path: `/?t=${token}`, headers: { host } }, (res) => { res.resume(); resolve(res); });
      req.on("error", reject);
      req.end();
    });
    assert.equal(r.statusCode, 302);
    assert.equal(r.headers.location, "/");
    const cookie = (r.headers["set-cookie"] ?? [])[0] ?? "";
    assert.equal(cookie.split(";")[0], `unpruuf_officer_token_${port}=${token}`);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    assert.equal((await call(port, "GET", "/", { host, cookie: cookie.split(";")[0] })).status, 200);
    assert.equal((await call(port, "GET", "/?t=wrong", { host })).status, 403);
  });
});

test("SEC-009: with password and token both are needed", async () => {
  const token = randomBytes(32).toString("base64url");
  await withApp({ ...defaultAccess(), password: "a-long-test-password", token }, async (port) => {
    const host = `localhost:${port}`;
    const good = "Basic " + Buffer.from("officer:a-long-test-password").toString("base64");
    assert.equal((await call(port, "GET", "/api/status", { host, "x-officer-token": token })).status, 401);
    assert.equal((await call(port, "GET", "/api/status", { host, authorization: good })).status, 403);
    assert.equal((await call(port, "GET", "/api/status", { host, authorization: good, "x-officer-token": token })).status, 200);
  });
});
