import test from "node:test";
import assert from "node:assert/strict";
import { buildBridgeTorrc, composeBridgeLine, parseFingerprintFile, parseObfs4Template } from "./bridgeTorrc";

const TEMPLATE = `# obfs4 torrc client bridge line
#
# This file is an automatically generated bridge line based on the current obfs4proxy configuration.  EDITING IT WILL HAVE NO EFFECT.
#
# Before distributing this Bridge, edit the placeholder fields to contain the actual values:
#  <IP ADDRESS>  - The public IP address of your obfs4 bridge.
#  <PORT>        - The TCP/IP port of your obfs4 bridge.
#  <FINGERPRINT> - The bridge's fingerprint.

Bridge obfs4 <IP ADDRESS>:<PORT> <FINGERPRINT> cert=bjRaMrr1BRiAW8IE9U5z27fQaYgOhX1UCmOpg2pFpoMvo6ZgQMzLsaTzzQNTlm7hNcb+Sg iat-mode=0
`;
const FP = "D9A82D2F9C2F65A18407B1D2B764F130847F8B5D";

test("the torrc is a private bridge: unpublished, obfs4 on the chosen port, no SOCKS, owner watchdog", () => {
  const t = buildBridgeTorrc({ dataDir: "/d", lyrebirdPath: "/x/lyrebird", port: 443, ownerPid: 42 });
  for (const line of ["SocksPort 0", "BridgeRelay 1", "PublishServerDescriptor 0", "ExtORPort auto", "ServerTransportPlugin obfs4 exec /x/lyrebird", "ServerTransportListenAddr obfs4 0.0.0.0:443", "__OwningControllerProcess 42"]) {
    assert.ok(t.split("\n").includes(line), line);
  }
});

test("fingerprint and obfs4 template are read from the files Tor and lyrebird write", () => {
  assert.equal(parseFingerprintFile(`Unnamed ${FP}\n`), FP);
  assert.equal(parseFingerprintFile(`Unnamed ${FP.toLowerCase()}`), FP);
  assert.equal(parseFingerprintFile("Unnamed short"), null);
  const t = parseObfs4Template(TEMPLATE)!;
  assert.match(t.cert, /^cert=bjRaMrr1/);
  assert.equal(t.iat, "iat-mode=0");
  assert.equal(parseObfs4Template("nothing"), null);
});

test("the finished line is a valid bridge line; bad ingredients give nothing", () => {
  const t = parseObfs4Template(TEMPLATE)!;
  const line = composeBridgeLine("203.0.113.9", 443, FP, t)!;
  assert.equal(line, `obfs4 203.0.113.9:443 ${FP} ${t.cert} iat-mode=0`);
  assert.ok(composeBridgeLine("bridge.example.com", 8443, FP, t));
  assert.equal(composeBridgeLine("bad host;rm", 443, FP, t), null);
  assert.equal(composeBridgeLine("203.0.113.9", 70000, FP, t), null);
  assert.equal(composeBridgeLine("203.0.113.9", 443, "XYZ", t), null);
});
