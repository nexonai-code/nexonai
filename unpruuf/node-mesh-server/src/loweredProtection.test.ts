import test from "node:test";
import assert from "node:assert/strict";
import { loweredProtection } from "./loweredProtection";

const onion = "a".repeat(56) + ".onion";

test("a default start lowers nothing except the unsigned-release notice", () => {
  assert.deepEqual(loweredProtection({ NODE_MESH_REQUIRE_SIGNED: "1" }), []);
});

test("every setting that gives less protection is named", () => {
  const notes = loweredProtection({
    NODE_MESH_KEY_STORAGE: "disk", NODE_MESH_TOR: "0", ADMIN_BIND: "0.0.0.0", NODE_MESH_PRINT_OWNER_CODE: "1",
    NODE_MESH_MAX_BLOBS: "999999", TOR_EXE_PATH: "/tmp/tor", NODE_MESH_TOR_BIN_DIR: "/tmp/tor-bin", NODE_MESH_PUBLIC_ADDRESS: "firma.example",
  });
  for (const word of ["KEY_STORAGE", "NODE_MESH_TOR=0", "ADMIN_BIND", "PRINT_OWNER_CODE", "MAX_BLOBS", "TOR_EXE_PATH", "TOR_BIN_DIR", "PUBLIC_ADDRESS", "REQUIRE_SIGNED"]) {
    assert.ok(notes.some((n) => n.includes(word)), `${word} is named`);
  }
});

test("loopback bind and a real onion address are not warned about", () => {
  assert.deepEqual(loweredProtection({ NODE_MESH_REQUIRE_SIGNED: "1", ADMIN_BIND: "127.0.0.1", NODE_MESH_PUBLIC_ADDRESS: onion }), []);
});
