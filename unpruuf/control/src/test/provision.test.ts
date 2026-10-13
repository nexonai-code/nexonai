import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "child_process";
import {
  Ctx, PREFLIGHT_SCRIPT, HARDEN_SCRIPT, UPLOAD_SCRIPT, EXTRACT_SCRIPT, DOCKER_INSTALL_SCRIPT, authorizedKeyScript, buildScript, runScript,
  REMOVE_SCRIPT, CONTAINER_STATE_SCRIPT, addAndInstall, checkPreflight, defaultsFor, exportList, getStatus, installServer, nextSlot, parsePreflight,
  probeServer, removeServer, rotateWriteKey, setBridges, unlockServer, updateServer, validateNewServer, NewServerInput,
} from "../provision";
import { LicenseInventory } from "../licenses";
import { Vault, ServerRecord } from "../vault";
import { FakeVps, VpsOptions, appCode, makeBundle, newKeys, serverCode, tmpDir } from "./helpers";
import { Remote, generateServerKey } from "../ssh";

const keys = newKeys();

async function setup(vps: VpsOptions = {}, licenses = 1) {
  const fake = new FakeVps(keys, vps);
  await fake.start();
  const vault = Vault.create(tmpDir(), "test passphrase", "Acme SRL");
  const inventory = new LicenseInventory(vault.data.licenses, vault.data.servers, keys.publicKeyB64);
  for (let i = 1; i <= licenses; i++) inventory.importText(serverCode(keys, `SRV-000${i}`));
  const logs: string[] = [];
  const ctx: Ctx = { vault, inventory, bundle: makeBundle(), log: (l) => logs.push(l), pollMs: 20, waitAdminMs: 3000, waitOwnerMs: 3000 };
  const input = async (over: Partial<NewServerInput> = {}): Promise<NewServerInput> => {
    const probe = await probeServer({ host: "127.0.0.1", port: fake.port, user: fake.opts.user, password: fake.opts.password });
    return {
      name: "Server A", host: "127.0.0.1", port: fake.port, user: fake.opts.user, password: fake.opts.password, hostKey: probe.hostKey,
      provider: "Hetzner", region: "Falkenstein", product: "business", ...defaultsFor("business"), hardenPassword: true, license: "auto", ...over,
    };
  };
  return { fake, vault, inventory, ctx, logs, input, done: () => fake.stop() };
}

test("every remote script is valid shell syntax", () => {
  const key = generateServerKey().publicKey;
  const scripts: Record<string, string> = {
    preflight: PREFLIGHT_SCRIPT, harden: HARDEN_SCRIPT, upload: UPLOAD_SCRIPT, extract: EXTRACT_SCRIPT, docker: DOCKER_INSTALL_SCRIPT,
    authkey: authorizedKeyScript(key), build: buildScript("0123456789ab"), run: runScript({ slot: 2, profile: "standard", store: "ram" }, "0123456789ab"),
    remove: REMOVE_SCRIPT(true), removeKeep: REMOVE_SCRIPT(false), state: CONTAINER_STATE_SCRIPT,
  };
  for (const [name, s] of Object.entries(scripts)) {
    assert.doesNotThrow(() => execFileSync("sh", ["-n"], { input: s }), name);
  }
});

test("the preflight script really runs here and its output parses", () => {
  const out = execFileSync("sh", ["-c", PREFLIGHT_SCRIPT]).toString();
  const p = parsePreflight(out);
  assert.equal(p.kernel, "Linux");
  assert.ok(["x86_64", "aarch64"].includes(p.arch), p.arch);
  assert.ok(p.diskMB > 0 && p.memMB > 0);
});

