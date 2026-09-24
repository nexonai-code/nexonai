import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { AddressInfo } from "net";
import { createApp } from "./app";
import { BlobStore } from "./store/blobStore";

const TOKEN = "test-token-abc123";

function startServer(authToken: string = TOKEN) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "relay-app-test-")), "relay.sqlite");
  const store = new BlobStore(file);
  const app = createApp(store, authToken);
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  return { server, store, base: `http://127.0.0.1:${port}` };
}

function authHeaders(token: string = TOKEN) {
  return { "content-type": "application/json", authorization: `Bearer ${token}` };
}

test("POST /v1/relay then GET /v1/fetch round-trips a blob", async () => {
  const { server, store, base } = startServer();
  try {
    const post = await fetch(`${base}/v1/relay`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ tag: "abcDEF123", blob: "aGVsbG8=" }),
    });
    assert.equal(post.status, 201);

    const fetched = await fetch(`${base}/v1/fetch?tag=abcDEF123`, { headers: authHeaders() });
    assert.equal(fetched.status, 200);
    assert.deepEqual(await fetched.json(), { blobs: ["aGVsbG8="] });

    // Already deleted on first fetch.
    const second = await fetch(`${base}/v1/fetch?tag=abcDEF123`, { headers: authHeaders() });
    assert.deepEqual(await second.json(), { blobs: [] });
  } finally {
    server.close();
    store.close();
  }
});

test("POST /v1/relay rejects an oversized blob", async () => {
  const { server, store, base } = startServer();
  try {
    const oversized = Buffer.alloc(4097, 1).toString("base64");
    const res = await fetch(`${base}/v1/relay`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ tag: "abcDEF123", blob: oversized }),
    });
    assert.equal(res.status, 413);
  } finally {
    server.close();
    store.close();
  }
});

test("GET /v1/fetch rejects a malformed tag", async () => {
  const { server, store, base } = startServer();
  try {
    const res = await fetch(`${base}/v1/fetch?tag=${encodeURIComponent("not a valid tag!")}`, {
      headers: authHeaders(),
    });
    assert.equal(res.status, 400);
  } finally {
    server.close();
    store.close();
  }
});

test("GET /health reports ok without requiring auth", async () => {
  const { server, store, base } = startServer();
  try {
    const res = await fetch(`${base}/health`);
    assert.deepEqual(await res.json(), { ok: true });
  } finally {
    server.close();
    store.close();
  }
});

