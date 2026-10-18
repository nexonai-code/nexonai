import test from "node:test";
import assert from "node:assert/strict";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { AddressInfo } from "net";
import { createApp } from "../app";
import { NodeStore } from "../store/nodeStore";
import { issueGuestGrant, deriveGuestKey, verifyGuestGrant } from "./guestGrant";
import { buildVectors } from "./vectors";
import { decodeScope, encodeScope, scopeAllows } from "./guestScope";

const OWNER = "test-owner-secret-abc123";
const DAY = 86_400_000;

function start(enabled: boolean, ownerSecret = OWNER) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "node-mesh-guest-test-"));
  const file = path.join(dir, "node-mesh.sqlite");
  const store = new NodeStore(file);
  const app = createApp(store, ownerSecret, { enabled, maxValidityMs: 30 * DAY });
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  return { server, store, dir, base: `http://127.0.0.1:${port}` };
}

function grant(over: Partial<{ id: Buffer; notAfter: number; per: number; bytes: number; scope: Buffer; secret: string }> = {}) {
  const id = over.id ?? crypto.randomBytes(16);
  return {
    id,
    token: issueGuestGrant(over.secret ?? OWNER, {
      grantId: id,
      notAfterMs: over.notAfter ?? Date.now() + 7 * DAY,
      depositsPerHour: over.per ?? 60,
      bytesPerHour: over.bytes ?? 1_000_000,
      scope: over.scope ?? Buffer.alloc(0),
    }),
  };
}

async function deposit(base: string, auth: string, tag = "guestTag1", body = "aGVsbG8=") {
  return fetch(`${base}/deposit`, {
    method: "PUT",
    headers: { "content-type": "application/json", authorization: auth },
    body: JSON.stringify({ routing_tag: tag, ciphertext: body }),
  });
}

async function withServer(enabled: boolean, fn: (s: ReturnType<typeof start>) => Promise<void>) {
  const s = start(enabled);
  try { await fn(s); } finally { s.server.close(); s.store.close(); }
}

test("guests are off by default: a valid grant is refused", async () => {
  await withServer(false, async (s) => {
    assert.equal((await deposit(s.base, `Guest ${grant().token}`)).status, 401);
  });
});

test("with guests on, a valid grant deposits and the packet can be fetched", async () => {
  await withServer(true, async (s) => {
    assert.equal((await deposit(s.base, `Guest ${grant().token}`)).status, 201);
    const res = await fetch(`${s.base}/fetch?tag=guestTag1`);
    assert.deepEqual(await res.json(), { blobs: ["aGVsbG8="] });
  });
});

test("owner deposit still works with guests on", async () => {
  await withServer(true, async (s) => {
    assert.equal((await deposit(s.base, `Bearer ${OWNER}`)).status, 201);
  });
});

test("forged, tampered, expired, over-long and foreign-node grants are refused", async () => {
  await withServer(true, async (s) => {
    const good = grant().token;
    const [g, m] = good.split(".");
    const flipped = Buffer.from(m, "base64url"); flipped[0] ^= 1;
    assert.equal((await deposit(s.base, `Guest ${g}.${flipped.toString("base64url")}`)).status, 401, "flipped mac");
    const gb = Buffer.from(g, "base64url"); gb.writeUInt16BE(60000, 25); // raise the deposit limit
    assert.equal((await deposit(s.base, `Guest ${gb.toString("base64url")}.${m}`)).status, 401, "tampered limits");
    assert.equal((await deposit(s.base, `Guest ${grant({ notAfter: Date.now() - 1000 }).token}`)).status, 401, "expired");
    assert.equal((await deposit(s.base, `Guest ${grant({ notAfter: Date.now() + 400 * DAY }).token}`)).status, 401, "validity above operator cap");
    assert.equal((await deposit(s.base, `Guest ${grant({ secret: "another-nodes-secret" }).token}`)).status, 401, "grant of another node");
    assert.equal((await deposit(s.base, "Guest nonsense")).status, 401, "garbage");
    assert.equal((await deposit(s.base, "Guest ")).status, 401, "empty");
    assert.equal((await deposit(s.base, `Guest ${good}.extra`)).status, 401, "extra segment");
  });
});