test("preflight verdicts", () => {
  const ok = parsePreflight("kernel=Linux\narch=x86_64\nos=ubuntu\nuid=0\ndocker=none\nsudo=no\ndiskMB=9000\nmemMB=2048\nport8790=0\ncontainer=0\n");
  assert.deepEqual(checkPreflight(ok, "root"), { blocking: [], warnings: [] });
  assert.deepEqual(checkPreflight({ ...ok, kernel: "Darwin" }, "root").blocking, ["not-linux"]);
  assert.deepEqual(checkPreflight({ ...ok, arch: "armv7l" }, "root").blocking, ["arch"]);
  assert.deepEqual(checkPreflight({ ...ok, uid: 1000, sudo: false }, "bob").blocking, ["no-root"]);
  assert.deepEqual(checkPreflight({ ...ok, diskMB: 500 }, "root").blocking, ["disk"]);
  assert.deepEqual(checkPreflight({ ...ok, memMB: 300 }, "root").blocking, ["memory"]);
  assert.deepEqual(checkPreflight({ ...ok, memMB: 800 }, "root"), { blocking: [], warnings: ["memory-low"] });
  assert.deepEqual(checkPreflight({ ...ok, os: "alpine" }, "root").blocking, ["docker-manual"]);
  assert.deepEqual(checkPreflight({ ...ok, os: "alpine", docker: "Docker version 1" }, "root").blocking, []);
  assert.deepEqual(checkPreflight({ ...ok, port8790: 1 }, "root").blocking, ["port-busy"]);
  assert.deepEqual(checkPreflight({ ...ok, port8790: 1, container: 1 }, "root"), { blocking: [], warnings: ["existing-container"] });
});

test("the run script refuses anything that is not a known setting (no shell injection through settings)", () => {
  assert.throws(() => runScript({ slot: 1, profile: "standard; rm -rf /" as any, store: "disk" }, "0123456789ab"));
  assert.throws(() => runScript({ slot: 9 as any, profile: "standard", store: "disk" }, "0123456789ab"));
  assert.throws(() => runScript({ slot: 1, profile: "standard", store: "disk" }, "abc; id"));
  const s = runScript({ slot: 3, profile: "offline-tolerant", store: "ram" }, "0123456789ab");
  assert.match(s, /-p 127\.0\.0\.1:8790:8790/, "the setup page is published on the VPS loopback only");
  assert.match(s, /NODE_MESH_STORE=ram/);
});

test("server input validation", () => {
  const base: NewServerInput = { name: "A", host: "10.0.0.1", port: 22, user: "root", password: "x", hostKey: "SHA256:abc", provider: "", region: "", product: "business", profile: "standard", store: "disk", hardenPassword: true, license: "auto" };
  assert.equal(validateNewServer(base, []), null);
  assert.equal(validateNewServer({ ...base, host: "a b" }, []), "host");
  assert.equal(validateNewServer({ ...base, host: "x;rm" }, []), "host");
  assert.equal(validateNewServer({ ...base, port: 70000 }, []), "port");
  assert.equal(validateNewServer({ ...base, user: "root; id" }, []), "user");
  assert.equal(validateNewServer({ ...base, hostKey: "" }, []), "hostkey");
  assert.equal(validateNewServer({ ...base, name: " " }, []), "name");
  assert.equal(validateNewServer(base, [{ host: "10.0.0.1", port: 22, name: "Z" } as any]), "duplicate-host");
  assert.equal(validateNewServer(base, [{ host: "10.0.0.2", port: 22, name: "a" } as any]), "duplicate-name");
  assert.deepEqual([nextSlot([]), nextSlot([{ slot: 1 }] as any), nextSlot([{ slot: 1 }, { slot: 2 }, { slot: 3 }] as any)], [1, 2, 1]);
  assert.deepEqual(defaultsFor("business"), { profile: "standard", store: "disk" });
  assert.deepEqual(defaultsFor("press"), { profile: "offline-tolerant", store: "disk" });
});

test("probe: reports the host key and verdict, changes nothing", async () => {
  const t = await setup();
  const p = await probeServer({ host: "127.0.0.1", port: t.fake.port, user: "root", password: t.fake.opts.password });
  assert.equal(p.hostKey, t.fake.hostKeyFingerprint);
  assert.deepEqual(p.verdict.blocking, []);
  assert.deepEqual(t.fake.stepNames(), ["preflight"]);
  await assert.rejects(probeServer({ host: "127.0.0.1", port: t.fake.port, user: "root", password: "wrong" }), /Login failed/);
  t.done();
});

