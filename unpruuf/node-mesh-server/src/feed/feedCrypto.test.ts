import test from "node:test";
import assert from "node:assert/strict";
import * as crypto from "crypto";
import {
  activeEpochs, base32, buildFeedCode, candidateEpochs, deriveEpochKey, ed25519PublicKeyBytes, epochOf, LIST_SEPARATOR,
  onionAddressFromPublicKey, openList, parseFeedCode, sealList, splitLists,
} from "./feedCrypto";

const B32 = "abcdefghijklmnopqrstuvwxyz234567";
function base32Decode(s: string): Buffer {
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of s) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

test("address derivation reproduces a real, published v3 onion address (checksum, version, base32)", () => {
  const real = "duckduckgogg42xjoc72x3sjasowoarfbgcmvfimaftt6twagswzczad.onion";
  const raw = base32Decode(real.replace(".onion", ""));
  assert.equal(raw.length, 35);
  assert.equal(onionAddressFromPublicKey(raw.subarray(0, 32)), real);
  assert.equal(base32(raw), real.replace(".onion", ""));
});

test("the expanded key we hand to Tor belongs to the public key the app derives (RFC 8032)", () => {
  const seed = Buffer.alloc(32, 7);
  const k = deriveEpochKey(seed, 123);
  const expanded = Buffer.from(k.torPrivateKey.replace("ED25519-V3:", ""), "base64");
  assert.equal(expanded.length, 64);
  assert.equal(expanded[0] & 7, 0);          // clamped
  assert.equal(expanded[31] & 128, 0);
  assert.equal(expanded[31] & 64, 64);
  assert.match(k.address, /^[a-z2-7]{56}\.onion$/);
  // deterministic, and a different period or seed gives a different address
  assert.equal(deriveEpochKey(seed, 123).address, k.address);
  assert.notEqual(deriveEpochKey(seed, 124).address, k.address);
  assert.notEqual(deriveEpochKey(Buffer.alloc(32, 8), 123).address, k.address);
  // the public key is the standard Ed25519 key of the HKDF seed
  const hk = Buffer.from(crypto.hkdfSync("sha256", seed, Buffer.from("unpruuf-feed-v1"), Buffer.from("onion-epoch:123"), 32));
  assert.deepEqual(k.publicKey, ed25519PublicKeyBytes(hk));
});

test("fixed vectors the Android app is tested against", () => {
  const seed = Buffer.from(Array.from({ length: 32 }, (_, i) => i));
  assert.equal(deriveEpochKey(seed, 0).address.length, 62);
  // printed so FeedCryptoTest.kt can pin them (see the assertion below: they must not change silently)
  const v = [0, 1, 487_000].map((e) => deriveEpochKey(seed, e).address);
  assert.deepEqual(v, VECTORS);
});

const VECTORS: string[] = [
  "hfiaszo4x6jyvu52kdpkmqmon5lz35cy4y2n545fzoaeuhchk3kcvfid.onion",
  "sq3dmrqovfunbvrw2asrvgsrubxhzrpeh7dzhj5wdptxm37w45sh2fqd.onion",
  "4k3wbhbac4wsd3a4tysovt326rccay44jeswop4lx2igemdtv5rgftid.onion",
];

test("epochs: the server keeps next and previous online around the switch, the app tries the likely one first", () => {
  const H = 3_600_000;
  const t0 = 1000 * 6 * H;            // exactly at the start of epoch 1000 (6h periods)
  assert.equal(epochOf(t0, 6), 1000);
  assert.deepEqual(activeEpochs(t0 + 2 * H, 6), [1000]);
  assert.deepEqual(activeEpochs(t0 + 6 * H - 10 * 60_000, 6), [1000, 1001]);   // 10 min before the switch
  assert.deepEqual(activeEpochs(t0 + 10 * 60_000, 6), [999, 1000]);            // 10 min after
  assert.deepEqual(candidateEpochs(t0 + 2 * H, 6), [1000]);
  assert.deepEqual(candidateEpochs(t0 + 20 * 60_000, 6), [1000, 999]);
  assert.deepEqual(candidateEpochs(t0 + 6 * H - 20 * 60_000, 6), [1000, 1001]);
});

test("feed code round-trips and rejects anything malformed", () => {
  const c = { name: "Acme | GmbH", periodHours: 6, addressSeed: crypto.randomBytes(32), contentKey: crypto.randomBytes(32), signPublicKey: crypto.randomBytes(32) };
  const back = parseFeedCode(buildFeedCode(c))!;
  assert.equal(back.name, "Acme GmbH");
  assert.equal(back.periodHours, 6);
  assert.deepEqual(back.contentKey, c.contentKey);
  assert.equal(parseFeedCode("unpruuf-feed:v1:1|x|99|a|b|c"), null);
  assert.equal(parseFeedCode(buildFeedCode(c).replace(/\|[^|]*$/, "|short")), null);
  assert.equal(parseFeedCode("nonsense"), null);
});

test("a list verifies and decrypts only with the right keys; tampering and a foreign signer are refused", () => {
  const contentKey = crypto.randomBytes(32);
  const signSeed = crypto.randomBytes(32);
  const signPub = ed25519PublicKeyBytes(signSeed);
  const plaintext = ["unpruuf-node-list:v1\nname: A", "unpruuf-node-list:v1\nname: B"].join(LIST_SEPARATOR);
  const blob = sealList({ plaintext, contentKey, signSeed, seq: 7, issuedAtMs: 1_790_000_000_000 });
  const opened = openList(blob, contentKey, signPub)!;
  assert.equal(opened.seq, 7);
  assert.equal(opened.plaintext, plaintext);
  assert.equal(splitLists(opened.plaintext).length, 2);

  assert.equal(openList(blob, crypto.randomBytes(32), signPub), null);                       // wrong content key
  assert.equal(openList(blob, contentKey, ed25519PublicKeyBytes(crypto.randomBytes(32))), null); // not signed by the company
  assert.equal(openList(blob.replace("seq: 7", "seq: 9"), contentKey, signPub), null);      // seq rolled forward by hand
  assert.equal(openList(blob.replace(/data: (.)/, (_m, c) => `data: ${c === "A" ? "B" : "A"}`), contentKey, signPub), null);
  assert.equal(openList("", contentKey, signPub), null);
});
