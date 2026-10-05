import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { AddressInfo } from "net";
import { createApp } from "./app";
import { NodeStore } from "./store/nodeStore";

const OWNER_SECRET = "test-owner-secret-abc123";

function startServer(ownerSecret: string = OWNER_SECRET) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "node-mesh-app-test-")), "node-mesh.sqlite");
  const store = new NodeStore(file);
  const app = createApp(store, ownerSecret);
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  return { server, store, base: `http://127.0.0.1:${port}` };
}

function ownerHeaders(secret: string = OWNER_SECRET) {
  return { "content-type": "application/json", authorization: `Bearer ${secret}` };
}

test("GET /health reports ok without requiring the owner secret", async () => {
  const { server, store, base } = startServer();
  try {
    const res = await fetch(`${base}/health`);
    assert.deepEqual(await res.json(), { ok: true });
  } finally {
    server.close();
    store.close();
  }
});

test("PUT /deposit rejects a request with no Authorization header", async () => {
  const { server, store, base } = startServer();
  try {
    const res = await fetch(`${base}/deposit`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ routing_tag: "abcDEF123", ciphertext: "aGVsbG8=" }),
    });
    assert.equal(res.status, 401);
  } finally {
    server.close();
    store.close();
  }
});

test("PUT /deposit rejects the wrong owner secret", async () => {
  const { server, store, base } = startServer();
  try {
    const res = await fetch(`${base}/deposit`, {
      method: "PUT",
      headers: ownerHeaders("wrong-secret"),
      body: JSON.stringify({ routing_tag: "abcDEF123", ciphertext: "aGVsbG8=" }),
    });
    assert.equal(res.status, 401);
  } finally {
    server.close();
    store.close();
  }
});

test("PUT /deposit with the correct owner secret, then GET /fetch, round-trips a blob", async () => {
  const { server, store, base } = startServer();
  try {
    const deposit = await fetch(`${base}/deposit`, {
      method: "PUT",
      headers: ownerHeaders(),
      body: JSON.stringify({ routing_tag: "abcDEF123", ciphertext: "aGVsbG8=" }),
    });
    assert.equal(deposit.status, 201);

    // No Authorization header at all — fetch needs none, the tag itself is the credential.
    const fetched = await fetch(`${base}/fetch?tag=abcDEF123`);
    assert.equal(fetched.status, 200);
    assert.deepEqual(await fetched.json(), { blobs: ["aGVsbG8="] });
  } finally {
    server.close();
    store.close();
  }
});

test("GET /fetch does NOT delete — the same blob is returned on every subsequent fetch", async () => {
  const { server, store, base } = startServer();
  try {
    await fetch(`${base}/deposit`, {
      method: "PUT",
      headers: ownerHeaders(),
      body: JSON.stringify({ routing_tag: "stickyTag01", ciphertext: "cGVyc2lzdA==" }),
    });

    const first = await fetch(`${base}/fetch?tag=stickyTag01`);
    const second = await fetch(`${base}/fetch?tag=stickyTag01`);
    const third = await fetch(`${base}/fetch?tag=stickyTag01`);
    assert.deepEqual(await first.json(), { blobs: ["cGVyc2lzdA=="] });
    assert.deepEqual(await second.json(), { blobs: ["cGVyc2lzdA=="] });
    assert.deepEqual(await third.json(), { blobs: ["cGVyc2lzdA=="] });
  } finally {
    server.close();
    store.close();
  }
});

test("PUT /deposit rejects an oversized ciphertext", async () => {
  const { server, store, base } = startServer();
  try {
    const oversized = Buffer.alloc(4097, 1).toString("base64");
    const res = await fetch(`${base}/deposit`, {
      method: "PUT",
      headers: ownerHeaders(),
      body: JSON.stringify({ routing_tag: "abcDEF123", ciphertext: oversized }),
    });
    assert.equal(res.status, 413);
  } finally {
    server.close();
    store.close();
  }
});

test("GET /fetch rejects a malformed tag", async () => {
  const { server, store, base } = startServer();
  try {
    const res = await fetch(`${base}/fetch?tag=${encodeURIComponent("not a valid tag!")}`);
    assert.equal(res.status, 400);
  } finally {
    server.close();
    store.close();
  }
});

test("POST /fetchMany returns queued blobs for the tags that have them, immediately, without deleting", async () => {
  const { server, store, base } = startServer();
  try {
    await fetch(`${base}/deposit`, {
      method: "PUT",
      headers: ownerHeaders(),
      body: JSON.stringify({ routing_tag: "tagWithData01", ciphertext: "aGVsbG8=" }),
    });

    const res = await fetch(`${base}/fetchMany`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tags: ["tagWithData01", "tagWithNoData02"] }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      blobs: { tagWithData01: ["aGVsbG8="], tagWithNoData02: [] },
    });

    // Still there on a second call — no delete-on-fetch.
    const again = await fetch(`${base}/fetchMany`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tags: ["tagWithData01"] }),
    });
    assert.deepEqual(await again.json(), { blobs: { tagWithData01: ["aGVsbG8="] } });
  } finally {
    server.close();
    store.close();
  }
});

