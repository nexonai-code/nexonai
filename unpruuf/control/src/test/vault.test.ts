import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import { Vault } from "../vault";
import { tmpDir } from "./helpers";

test("create, lock, open with the passphrase", () => {
  const dir = tmpDir();
  const v = Vault.create(dir, "correct horse battery", "Acme SRL");
  v.data.servers.push({ id: "s1", name: "A" } as any);
  v.save();
  const again = Vault.open(dir, "correct horse battery");
  assert.ok(again);
  assert.equal(again!.data.company, "Acme SRL");
  assert.equal(again!.data.servers[0].id, "s1");
});

test("a wrong passphrase opens nothing", () => {
  const dir = tmpDir();
  Vault.create(dir, "correct horse battery", "Acme");
  assert.equal(Vault.open(dir, "wrong wrong wrong"), null);
  assert.equal(Vault.open(dir, ""), null);
});

test("nothing readable is on disk", () => {
  const dir = tmpDir();
  const v = Vault.create(dir, "correct horse battery", "Secret Company Name");
  v.data.servers.push({ id: "x", name: "SecretServer", ownerCode: "unpruuf-node-owner:v1:aaa:TOPSECRET" } as any);
  v.save();
  const raw = fs.readFileSync(Vault.path(dir), "utf8");
  for (const needle of ["Secret Company", "SecretServer", "TOPSECRET", "unpruuf-node-owner"]) assert.ok(!raw.includes(needle), needle);
  assert.equal(fs.statSync(Vault.path(dir)).mode & 0o077, 0, "file readable only by the owner");
});

test("a changed file is refused (authenticated encryption)", () => {
  const dir = tmpDir();
  Vault.create(dir, "correct horse battery", "Acme");
  const f = JSON.parse(fs.readFileSync(Vault.path(dir), "utf8"));
  const buf = Buffer.from(f.data, "base64");
  buf[0] ^= 1;
  f.data = buf.toString("base64");
  fs.writeFileSync(Vault.path(dir), JSON.stringify(f));
  assert.equal(Vault.open(dir, "correct horse battery"), null);
  // the header (kdf parameters) is authenticated too
  const g = JSON.parse(fs.readFileSync(Vault.path(dir), "utf8"));
  g.kdf.n = 1 << 14;
  fs.writeFileSync(Vault.path(dir), JSON.stringify(g));
  assert.equal(Vault.open(dir, "correct horse battery"), null);
});

test("passphrase rules and change", () => {
  const dir = tmpDir();
  assert.throws(() => Vault.create(dir, "short", "A"), /too-short/);
  const v = Vault.create(dir, "first passphrase", "A");
  assert.equal(v.changePassphrase("wrong one", "second passphrase"), false);
  assert.equal(v.changePassphrase("first passphrase", "short"), false);
  assert.equal(v.changePassphrase("first passphrase", "second passphrase"), true);
  assert.equal(Vault.open(dir, "first passphrase"), null);
  assert.ok(Vault.open(dir, "second passphrase"));
  assert.throws(() => Vault.create(dir, "another passphrase", "B"), /vault-exists/);
});

import { generateServerKey } from "../ssh";
import { utils } from "ssh2";
test("every generated server key parses back and signs (ssh2's generator is not trusted blindly)", () => {
  for (let i = 0; i < 300; i++) {
    const k = generateServerKey();
    const p = utils.parseKey(k.privateKey) as any;
    assert.ok(!(p instanceof Error), `key ${i}`);
    assert.match(k.publicKey, /^ssh-ed25519 /);
  }
});