test("a guest grant reaches nothing but deposit: other paths stay 404 or read-only", async () => {
  await withServer(true, async (s) => {
    const auth = `Guest ${grant().token}`;
    for (const p of ["/unlock", "/pool", "/lock-status", "/admin", "/revoke", "/deposit/x"]) {
      for (const method of ["GET", "POST", "PUT", "DELETE"]) {
        const r = await fetch(`${s.base}${p}`, { method, headers: { authorization: auth, "content-type": "application/json" }, body: method === "GET" ? undefined : "{}" });
        assert.equal(r.status, 404, `${method} ${p}`);
      }
    }
  });
});

test("quota: deposits per hour and bytes per hour are enforced, the smaller of grant and operator cap", async () => {
  await withServer(true, async (s) => {
    const g = grant({ per: 2 });
    const auth = `Guest ${g.token}`;
    assert.equal((await deposit(s.base, auth)).status, 201);
    assert.equal((await deposit(s.base, auth)).status, 201);
    assert.equal((await deposit(s.base, auth)).status, 429);
    const b = grant({ bytes: 8 });
    assert.equal((await deposit(s.base, `Guest ${b.token}`, "t2", Buffer.alloc(5).toString("base64"))).status, 201);
    assert.equal((await deposit(s.base, `Guest ${b.token}`, "t2", Buffer.alloc(5).toString("base64"))).status, 429);
    // an unrelated grant is not affected
    assert.equal((await deposit(s.base, `Guest ${grant().token}`, "t3")).status, 201);
  });
});

test("storage stays blind: same five columns, and no grant id or token is in the database files", async () => {
  await withServer(true, async (s) => {
    const g = grant();
    assert.equal((await deposit(s.base, `Guest ${g.token}`, "blindTag")).status, 201);
    s.store.checkpointWal();
    const Database = require("better-sqlite3");
    const db = new Database(path.join(s.dir, "node-mesh.sqlite"), { readonly: true });
    const cols = db.prepare("PRAGMA table_info(blobs)").all().map((c: { name: string }) => c.name);
    db.close();
    assert.deepEqual(cols, ["id", "tag", "blob", "created_at", "expires_at"]);
    for (const f of fs.readdirSync(s.dir)) {
      const bytes = fs.readFileSync(path.join(s.dir, f));
      assert.equal(bytes.includes(g.id), false, `grant id in ${f}`);
      assert.equal(bytes.includes(Buffer.from(g.token)), false, `token in ${f}`);
      assert.equal(bytes.includes(Buffer.from(deriveGuestKey(OWNER))), false, `key in ${f}`);
    }
  });
});