test("POST /fetchMany with waitMs holds the request open and returns as soon as a blob is deposited", async () => {
  const { server, store, base } = startServer();
  try {
    const start = Date.now();
    const longPoll = fetch(`${base}/fetchMany`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tags: ["arrivesLateTag01"], waitMs: 10_000 }),
    });

    await new Promise((resolve) => setTimeout(resolve, 200));
    const deposit = await fetch(`${base}/deposit`, {
      method: "PUT",
      headers: ownerHeaders(),
      body: JSON.stringify({ routing_tag: "arrivesLateTag01", ciphertext: "bGF0ZQ==" }),
    });
    assert.equal(deposit.status, 201);

    const res = await longPoll;
    const elapsedMs = Date.now() - start;
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { blobs: { arrivesLateTag01: ["bGF0ZQ=="] } });
    assert.ok(elapsedMs < 5000, `expected the wait to end early, took ${elapsedMs}ms`);
  } finally {
    server.close();
    store.close();
  }
});

test("POST /fetchMany with waitMs times out and returns empty when nothing ever arrives", async () => {
  const { server, store, base } = startServer();
  try {
    const start = Date.now();
    const res = await fetch(`${base}/fetchMany`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tags: ["neverArrivesTag01"], waitMs: 300 }),
    });
    const elapsedMs = Date.now() - start;
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { blobs: { neverArrivesTag01: [] } });
    assert.ok(elapsedMs >= 300, `expected to wait out the full timeout, took ${elapsedMs}ms`);
  } finally {
    server.close();
    store.close();
  }
});

test("POST /fetchMany rejects an empty tags array", async () => {
  const { server, store, base } = startServer();
  try {
    const res = await fetch(`${base}/fetchMany`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tags: [] }),
    });
    assert.equal(res.status, 400);
  } finally {
    server.close();
    store.close();
  }
});

test("POST /fetchMany rejects more tags than the batch cap", async () => {
  const { server, store, base } = startServer();
  try {
    const tooMany = Array.from({ length: 65 }, (_, i) => `tag${i}`);
    const res = await fetch(`${base}/fetchMany`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tags: tooMany }),
    });
    assert.equal(res.status, 400);
  } finally {
    server.close();
    store.close();
  }
});

test("a node instance's owner secret does not work against a different node instance", async () => {
  const first = startServer("owner-secret-one");
  try {
    const res = await fetch(`${first.base}/deposit`, {
      method: "PUT",
      headers: ownerHeaders("owner-secret-two"),
      body: JSON.stringify({ routing_tag: "abcDEF123", ciphertext: "aGVsbG8=" }),
    });
    assert.equal(res.status, 401);
  } finally {
    first.server.close();
    first.store.close();
  }
});

test("a rotated owner secret takes effect immediately — the old one stops working", async () => {
  let secret = "before-rotation";
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "node-mesh-app-test-")), "node-mesh.sqlite");
  const store = new NodeStore(file);
  const server = createApp(store, () => secret).listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const body = JSON.stringify({ routing_tag: "rot", ciphertext: Buffer.from("x").toString("base64") });
  try {
    assert.equal((await fetch(`${base}/deposit`, { method: "PUT", headers: ownerHeaders("before-rotation"), body })).status, 201);
    secret = "after-rotation";
    assert.equal((await fetch(`${base}/deposit`, { method: "PUT", headers: ownerHeaders("before-rotation"), body })).status, 401);
    assert.equal((await fetch(`${base}/deposit`, { method: "PUT", headers: ownerHeaders("after-rotation"), body })).status, 201);
  } finally {
    server.close();
    store.close();
  }
});

test("GET /pool lists every node address, but only for the owner", async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "node-mesh-app-test-")), "node-mesh.sqlite");
  const store = new NodeStore(file);
  const addresses = ["aaaa.onion", "bbbb.onion", "cccc.onion"];
  const server = createApp(store, OWNER_SECRET, () => addresses).listen(0);
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  try {
    const anonymous = await fetch(`${base}/pool`);
    assert.equal(anonymous.status, 401);
    const wrong = await fetch(`${base}/pool`, { headers: ownerHeaders("not-the-secret") });
    assert.equal(wrong.status, 401);
    const owner = await fetch(`${base}/pool`, { headers: ownerHeaders() });
    assert.equal(owner.status, 200);
    assert.deepEqual(await owner.json(), { addresses });
  } finally {
    server.close();
    store.close();
  }
});