test("full installation on a fresh Ubuntu VPS", async () => {
  const t = await setup();
  const rec = await addAndInstall(t.ctx, await t.input());
  // steps, in order
  assert.deepEqual(t.fake.stepNames(), ["preflight", "authkey", "preflight", "harden", "docker-install", "upload", "extract", "build", "run"]);
  // key-based access works and the password login was switched off
  assert.equal(t.fake.authorizedKeys.length, 1);
  assert.equal(t.fake.authorizedKeys[0], rec.sshPublicKey);
  assert.equal(t.fake.hardened, true);
  assert.equal(rec.passwordLoginDisabled, true);
  // the software arrived intact and is a valid tarball
  assert.deepEqual(t.fake.uploaded, t.ctx.bundle!.data);
  assert.equal(t.fake.uploadValid, true);
  // the container got the chosen settings
  assert.deepEqual(t.fake.runEnv, { NODE_SLOT: "1", NODE_PROFILE: "standard", NODE_MESH_STORE: "disk", ADMIN_PORT: "8790" });
  // licence applied through the setup page, write code kept
  assert.equal(t.fake.admin.license?.serial, "SRV-0001");
  assert.equal(rec.licenseSerial, "SRV-0001");
  assert.equal(t.inventory.bySerial("server", "SRV-0001")!.assigned?.type, "server");
  assert.equal(rec.ownerCode, t.fake.admin.ownerString);
  assert.ok(rec.installedAt);
  assert.equal(rec.installedVersion, "9.9.9");
  // the password is nowhere in the vault, nor in the log
  const dump = JSON.stringify(t.vault.data) + t.logs.join("\n");
  assert.ok(!dump.includes(t.fake.opts.password));
  // saved and reopenable
  assert.equal(Vault.open(t.vault["file"].replace(/vault\.enc$/, ""), "test passphrase")!.data.servers.length, 1);
  t.done();
});

test("the setup page was reached with the loopback host and the admin header, never opened", async () => {
  const t = await setup();
  await addAndInstall(t.ctx, await t.input());
  assert.ok(t.fake.admin.requests.length >= 3);
  assert.ok(t.fake.admin.requests.every((r) => ["/status.json", "/license"].includes(r.url)));
  t.done();
});

test("a second run changes nothing it does not have to (key login, no new key, no password needed)", async () => {
  const t = await setup();
  const rec = await addAndInstall(t.ctx, await t.input());
  const keysBefore = [...t.fake.authorizedKeys];
  t.fake.steps.length = 0;
  await installServer(t.ctx, rec, {});
  assert.deepEqual(t.fake.authorizedKeys, keysBefore);
  assert.ok(!t.fake.stepNames().includes("authkey"));
  assert.ok(!t.fake.stepNames().includes("docker-install"));
  t.done();
});

test("without a free licence nothing is touched on the VPS", async () => {
  const t = await setup({}, 0);
  await assert.rejects(addAndInstall(t.ctx, await t.input()), /no-free-license/);
  assert.deepEqual(t.fake.stepNames(), ["preflight"], "only the probe from input()");
  assert.equal(t.vault.data.servers.length, 0);
  t.done();
});

test("a chosen serial is used; an unknown serial is refused", async () => {
  const t = await setup({}, 2);
  await assert.rejects(addAndInstall(t.ctx, await t.input({ license: "NOPE" })), /unknown-license/);
  const rec = await addAndInstall(t.ctx, await t.input({ license: "SRV-0002" }));
  assert.equal(rec.licenseSerial, "SRV-0002");
  t.done();
});