test("POST /v1/relay rejects a request with no Authorization header", async () => {
  const { server, store, base } = startServer();
  try {
    const res = await fetch(`${base}/v1/relay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tag: "abcDEF123", blob: "aGVsbG8=" }),
    });
    assert.equal(res.status, 401);
  } finally {
    server.close();
    store.close();
  }
});

test("GET /v1/fetch rejects a request with the wrong token", async () => {
  const { server, store, base } = startServer();
  try {
    const res = await fetch(`${base}/v1/fetch?tag=abcDEF123`, { headers: authHeaders("wrong-token") });
    assert.equal(res.status, 401);
  } finally {
    server.close();
    store.close();
  }
});

test("a blob pushed under one server's token is unreachable through a server with a different token", async () => {
  const first = startServer("token-one");
  try {
    const post = await fetch(`${first.base}/v1/relay`, {
      method: "POST",
      headers: authHeaders("token-one"),
      body: JSON.stringify({ tag: "sharedTag123", blob: "aGVsbG8=" }),
    });
    assert.equal(post.status, 201);

    // Same store, wrong token — proves auth is actually enforced end-to-end, not just that a
    // header is present.
    const fetchedWrongToken = await fetch(`${first.base}/v1/fetch?tag=sharedTag123`, {
      headers: authHeaders("token-two"),
    });
    assert.equal(fetchedWrongToken.status, 401);
  } finally {
    first.server.close();
    first.store.close();
  }
});

test("POST /v1/fetchMany returns queued blobs for the tags that have them, immediately", async () => {
  const { server, store, base } = startServer();
  try {
    await fetch(`${base}/v1/relay`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ tag: "tagWithData01", blob: "aGVsbG8=" }),
    });

    const res = await fetch(`${base}/v1/fetchMany`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ tags: ["tagWithData01", "tagWithNoData02"] }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      blobs: { tagWithData01: ["aGVsbG8="], tagWithNoData02: [] },
    });

    // Already taken on first fetchMany.
    const again = await fetch(`${base}/v1/fetchMany`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ tags: ["tagWithData01"] }),
    });
    assert.deepEqual(await again.json(), { blobs: { tagWithData01: [] } });
  } finally {
    server.close();
    store.close();
  }
});

test("POST /v1/fetchMany returns empty arrays immediately when waitMs is omitted and nothing is queued", async () => {
  const { server, store, base } = startServer();
  try {
    const start = Date.now();
    const res = await fetch(`${base}/v1/fetchMany`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ tags: ["emptyTag01", "emptyTag02"] }),
    });
    const elapsedMs = Date.now() - start;
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { blobs: { emptyTag01: [], emptyTag02: [] } });
    assert.ok(elapsedMs < 2000, `expected an immediate return, took ${elapsedMs}ms`);
  } finally {
    server.close();
    store.close();
  }
});

test("POST /v1/fetchMany with waitMs holds the request open and returns as soon as a blob is stored", async () => {
  const { server, store, base } = startServer();
  try {
    const start = Date.now();
    const longPoll = fetch(`${base}/v1/fetchMany`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ tags: ["arrivesLateTag01"], waitMs: 10_000 }),
    });

    // Give the long-poll request time to actually register its wait before the blob lands.
    await new Promise((resolve) => setTimeout(resolve, 200));
    const post = await fetch(`${base}/v1/relay`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ tag: "arrivesLateTag01", blob: "bGF0ZQ==" }),
    });
    assert.equal(post.status, 201);

    const res = await longPoll;
    const elapsedMs = Date.now() - start;
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { blobs: { arrivesLateTag01: ["bGF0ZQ=="] } });
    // Must return promptly once the blob lands, not sit out the full 10s wait.
    assert.ok(elapsedMs < 5000, `expected the wait to end early, took ${elapsedMs}ms`);
  } finally {
    server.close();
    store.close();
  }
});

test("POST /v1/fetchMany with waitMs times out and returns empty when nothing ever arrives", async () => {
  const { server, store, base } = startServer();
  try {
    const start = Date.now();
    const res = await fetch(`${base}/v1/fetchMany`, {
      method: "POST",
      headers: authHeaders(),
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

test("POST /v1/fetchMany rejects an empty tags array", async () => {
  const { server, store, base } = startServer();
  try {
    const res = await fetch(`${base}/v1/fetchMany`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ tags: [] }),
    });
    assert.equal(res.status, 400);
  } finally {
    server.close();
    store.close();
  }
});

test("POST /v1/fetchMany rejects more tags than the batch cap", async () => {
  const { server, store, base } = startServer();
  try {
    const tooMany = Array.from({ length: 65 }, (_, i) => `tag${i}`);
    const res = await fetch(`${base}/v1/fetchMany`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ tags: tooMany }),
    });
    assert.equal(res.status, 400);
  } finally {
    server.close();
    store.close();
  }
});

test("POST /v1/fetchMany rejects a malformed tag in the list", async () => {
  const { server, store, base } = startServer();
  try {
    const res = await fetch(`${base}/v1/fetchMany`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ tags: ["validTag01", "not a valid tag!"] }),
    });
    assert.equal(res.status, 400);
  } finally {
    server.close();
    store.close();
  }
});

test("POST /v1/fetchMany rejects a request with no Authorization header", async () => {
  const { server, store, base } = startServer();
  try {
    const res = await fetch(`${base}/v1/fetchMany`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tags: ["someTag01"] }),
    });
    assert.equal(res.status, 401);
  } finally {
    server.close();
    store.close();
  }
});
