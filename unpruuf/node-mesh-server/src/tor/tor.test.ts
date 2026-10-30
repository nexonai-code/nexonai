import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as net from "net";
import * as os from "os";
import * as path from "path";
import type { AddressInfo } from "net";
import { parseControlReply, TorControl } from "./torControl";
import { buildNodeTorrc, parseControlPortFile } from "./torProcess";

test("parseControlReply handles mid, data-block and end lines", () => {
  const raw = "250-ServiceID=abc\r\n250-PrivateKey=ED25519-V3:xyz\r\n250 OK\r\nleftover";
  const parsed = parseControlReply(raw)!;
  assert.equal(parsed.reply.status, 250);
  assert.deepEqual(parsed.reply.lines, ["ServiceID=abc", "PrivateKey=ED25519-V3:xyz", "OK"]);
  assert.equal(parsed.rest, "leftover");

  const block = "250+onions/current=\r\nabc\r\ndef\r\n.\r\n250 OK\r\n";
  assert.deepEqual(parseControlReply(block)!.reply.lines, ["onions/current=", "abc", "def", "OK"]);
  assert.equal(parseControlReply("250-partial\r\n"), null);
});

test("torrc is a pure onion host: no SOCKS, auto control port, cookie auth, owner-pid watchdog", () => {
  const torrc = buildNodeTorrc({ dataDir: "/d", controlPortFile: "/d/cp", ownerPid: 4242 });
  assert.match(torrc, /^SocksPort 0$/m);
  assert.match(torrc, /^ControlPort auto$/m);
  assert.match(torrc, /^CookieAuthentication 1$/m);
  assert.match(torrc, /^__OwningControllerProcess 4242$/m);
  assert.doesNotMatch(torrc, /HiddenServiceDir/, "onion key must never be managed via an on-disk HiddenServiceDir");
  assert.equal(parseControlPortFile("PORT=127.0.0.1:43127\n"), 43127);
});

/** Fake Tor control port — records commands, answers like real Tor 0.4.9 did in manual testing. */
function fakeTor(): Promise<{ port: number; commands: string[]; close: () => void; dropClient: () => void }> {
  const commands: string[] = [];
  const sockets: net.Socket[] = [];
  const server = net.createServer((socket) => {
    sockets.push(socket);
    let buf = "";
    socket.on("data", (d) => {
      buf += d.toString();
      let i: number;
      while ((i = buf.indexOf("\r\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        commands.push(line);
        if (line.startsWith("AUTHENTICATE")) socket.write("250 OK\r\n");
        else if (line.startsWith("ADD_ONION NEW")) socket.write("250-ServiceID=newservice\r\n250-PrivateKey=ED25519-V3:NEWKEY\r\n250 OK\r\n");
        else if (line.startsWith("ADD_ONION ED25519-V3:")) socket.write("250-ServiceID=sameservice\r\n250 OK\r\n");
        else if (line === "GETINFO onions/current") socket.write("250+onions/current=\r\nsameservice\r\n.\r\n250 OK\r\n");
        else socket.write("510 Unrecognized command\r\n");
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        port: (server.address() as AddressInfo).port,
        commands,
        close: () => { sockets.forEach((s) => s.destroy()); server.close(); },
        dropClient: () => sockets.forEach((s) => s.destroy()),
      });
    });
  });
}

test("TorControl authenticates with the cookie and creates a PoW-protected onion", async () => {
  const tor = await fakeTor();
  const cookieDir = fs.mkdtempSync(path.join(os.tmpdir(), "nm-cookie-"));
  const cookiePath = path.join(cookieDir, "control_auth_cookie");
  fs.writeFileSync(cookiePath, Buffer.from([0xde, 0xad, 0xbe, 0xef]));
  const control = await TorControl.connect(tor.port);
  try {
    await control.authenticateWithCookie(cookiePath);
    const created = await control.addOnion({ privateKey: null, localPort: 8788, pow: { queueRate: 250, queueBurst: 2500 } });
    assert.deepEqual(created, { serviceId: "newservice", privateKey: "ED25519-V3:NEWKEY" });
    const reused = await control.addOnion({ privateKey: "ED25519-V3:OLD", localPort: 8788, pow: { queueRate: 250, queueBurst: 2500 } });
    assert.deepEqual(reused, { serviceId: "sameservice", privateKey: "ED25519-V3:OLD" });
    assert.equal(await control.getInfo("onions/current"), "sameservice");
    await assert.rejects(control.signal("NOPE"), /510/);

    assert.equal(tor.commands[0], "AUTHENTICATE deadbeef");
    assert.equal(
      tor.commands[1],
      "ADD_ONION NEW:ED25519-V3 PoWDefensesEnabled=1 PoWQueueRate=250 PoWQueueBurst=2500 Port=80,127.0.0.1:8788",
    );
    assert.ok(tor.commands[2].startsWith("ADD_ONION ED25519-V3:OLD PoWDefensesEnabled=1"));
    await assert.rejects(control.command("GETINFO x\r\nSIGNAL HALT"), /single line/);
  } finally {
    control.close();
    tor.close();
  }
});

test("TorControl reports a dropped connection and rejects pending commands", async () => {
  const tor = await fakeTor();
  const control = await TorControl.connect(tor.port);
  const closed = new Promise<void>((resolve) => control.onClose(resolve));
  tor.dropClient();
  await closed;
  assert.equal(control.isClosed, true);
  await assert.rejects(control.command("GETINFO version"), /closed/);
  tor.close();
});
