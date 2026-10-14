import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { pinnedTorSha256, verifyTorArchive } from "./torDownload";

function tmpFile(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tor-verify-"));
  const file = path.join(dir, "bundle.tar.gz");
  fs.writeFileSync(file, content);
  return file;
}

test("every platform the server can run on has a pinned 64-hex SHA-256", () => {
  for (const [platform, arch] of [["windows", "x86_64"], ["linux", "x86_64"], ["macos", "x86_64"], ["macos", "aarch64"]]) {
    assert.match(pinnedTorSha256(platform, arch) ?? "", /^[0-9a-f]{64}$/, `${platform}-${arch}`);
  }
});

test("a platform without a pinned hash is refused, never run unchecked", () => {
  assert.equal(pinnedTorSha256("linux", "riscv64"), null);
  assert.throws(() => verifyTorArchive(tmpFile("x"), "linux", "riscv64"), /no pinned SHA-256/);
});

test("a download that does not match the pinned hash is rejected before extraction", () => {
  assert.throws(() => verifyTorArchive(tmpFile("not the tor bundle"), "linux", "x86_64"), /does not match the pinned value/);
});

test("the real Tor Expert Bundle for Linux passes (skipped when it is not on disk)", { skip: !process.env.TOR_BUNDLE_LINUX_X86_64 }, () => {
  verifyTorArchive(process.env.TOR_BUNDLE_LINUX_X86_64!, "linux", "x86_64");
});
