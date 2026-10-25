import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as http from "http";
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

test("an expired or missing server license refuses new deposits (402) but never blocks reading", async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "node-mesh-app-test-")), "node-mesh.sqlite");
  const store = new NodeStore(file);
  let blocked: string | null = null;
  const server = createApp(store, OWNER_SECRET, () => [], undefined, undefined, () => blocked).listen(0);
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const body = JSON.stringify({ routing_tag: "tagL", ciphertext: "aGk=" });
  try {
    assert.equal((await fetch(`${base}/deposit`, { method: "PUT", headers: ownerHeaders(), body })).status, 201);
    blocked = "license_expired";
    const refused = await fetch(`${base}/deposit`, { method: "PUT", headers: ownerHeaders(), body });
    assert.equal(refused.status, 402);
    assert.deepEqual(await refused.json(), { error: "license_expired" });
    // what was deposited before is still readable, and so is the health check
    const fetched = await fetch(`${base}/fetch?tag=tagL`);
    assert.equal(fetched.status, 200);
    assert.equal(((await fetched.json()) as { blobs: string[] }).blobs.length, 1);
    assert.equal((await fetch(`${base}/health`)).status, 200);
    blocked = null; // a renewal takes effect without a restart
    assert.equal((await fetch(`${base}/deposit`, { method: "PUT", headers: ownerHeaders(), body })).status, 201);
  } finally {
    server.close();
    store.close();
  }
});

test("broken JSON gets a short JSON error, no stack trace, no file paths", async () => {
  const { server, store, base } = startServer();
  try {
    const res = await fetch(`${base}/fetchMany`, { method: "POST", headers: { "content-type": "application/json" }, body: "{bad" });
    assert.equal(res.status, 400);
    const text = await res.text();
    assert.deepEqual(JSON.parse(text), { error: "bad request" });
    assert.ok(!/node_modules|body-parser|SyntaxError|\.js:/.test(text));
    const big = await fetch(`${base}/fetchMany`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tags: ["a".repeat(40000)] }) });
    assert.equal(big.status, 413);
    assert.ok(!/node_modules|body-parser|at /.test(await big.text()));
  } finally {
    server.close();
    store.close();
  }
});

test("PUT /deposit refuses ciphertext that is not strict base64, accepts padded base64", async () => {
  const { server, store, base } = startServer();
  try {
    const put = (ciphertext: string) => fetch(`${base}/deposit`, { method: "PUT", headers: ownerHeaders(), body: JSON.stringify({ routing_tag: "abcDEF123", ciphertext }) });
    assert.equal((await put("!!!!" + "AAAA".repeat(100))).status, 400);
    assert.equal((await put("aGVsbG8")).status, 400); // missing padding
    assert.equal((await put("aGVs bG8=")).status, 400);
    assert.equal((await put("aGVsbG8=")).status, 201);
    assert.equal((await put(Buffer.alloc(4096, 7).toString("base64"))).status, 201);
    assert.equal((await put(Buffer.alloc(4097, 7).toString("base64"))).status, 413);
  } finally {
    server.close();
    store.close();
  }
});

test("a node that holds its total ceiling refuses more deposits (507) but still serves reads", async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "node-mesh-full-test-")), "node-mesh.sqlite");
  const store = new NodeStore(file, 6, 2);
  const server = createApp(store, OWNER_SECRET).listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const put = (tag: string) => fetch(`${base}/deposit`, { method: "PUT", headers: ownerHeaders(), body: JSON.stringify({ routing_tag: tag, ciphertext: "aGVsbG8=" }) });
    assert.equal((await put("t1")).status, 201);
    assert.equal((await put("t2")).status, 201);
    assert.equal((await put("t3")).status, 507);
    assert.deepEqual((await (await fetch(`${base}/fetch?tag=t1`)).json()), { blobs: ["aGVsbG8="] });
  } finally {
    server.close();
    store.close();
  }
});

function startServerWithAddresses(addresses: string[]) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "node-mesh-app-test-")), "node-mesh.sqlite");
  const store = new NodeStore(file);
  const server = createApp(store, OWNER_SECRET, () => addresses).listen(0);
  const { port } = server.address() as AddressInfo;
  return { server, store, base: `http://127.0.0.1:${port}` };
}

// fetch() does not let a caller set Host, so go through node:http.
function getWithHost(base: string, host: string, pathAndQuery = "/fetch?tag=abc") {
  return new Promise<number>((resolve, reject) => {
    const u = new URL(`${base}${pathAndQuery}`);
    const r = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, headers: { host } }, (res) => { res.resume(); resolve(res.statusCode ?? 0); });
    r.on("error", reject);
    r.end();
  });
}

test("read rate limit is per node address: draining one address leaves the others working", async () => {
  const A = "nodeaaaaaaaaaaaaaaaa.onion";
  const B = "nodebbbbbbbbbbbbbbbb.onion";
  const { server, store, base } = startServerWithAddresses([A, B]);
  try {
    let limited = false;
    for (let i = 0; i < 60; i++) if ((await getWithHost(base, A)) === 429) { limited = true; break; }
    assert.equal(limited, true);
    assert.equal(await getWithHost(base, B), 200);
  } finally {
    server.close();
    store.close();
  }
});

