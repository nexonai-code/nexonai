import test from "node:test";
import assert from "node:assert/strict";
import * as http from "http";
import type { AddressInfo } from "net";
import { createAdminApp, isLoopbackHost, ownerConnectionString } from "./adminApp";
import { PROFILES } from "../profiles";

function request(port: number, host: string, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path, headers: { host } }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode!, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

function post(port: number, host: string, path: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path, method: "POST", headers: { host, ...headers } }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode!, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

test("owner string matches the Android app's NodeMeshManager.parseOwnerConnectionString format", () => {
  assert.equal(
    ownerConnectionString("abc.onion", "s3cr3t"),
    "unpruuf-node-owner:v1:abc.onion:s3cr3t",
  );
});

test("only loopback Host headers are accepted (DNS-rebinding guard)", () => {
  assert.equal(isLoopbackHost("localhost:8790", 8790), true);
  assert.equal(isLoopbackHost("127.0.0.1:8790", 8790), true);
  assert.equal(isLoopbackHost("evil.example:8790", 8790), false);
  assert.equal(isLoopbackHost("localhost:9999", 8790), false);
  assert.equal(isLoopbackHost(undefined, 8790), false);
});

test("setup page serves owner code + QR to localhost and refuses foreign hosts", async () => {
  const server = http.createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  server.close();
  let secret = "owner-secret-xyz";
  const app = createAdminApp(
    {
      getOwnerSecret: () => secret,
      rotateOwnerSecret: () => { secret = "rotated-secret"; },
      profile: PROFILES.standard,
      slot: 1,
      ephemeral: false,
      torEnabled: true,
      publicAddress: () => "abcdef.onion",
      torStatus: () => ({ state: "ready", bootstrapPercent: 100, onionAddress: "abcdef.onion", restarts: 0, lastError: null, powEnabled: true }),
      stats: () => ({ queued: 3, tags: 1, oldestAgeMs: 10 }),
    },
    port,
  );
  const listener = app.listen(port, "127.0.0.1");
  try {
    const ok = await request(port, `localhost:${port}`, "/status.json");
    assert.equal(ok.status, 200);
    const status = JSON.parse(ok.body);
    assert.equal(status.ownerString, "unpruuf-node-owner:v1:abcdef.onion:owner-secret-xyz");
    assert.match(status.ownerQr, /^data:image\/png;base64,/);
    assert.equal(status.stats.queued, 3);

    const page = await request(port, `127.0.0.1:${port}`, "/");
    assert.equal(page.status, 200);
    assert.match(page.body, /Owner-QR/);

    const rebinding = await request(port, `attacker.example:${port}`, "/status.json");
    assert.equal(rebinding.status, 403);
    assert.doesNotMatch(rebinding.body, /owner-secret-xyz/);

    // Rotation needs the custom header (CSRF guard) and takes effect immediately.
    const noHeader = await post(port, `localhost:${port}`, "/rotate-owner-secret", {});
    assert.equal(noHeader.status, 403);
    assert.equal(secret, "owner-secret-xyz");
    const rotated = await post(port, `localhost:${port}`, "/rotate-owner-secret", { "x-unpruuf-admin": "1" });
    assert.equal(rotated.status, 200);
    const after = JSON.parse((await request(port, `localhost:${port}`, "/status.json")).body);
    assert.equal(after.ownerString, "unpruuf-node-owner:v1:abcdef.onion:rotated-secret");
  } finally {
    listener.close();
  }
});