test("install without a licence: server runs and waits, nothing is assigned", async () => {
  const t = await setup({}, 0);
  const rec = await addAndInstall(t.ctx, await t.input({ license: "none" }));
  assert.equal(rec.licenseSerial, null);
  assert.equal(t.fake.admin.license, null);
  assert.equal(rec.ownerCode, null);
  t.done();
});

test("a blocked VPS stops before anything is installed, and the record can be retried", async () => {
  const t = await setup({ diskMB: 500 });
  const i = await t.input();
  await assert.rejects(addAndInstall(t.ctx, i), /preflight:disk/);
  const steps = t.fake.stepNames();
  assert.ok(!steps.includes("docker-install") && !steps.includes("upload") && !steps.includes("run"));
  // the licence is reserved for the (failed) server; retrying after freeing disk works
  assert.equal(t.vault.data.servers.length, 1);
  t.fake.opts.diskMB = 20000;
  await installServer(t.ctx, t.vault.data.servers[0], { password: t.fake.opts.password });
  assert.ok(t.vault.data.servers[0].installedAt);
  t.done();
});

test("a failing build is reported and leaves the server not installed", async () => {
  const t = await setup({ failBuild: true });
  await assert.rejects(addAndInstall(t.ctx, await t.input()), /build-failed/);
  assert.equal(t.vault.data.servers[0].installedAt, null);
  assert.equal(t.fake.containerRunning, false);
  t.done();
});

test("a non-root login uses sudo for every privileged step", async () => {
  const t = await setup({ user: "deploy", docker: true });
  const rec = await addAndInstall(t.ctx, await t.input({ user: "deploy" }));
  assert.ok(rec.installedAt);
  for (const s of t.fake.steps.filter((x) => ["upload", "extract", "build", "run", "harden"].includes(x.step))) assert.ok(s.cmd.startsWith("sudo -n sh -c "), s.step);
  t.done();
});

test("Docker is installed only when it is missing", async () => {
  const t = await setup({ docker: true });
  await addAndInstall(t.ctx, await t.input());
  assert.ok(!t.fake.stepNames().includes("docker-install"));
  t.done();
});

test("wrong password on first install is a clear error, no state change on the VPS", async () => {
  const t = await setup();
  const i = await t.input();
  await assert.rejects(addAndInstall(t.ctx, { ...i, password: "nope" }), /Login failed/);
  assert.equal(t.fake.authorizedKeys.length, 0);
  t.done();
});

test("a server whose identity changed is refused (host key pinning)", async () => {
  const t = await setup();
  const rec = await addAndInstall(t.ctx, await t.input());
  const other = new FakeVps(keys); // another machine answering on the same address
  await other.start();
  const moved = { ...rec, port: other.port } as ServerRecord;
  await assert.rejects(Remote.connect({ host: "127.0.0.1", port: other.port, username: "root", privateKey: rec.sshPrivateKey, hostKey: rec.hostKey }), /identity changed/);
  await assert.rejects(getStatus(t.ctx, moved).then((s) => { if (!s.reachable) throw new Error(s.error ?? ""); return s; }), /host-key/);
  other.stop(); t.done();
});

test("status: healthy, locked after restart, unlocked from the vault", async () => {
  const t = await setup();
  const rec = await addAndInstall(t.ctx, await t.input());
  let st = await getStatus(t.ctx, rec);
  assert.equal(st.reachable, true);
  assert.equal(st.level, "ok");
  assert.equal(st.nodes?.registered, 250);
  assert.equal(st.license?.serial, "SRV-0001");
  t.fake.admin.locked = true; // the VPS rebooted
  st = await getStatus(t.ctx, rec);
  assert.equal(st.level, "locked");
  assert.equal(st.locked, true);
  await unlockServer(t.ctx, rec);
  st = await getStatus(t.ctx, rec);
  assert.equal(st.locked, false);
  t.done();
});

