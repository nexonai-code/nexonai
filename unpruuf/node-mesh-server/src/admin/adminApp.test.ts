import test from "node:test";
import assert from "node:assert/strict";
import * as http from "http";
import type { AddressInfo } from "net";
import { createAdminApp, isLoopbackHost, ownerConnectionString, ownerSecretFromCode } from "./adminApp";
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
      torStatus: () => ({ state: "ready", bootstrapPercent: 100, onionAddress: "abcdef.onion", onionAddresses: ["abcdef.onion"], controlAddress: null, locked: false, restarts: 0, lastError: null, powEnabled: true }),
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

test("the setup page's unlock accepts a pasted owner code or a bare secret", () => {
  assert.equal(ownerSecretFromCode("unpruuf-node-owner:v1:abc.onion:Secret_123-abcdefgh"), "Secret_123-abcdefgh");
  assert.equal(ownerSecretFromCode("Secret_123-abcdefgh"), "Secret_123-abcdefgh");
  assert.equal(ownerSecretFromCode("short"), null);
});

test("a locked server hides the owner QR and refuses rotation", async () => {
  const port = 18000 + Math.floor(Math.random() * 1000);
  let locked = true;
  const app = createAdminApp(
    {
      getOwnerSecret: () => "",
      rotateOwnerSecret: () => {},
      profile: PROFILES.standard,
      slot: 1,
      ephemeral: false,
      torEnabled: true,
      publicAddress: () => null,
      torStatus: () => null,
      stats: () => ({ queued: 0, tags: 0, oldestAgeMs: null }),
      sealed: true,
      isLocked: () => locked,
      unlock: async (s) => (s === "Right_secret_0123456789" ? ((locked = false), ["a.onion"]) : null),
      controlAddress: () => "ctrl.onion",
    },
    port,
  );
  const listener = app.listen(port, "127.0.0.1");
  try {
    const status = JSON.parse((await request(port, `localhost:${port}`, "/status.json")).body);
    assert.equal(status.locked, true);
    assert.equal(status.ownerString, null);
    assert.equal(status.canRotate, false);
    const page = await request(port, `localhost:${port}`, "/");
    assert.match(page.body, /Gesperrt nach Neustart/);
    assert.equal((await post(port, `localhost:${port}`, "/rotate-owner-secret", { "x-unpruuf-admin": "1" })).status, 423);
  } finally {
    listener.close();
  }
});

test("overview reports nodes, stored packets and counters, and flags a locked or incomplete server", async () => {
  const { Metrics } = await import("../metrics");
  const metrics = new Metrics();
  metrics.record("deposit"); metrics.record("deposit"); metrics.record("fetch"); metrics.record("rejected");
  const base = {
    getOwnerSecret: () => "s",
    profile: PROFILES.standard,
    slot: 1 as const,
    ephemeral: false,
    torEnabled: true,
    publicAddress: () => "a.onion",
    publicAddresses: () => ["a.onion", "b.onion", "c.onion"],
    torStatus: () => ({ state: "ready" as const, bootstrapPercent: 100, onionAddress: "a.onion", onionAddresses: ["a.onion", "b.onion", "c.onion"], controlAddress: null, locked: false, restarts: 0, lastError: null, powEnabled: true }),
    stats: () => ({ queued: 7, tags: 3, oldestAgeMs: 120000 }),
    metrics,
    configuredNodes: 3,
  };
  const { overviewPayload } = await import("./adminApp");
  const ok = await overviewPayload({ ...base, registeredNodes: async () => 3 });
  assert.equal(ok.level, "ok");
  assert.deepEqual(ok.nodes, { configured: 3, listed: 3, registered: 3 });
  assert.equal(ok.stored.queued, 7);
  assert.equal(ok.last24h!.deposit, 2);
  assert.equal(ok.last24h!.fetch, 1);
  assert.equal(ok.last24h!.rejected, 1);
  assert.equal(ok.hourly.length, 24);
  assert.doesNotMatch(JSON.stringify(ok), /"s"|owner/i);

  const missing = await overviewPayload({ ...base, registeredNodes: async () => 2 });
  assert.equal(missing.level, "warn");
  assert.ok(missing.problems.includes("nodes-missing"));

  const locked = await overviewPayload({ ...base, sealed: true, isLocked: () => true, registeredNodes: async () => 0 });
  assert.equal(locked.level, "locked");
});