test("POST /fetchMany with since returns only newer blobs and a cursor, cursor first in the JSON", async () => {
  const { server, store, base } = startServer();
  try {
    const put = (c: string) =>
      fetch(`${base}/deposit`, { method: "PUT", headers: ownerHeaders(), body: JSON.stringify({ routing_tag: "tagA", ciphertext: c }) });
    await put("Zmlyc3Q=");
    const first = await fetch(`${base}/fetchMany`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tags: ["tagA"], since: 0 }),
    });
    const firstText = await first.text();
    assert.match(firstText, /^\{"cursor":\d+,"blobs":/);
    const firstBody = JSON.parse(firstText);
    assert.deepEqual(firstBody.blobs.tagA, ["Zmlyc3Q="]);

    await put("c2Vjb25k");
    const second: any = await (await fetch(`${base}/fetchMany`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tags: ["tagA"], since: firstBody.cursor }),
    })).json();
    assert.deepEqual(second.blobs.tagA, ["c2Vjb25k"]);
    assert.ok(second.cursor > firstBody.cursor);

    // Without since: everything, as before.
    const all: any = await (await fetch(`${base}/fetchMany`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tags: ["tagA"] }),
    })).json();
    assert.deepEqual(all.blobs.tagA, ["Zmlyc3Q=", "c2Vjb25k"]);
  } finally {
    server.close();
    store.close();
  }
});

test("POST /fetchMany long-poll with since waits even though older blobs exist", async () => {
  const { server, store, base } = startServer();
  try {
    await fetch(`${base}/deposit`, { method: "PUT", headers: ownerHeaders(), body: JSON.stringify({ routing_tag: "tagW", ciphertext: "b2xk" }) });
    const cursor = store.currentCursor();
    const started = Date.now();
    const poll = fetch(`${base}/fetchMany`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tags: ["tagW"], since: cursor, waitMs: 2000 }),
    });
    setTimeout(() => {
      void fetch(`${base}/deposit`, { method: "PUT", headers: ownerHeaders(), body: JSON.stringify({ routing_tag: "tagW", ciphertext: "bmV3" }) });
    }, 300);
    const body: any = await (await poll).json();
    assert.deepEqual(body.blobs.tagW, ["bmV3"]);
    assert.ok(Date.now() - started >= 250);
  } finally {
    server.close();
    store.close();
  }
});

test("a locked server refuses owner routes, reports its lock, and unlocks only with the right secret", async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "node-mesh-app-test-")), "node-mesh.sqlite");
  const store = new NodeStore(file);
  let secret = "";
  const lock = {
    isLocked: () => secret === "",
    unlock: async (s: string) => {
      if (s !== OWNER_SECRET) return null;
      secret = s;
      return ["aaaa.onion"];
    },
    controlAddress: () => "ctrl.onion",
  };
  const server = createApp(store, () => secret, () => (secret ? ["aaaa.onion"] : []), lock).listen(0);
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const body = JSON.stringify({ routing_tag: "abcDEF123", ciphertext: "aGVsbG8=" });
  try {
    assert.equal((await fetch(`${base}/deposit`, { method: "PUT", headers: ownerHeaders(), body })).status, 423);
    assert.deepEqual(await (await fetch(`${base}/lock-status`)).json(), { locked: true });
    assert.equal((await fetch(`${base}/unlock`, { method: "POST", headers: ownerHeaders("wrong") })).status, 401);
    assert.equal((await fetch(`${base}/unlock`, { method: "POST" })).status, 401);
    const ok = await fetch(`${base}/unlock`, { method: "POST", headers: ownerHeaders() });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { unlocked: true, addresses: ["aaaa.onion"] });
    assert.deepEqual(await (await fetch(`${base}/lock-status`)).json(), { locked: false });
    assert.equal((await fetch(`${base}/deposit`, { method: "PUT", headers: ownerHeaders(), body })).status, 201);
    const pool = await (await fetch(`${base}/pool`, { headers: ownerHeaders() })).json();
    assert.deepEqual(pool, { control: "ctrl.onion", addresses: ["aaaa.onion"] });
  } finally {
    server.close();
    store.close();
  }
});

test("metrics count deposits, fetches and rejections without storing anything about them", async () => {
  const { Metrics } = await import("./metrics");
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "node-mesh-app-test-")), "node-mesh.sqlite");
  const store = new NodeStore(file);
  const metrics = new Metrics();
  const server = createApp(store, OWNER_SECRET, () => [], undefined, metrics).listen(0);
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  try {
    const body = JSON.stringify({ routing_tag: "tagM", ciphertext: "aGk=" });
    await fetch(`${base}/deposit`, { method: "PUT", headers: ownerHeaders(), body });
    await fetch(`${base}/deposit`, { method: "PUT", headers: ownerHeaders("wrong"), body });
    await fetch(`${base}/fetch?tag=tagM`);
    await fetch(`${base}/health`);
    await new Promise((r) => setTimeout(r, 30));
    const s = metrics.summary();
    assert.equal(s.totals.deposit, 1);
    assert.equal(s.totals.fetch, 1);
    assert.equal(s.totals.rejected, 1);
  } finally {
    server.close();
    store.close();
  }
});