test("status: stopped container and unreachable VPS are reported, not thrown", async () => {
  const t = await setup();
  const rec = await addAndInstall(t.ctx, await t.input());
  t.fake.containerRunning = false;
  const stopped = await getStatus(t.ctx, rec);
  assert.equal(stopped.level, "down");
  assert.equal(stopped.error, "container-stopped");
  assert.equal(stopped.reachable, true, "the VPS answers, only the container is gone");
  t.done();
  const st = await getStatus(t.ctx, rec);
  assert.equal(st.reachable, false);
  assert.equal(st.level, "down");
});

test("status picks up the write code later if the addresses were not ready at install", async () => {
  const t = await setup();
  t.ctx.waitOwnerMs = 100;
  const rec = await addAndInstall(t.ctx, await t.input());
  rec.ownerCode = null;
  await getStatus(t.ctx, rec);
  assert.equal(rec.ownerCode, t.fake.admin.ownerString);
  t.done();
});

test("unlock without a stored code, and with a wrong one, fails clearly", async () => {
  const t = await setup();
  const rec = await addAndInstall(t.ctx, await t.input());
  rec.ownerCode = null;
  await assert.rejects(unlockServer(t.ctx, rec), /no-owner-code/);
  rec.ownerCode = "unpruuf-node-owner:v1:x.onion:WRONGWRONGWRONGWRONG";
  await assert.rejects(unlockServer(t.ctx, rec), /unlock-rejected/);
  t.done();
});

test("node list export, bridges and write-key rotation go through the setup page", async () => {
  const t = await setup();
  const rec = await addAndInstall(t.ctx, await t.input());
  const list = await exportList(rec);
  assert.match(list, /OWNERSECRET0123456789/);
  const b = await setBridges(t.ctx, rec, "obfs4 1.2.3.4:443 AAA cert=x iat-mode=0\ngarbage line");
  assert.deepEqual(b, { saved: 1, rejected: 1 });
  assert.equal(rec.bridgeText.startsWith("obfs4"), true);
  await rotateWriteKey(t.ctx, rec);
  assert.equal(rec.ownerCode, t.fake.admin.ownerString);
  assert.match(rec.ownerCode!, /ROTATEDSECRET/);
  assert.match(await exportList(rec), /ROTATEDSECRET/, "the list now carries the new key");
  t.fake.admin.locked = true;
  await assert.rejects(exportList(rec), /export-failed:locked/);
  t.done();
});

test("update: new software goes up, data stays, the server is unlocked again", async () => {
  const t = await setup();
  const rec = await addAndInstall(t.ctx, await t.input());
  const addressBefore = t.fake.admin.ownerString;
  const newer = makeBundle();
  newer.data = Buffer.concat([newer.data.subarray(0, newer.data.length)]);
  t.ctx.bundle = { ...newer, info: { ...newer.info, version: "10.0.0", sha256: newer.info.sha256 } };
  t.fake.steps.length = 0;
  await updateServer(t.ctx, rec);
  assert.deepEqual(t.fake.stepNames(), ["upload", "extract", "build", "run"]);
  assert.equal(t.fake.admin.locked, false, "unlocked again with the stored code");
  assert.equal(t.fake.admin.ownerString, addressBefore, "same addresses");
  assert.equal(rec.installedVersion, "10.0.0");
  t.done();
});

test("remove: licence is freed; wipe also deletes the data", async () => {
  const t = await setup();
  const rec = await addAndInstall(t.ctx, await t.input());
  await removeServer(t.ctx, rec, true);
  assert.equal(t.vault.data.servers.length, 0);
  assert.equal(t.inventory.bySerial("server", "SRV-0001")!.assigned, null);
  assert.equal(t.fake.containerRunning, false);
  assert.ok(t.fake.steps.at(-1)!.cmd.includes("docker volume rm"));
  t.done();
});

test("an app code is not accepted as a server licence", async () => {
  const t = await setup({}, 0);
  t.inventory.importText(appCode(keys, "PRO-1"));
  assert.equal(t.inventory.nextFreeServerCode(), null);
  await assert.rejects(addAndInstall(t.ctx, await t.input()), /no-free-license/);
  t.done();
});