test("a guest cannot ask for a longer life than the node allows (TTL cap unchanged)", async () => {
  await withServer(true, async (s) => {
    const res = await fetch(`${s.base}/deposit`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Guest ${grant().token}` },
      body: JSON.stringify({ routing_tag: "ttlTag", ciphertext: "aGVsbG8=", ttl: 10 * DAY }),
    });
    assert.equal(res.status, 201);
    const Database = require("better-sqlite3");
    s.store.checkpointWal();
    const db = new Database(path.join(s.dir, "node-mesh.sqlite"), { readonly: true });
    const row = db.prepare("SELECT created_at, expires_at FROM blobs WHERE tag = 'ttlTag'").get() as { created_at: number; expires_at: number };
    db.close();
    assert.ok(row.expires_at - row.created_at <= 6 * 3_600_000 + 1000, "default node TTL is 6 h");
  });
});

test("test vectors in guest-grants/vectors.json match the implementation and verify", () => {
  const onDisk = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "..", "guest-grants", "vectors.json"), "utf8"));
  assert.deepEqual(onDisk, JSON.parse(JSON.stringify(buildVectors())));
  const androidCopy = path.join(__dirname, "..", "..", "..", "app", "src", "test", "resources", "guest-grant-vectors.json");
  if (fs.existsSync(androidCopy)) assert.deepEqual(JSON.parse(fs.readFileSync(androidCopy, "utf8")), onDisk, "Android test copy must equal guest-grants/vectors.json");
  const key = deriveGuestKey(onDisk.ownerSecret);
  for (const c of onDisk.cases) {
    const r = verifyGuestGrant(c.token, key, c.notAfterMs - 1000, 365 * DAY * 50);
    assert.equal(r.ok, true, c.name);
  }
});

test("scope: encode/decode round-trip, range checks, and the slot-scope vector decodes", () => {
  const entries = [{ node: 0, slotFrom: 0, slotTo: 9 }, { node: 249, slotFrom: 0, slotTo: 99 }];
  const bytes = encodeScope(entries);
  assert.equal(bytes.toString("hex"), "0000000900f90063");
  assert.deepEqual(decodeScope(bytes), entries);
  assert.equal(scopeAllows(entries, 0, 9), true);
  assert.equal(scopeAllows(entries, 0, 10), false);
  assert.equal(scopeAllows(entries, 1, 0), false);
  assert.equal(scopeAllows(entries, 249, 99), true);
  assert.throws(() => encodeScope([{ node: 250, slotFrom: 0, slotTo: 0 }]));
  assert.throws(() => encodeScope([{ node: 0, slotFrom: 5, slotTo: 4 }]));
  assert.throws(() => encodeScope([{ node: 0, slotFrom: 0, slotTo: 100 }]));
  assert.equal(decodeScope(Buffer.from("000000", "hex")), null, "length not a multiple of 4");
  assert.equal(decodeScope(Buffer.from("00fa0000", "hex")), null, "node 250 does not exist");
  assert.equal(decodeScope(Buffer.from("00000a09", "hex")), null, "slotTo below slotFrom");
});

async function startMulti(resolve: (body: unknown) => { node: number; slot: number } | null) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "node-mesh-scope-test-"));
  const store = new NodeStore(path.join(dir, "node-mesh.sqlite"));
  const app = createApp(store, OWNER, { enabled: true, maxValidityMs: 30 * DAY, requireScope: true, resolveTarget: resolve });
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  return { server, store, base: `http://127.0.0.1:${port}` };
}

test("multi-slot mode: empty scope fails closed, deposits outside the granted slots are 403, inside are 201", async () => {
  // test host mapping: tag "n<node>s<slot>" lands in that node and slot
  const resolve = (body: unknown) => {
    const m = /^n(\d+)s(\d+)$/.exec(String((body as { routing_tag?: string })?.routing_tag ?? ""));
    return m ? { node: Number(m[1]), slot: Number(m[2]) } : null;
  };
  const s = await startMulti(resolve);
  try {
    const scoped = `Guest ${grant({ scope: encodeScope([{ node: 3, slotFrom: 10, slotTo: 12 }]) }).token}`;
    assert.equal((await deposit(s.base, scoped, "n3s10")).status, 201);
    assert.equal((await deposit(s.base, scoped, "n3s12")).status, 201);
    assert.equal((await deposit(s.base, scoped, "n3s13")).status, 403, "slot outside range");
    assert.equal((await deposit(s.base, scoped, "n4s10")).status, 403, "other node");
    assert.equal((await deposit(s.base, scoped, "unmapped")).status, 403, "target cannot be resolved");
    assert.equal((await deposit(s.base, `Guest ${grant().token}`, "n3s10")).status, 401, "empty scope fails closed");
    assert.equal((await deposit(s.base, `Guest ${grant({ scope: Buffer.from("0102", "hex") }).token}`, "n3s10")).status, 401, "malformed scope");
    assert.equal((await deposit(s.base, `Bearer ${OWNER}`, "n9s9")).status, 201, "owner is not limited by scope");
  } finally {
    s.server.close();
    s.store.close();
  }
});
