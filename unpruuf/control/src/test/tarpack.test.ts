import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";
import { packTarGz } from "../tarpack";
import { makeZip, crc32 } from "../zip";
import { tmpDir } from "./helpers";

test("the tarball is a real tar.gz that `tar` can list and unpack, with exact contents", () => {
  const dir = tmpDir();
  const long = "src/" + "deep/".repeat(30) + "file.ts";
  const files = [
    { name: "package.json", data: Buffer.from('{"a":1}') },
    { name: "src/big.ts", data: Buffer.alloc(5000, 7) },
    { name: "src/empty.ts", data: Buffer.alloc(0) },
    { name: long, data: Buffer.from("x") },
  ];
  fs.writeFileSync(path.join(dir, "b.tgz"), packTarGz(files));
  const list = execFileSync("tar", ["-tzf", path.join(dir, "b.tgz")]).toString().split("\n").filter(Boolean);
  assert.deepEqual(list.sort(), files.map((f) => f.name).sort());
  execFileSync("tar", ["-xzf", path.join(dir, "b.tgz"), "-C", dir]);
  assert.equal(fs.readFileSync(path.join(dir, "package.json"), "utf8"), '{"a":1}');
  assert.equal(fs.readFileSync(path.join(dir, "src/big.ts")).length, 5000);
  assert.equal(fs.readFileSync(path.join(dir, long), "utf8"), "x");
});

test("the same input gives the same bytes (so the checksum is stable)", () => {
  const f = [{ name: "a", data: Buffer.from("1") }, { name: "b", data: Buffer.from("2") }];
  assert.deepEqual(packTarGz(f), packTarGz([...f].reverse()));
});

test("the zip opens with unzip and the CRCs match", () => {
  const dir = tmpDir();
  const z = makeZip([{ name: "one.txt", data: Buffer.from("hello") }, { name: "zwei äöü.txt", data: Buffer.from("world".repeat(100)) }]);
  fs.writeFileSync(path.join(dir, "x.zip"), z);
  const t = execFileSync("unzip", ["-t", path.join(dir, "x.zip")]).toString();
  assert.match(t, /No errors detected/);
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
});