test("inventing Host names neither multiplies the read allowance nor starves the real addresses", async () => {
  const A = "nodeaaaaaaaaaaaaaaaa.onion";
  const { server, store, base } = startServerWithAddresses([A]);
  try {
    let ok = 0;
    for (let i = 0; i < 60; i++) if ((await getWithHost(base, `junk${i}.example`)) === 200) ok++;
    assert.ok(ok <= 31, `made-up hosts got ${ok} answers, expected at most the one shared burst of 30`);
    assert.equal(await getWithHost(base, A), 200, "a real address keeps its own bucket");
    // Port and case in the Host header do not make a new bucket.
    assert.equal(await getWithHost(base, `${A.toUpperCase()}:80`), 200);
  } finally {
    server.close();
    store.close();
  }
});

test("POST /fetchMany reads a repeated tag once", async () => {
  const { server, store, base } = startServer();
  try {
    await fetch(`${base}/deposit`, { method: "PUT", headers: ownerHeaders(), body: JSON.stringify({ routing_tag: "dup", ciphertext: "b25l" }) });
    const body: any = await (await fetch(`${base}/fetchMany`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tags: Array(64).fill("dup") }),
    })).json();
    assert.deepEqual(body, { blobs: { dup: ["b25l"] } });
  } finally {
    server.close();
    store.close();
  }
});

test("POST /fetchMany cuts a big answer at 256 packets and continues from the cursor", async () => {
  const { server, store, base } = startServer();
  try {
    for (let i = 0; i < 300; i++) store.put("big", Buffer.from(`p${String(i).padStart(3, "0")}`).toString("base64"));
    const ask = async (since: number) => (await fetch(`${base}/fetchMany`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tags: ["big"], since }),
    })).json() as Promise<any>;
    const first = await ask(0);
    assert.equal(first.blobs.big.length, 256);
    assert.equal(first.more, true);
    const second = await ask(first.cursor);
    assert.equal(second.blobs.big.length, 44);
    assert.equal(second.more, undefined);
    assert.equal(Buffer.from(second.blobs.big[0], "base64").toString(), "p256");
    // Without a cursor the cut is announced too, so a plain client can continue.
    const plain: any = await (await fetch(`${base}/fetchMany`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tags: ["big"] }),
    })).json();
    assert.equal(plain.more, true);
    assert.equal(plain.blobs.big.length, 256);
  } finally {
    server.close();
    store.close();
  }
});

test("the /fetchMany cursor does not show what happens on the rest of the server", async () => {
  const { server, store, base } = startServer();
  try {
    const ask = async (tag: string) => (await fetch(`${base}/fetchMany`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tags: [tag], since: 0 }),
    })).json() as Promise<any>;
    const before = await ask("nobody");
    for (const t of ["x1", "x2", "x3"]) {
      await fetch(`${base}/deposit`, { method: "PUT", headers: ownerHeaders(), body: JSON.stringify({ routing_tag: t, ciphertext: "b25l" }) });
    }
    const after = await ask("nobody");
    assert.equal(before.cursor, 0);
    assert.equal(after.cursor, 0, "deposits under other tags must not move this caller's cursor");
    // It still moves for the caller's own tags, which is what the client needs.
    const own = await ask("x2");
    assert.ok(own.cursor > 0);
  } finally {
    server.close();
    store.close();
  }
});

test("a stranger cannot use up the owner's allowance on /pool or lock the owner out of it", async () => {
  const { server, store, base } = startServer();
  try {
    for (let i = 0; i < 12; i++) await fetch(`${base}/lock-status`);
    for (let i = 0; i < 15; i++) await fetch(`${base}/pool`, { headers: { authorization: "Bearer wrong" } });
    const owner = await fetch(`${base}/pool`, { headers: { authorization: `Bearer ${OWNER_SECRET}` } });
    assert.equal(owner.status, 200);
    // The strangers' wrong secrets are limited too, just in their own bucket.
    const wrong = await fetch(`${base}/pool`, { headers: { authorization: "Bearer wrong" } });
    assert.equal(wrong.status, 429);
  } finally {
    server.close();
    store.close();
  }
});

test("the server does not name its framework: JSON 404 for everything else, no ETag, exact paths, no HEAD or OPTIONS", async () => {
  const { server, store, base } = startServer();
  try {
    const nothing = await fetch(`${base}/nothing`, { method: "POST" });
    assert.equal(nothing.status, 404);
    assert.deepEqual(await nothing.json(), { error: "not found" });
    assert.equal(nothing.headers.get("etag"), null);
    assert.equal((await fetch(`${base}/fetchMany`, { method: "OPTIONS" })).status, 404);
    assert.equal((await fetch(`${base}/health`, { method: "HEAD" })).status, 404);
    assert.equal((await fetch(`${base}/DEPOSIT`, { method: "PUT", headers: ownerHeaders(), body: JSON.stringify({ routing_tag: "t", ciphertext: "b25l" }) })).status, 404);
    assert.equal((await fetch(`${base}/deposit/`, { method: "PUT", headers: ownerHeaders(), body: JSON.stringify({ routing_tag: "t", ciphertext: "b25l" }) })).status, 404);
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.equal(health.headers.get("etag"), null);
    assert.equal(health.headers.get("x-powered-by"), null);
  } finally {
    server.close();
    store.close();
  }
});