test("the overview page is served on loopback only and embeds valid data", async () => {
  const port = 19000 + Math.floor(Math.random() * 900);
  const app = createAdminApp(
    {
      getOwnerSecret: () => "s",
      profile: PROFILES.standard,
      slot: 1,
      ephemeral: false,
      torEnabled: false,
      publicAddress: () => "a</script>.onion",
      torStatus: () => null,
      stats: () => ({ queued: 0, tags: 0, oldestAgeMs: null }),
    },
    port,
  );
  const listener = app.listen(port, "127.0.0.1");
  try {
    const page = await request(port, `localhost:${port}`, "/overview");
    assert.equal(page.status, 200);
    assert.match(page.body, /Node-Übersicht/);
    assert.doesNotMatch(page.body, /a<\/script>/, "address must not be able to break out of the script");
    const json = JSON.parse((await request(port, `localhost:${port}`, "/overview.json")).body);
    assert.equal(json.level, "ok");
    assert.equal((await request(port, `attacker.example:${port}`, "/overview")).status, 403);
  } finally {
    listener.close();
  }
});

test("the setup page takes a server license: refuses bad codes, activates a good one, shows the state", async () => {
  const crypto = await import("crypto");
  const fs = await import("fs");
  const os = await import("os");
  const path = await import("path");
  const { LicenseGuard } = await import("../license");
  const keys = crypto.generateKeyPairSync("ed25519");
  const pub = keys.publicKey.export({ format: "jwk" }).x as string;
  const now = Date.UTC(2027, 0, 15);
  const day = 24 * 60 * 60 * 1000;
  const code = (expires: number) => {
    const payload = `1|SRV-7|Acme GmbH|40|${now}|${expires}`;
    const sig = crypto.sign(null, Buffer.from("unpruuf-server-license-v1\n" + payload), keys.privateKey);
    return `unpruuf-server-license:v1:${Buffer.from(payload).toString("base64url")}:${sig.toString("base64url")}`;
  };
  const guard = new LicenseGuard({
    filePath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "node-mesh-admin-license-")), "license.txt"),
    publicKeyB64: pub,
    now: () => now,
  });
  const port = 19000 + Math.floor(Math.random() * 1000);
  let started = 0;
  const app = createAdminApp(
    {
      getOwnerSecret: () => "secret",
      profile: PROFILES.standard,
      slot: 1,
      ephemeral: false,
      torEnabled: true,
      publicAddress: () => null,
      torStatus: () => null,
      stats: () => ({ queued: 0, tags: 0, oldestAgeMs: null }),
      license: () => guard.summary(),
      applyLicense: async (c) => {
        const r = guard.apply(c);
        if (!r.ok) return r;
        started++;
        return { ok: true, summary: guard.summary() };
      },
    },
    port,
  );
  const listener = app.listen(port, "127.0.0.1");
  const sendLicense = (c: string, headers: Record<string, string>) =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port, path: "/license", method: "POST", headers: { host: `localhost:${port}`, "content-type": "application/json", ...headers } },
        (res) => {
          let body = "";
          res.on("data", (d) => (body += d));
          res.on("end", () => resolve({ status: res.statusCode!, body }));
        },
      );
      req.on("error", reject);
      req.end(JSON.stringify({ code: c }));
    });
  try {
    // no license yet: the page asks for one, the owner QR waits, the overview says so
    const before = await request(port, `localhost:${port}`, "/");
    assert.match(before.body, /Lizenz erforderlich/);
    assert.match(before.body, /Zuerst die Lizenz/);
    const ov = JSON.parse((await request(port, `localhost:${port}`, "/overview.json")).body);
    assert.deepEqual(ov.problems, ["license-missing"]);
    assert.equal(ov.level, "warn");

    // CSRF guard, bad code, an app license pasted by mistake
    assert.equal((await sendLicense(code(now + day), {})).status, 403);
    assert.equal((await sendLicense("nonsense", { "x-unpruuf-admin": "1" })).status, 400);
    const wrongType = await sendLicense("unpruuf-license:v1:abc:def", { "x-unpruuf-admin": "1" });
    assert.equal(wrongType.status, 400);
    assert.equal(JSON.parse(wrongType.body).error, "wrong-type");
    assert.equal(started, 0);

    // a good code activates (and would start the service exactly once)
    const ok = await sendLicense(code(now + 200 * day), { "x-unpruuf-admin": "1" });
    assert.equal(ok.status, 200);
    assert.equal(started, 1);
    const status = JSON.parse((await request(port, `localhost:${port}`, "/status.json")).body);
    assert.equal(status.license.status, "valid");
    assert.equal(status.license.customer, "Acme GmbH");
    assert.equal(status.license.maxNodes, 40);
    const after = await request(port, `localhost:${port}`, "/");
    assert.match(after.body, /Acme GmbH/);
    assert.doesNotMatch(after.body, /Lizenz erforderlich/);
  } finally {
    listener.close();
  }
});
