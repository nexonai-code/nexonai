/**
 * `export-list`: writes the node list of the RUNNING server of this slot into a file next to the
 * program, without a browser. The server must be running because a sealed server keeps its write
 * key only in memory (nodeIdentity.ts) — so nothing is written at start, only on request.
 *
 *   export-list.bat | ./export-list.sh [slot 1-3] [target folder]
 *
 * It asks the setup page on this computer (loopback) with the access token from the data folder,
 * waits while the server is still creating its addresses, and saves the file readable for the
 * owner only. The file contains the write key of every node: move it to your own phone over a
 * cable or a trusted channel and delete it afterwards.
 */
import * as fs from "fs";
import * as http from "http";
import * as path from "path";
import { ADMIN_PORT, DATA_DIR, NODE_SLOT } from "./config";
import { ADMIN_TOKEN_FILE, ADMIN_TOKEN_HEADER } from "./admin/adminToken";
import { NODE_LIST_HEADER } from "./nodeList";

export interface ExportAnswer { status: number; text: string }

export function requestList(port: number, token: string, timeoutMs = 15_000): Promise<ExportAnswer> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        method: "POST", host: "127.0.0.1", port, path: "/export-list", timeout: timeoutMs,
        headers: { Host: `127.0.0.1:${port}`, "x-unpruuf-admin": "1", [ADMIN_TOKEN_HEADER]: token, "content-length": "0" },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }));
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

/** What to tell the person for an answer that is not the list. Null = keep waiting. */
export function explain(a: ExportAnswer): string | null {
  if (a.status === 409) return null;
  if (a.status === 423) return "Der Server ist gesperrt (nach einem Neustart). Erst entsperren: in der App oder in Control, dann dieses Skript noch einmal starten.";
  if (a.status === 403) return "Der Zugangs-Schluessel passt nicht (der Server wurde neu gestartet oder laeuft nicht). Server starten und noch einmal versuchen.";
  return `Unerwartete Antwort vom Server (${a.status}).`;
}

async function main(): Promise<void> {
  const target = path.resolve(process.argv[3] ?? process.cwd());
  const tokenFile = path.join(DATA_DIR, ADMIN_TOKEN_FILE);
  let token: string;
  try { token = fs.readFileSync(tokenFile, "utf8").trim(); }
  catch { console.error(`Kein Zugangs-Schluessel gefunden (${tokenFile}). Laeuft der Server von diesem Slot? Erst start.bat bzw. start.sh starten.`); process.exit(1); }

  const deadline = Date.now() + 5 * 60_000;
  let waited = false;
  for (;;) {
    let a: ExportAnswer;
    try { a = await requestList(ADMIN_PORT, token); }
    catch (e) { console.error(`Die Einrichtungsseite (Port ${ADMIN_PORT}) antwortet nicht: ${(e as Error).message}. Server starten und noch einmal versuchen.`); process.exit(1); }
    if (a.status === 200 && a.text.startsWith(NODE_LIST_HEADER)) {
      const file = path.join(target, `unpruuf-nodes-server-${NODE_SLOT}.txt`);
      fs.writeFileSync(file, a.text, { mode: 0o600 });
      try { fs.chmodSync(file, 0o600); } catch { /* Windows: no POSIX modes */ }
      const count = /^count: (\d+)$/m.exec(a.text)?.[1] ?? "?";
      console.log(`\nFertig: ${count} Nodes in\n  ${file}\n`);
      console.log("In der App: Einstellungen > Node-Listen > Liste importieren.");
      console.log("Die Datei enthaelt den Schreib-Schluessel. Per Kabel oder vertrauenswuerdig aufs Telefon, danach loeschen.");
      return;
    }
    const msg = explain(a);
    if (msg) { console.error(msg); process.exit(1); }
    if (Date.now() > deadline) { console.error("Der Server hat nach 5 Minuten noch keine Adressen (Tor startet?). Spaeter noch einmal versuchen."); process.exit(1); }
    if (!waited) { console.log("Der Server erzeugt noch seine Adressen, ich warte ..."); waited = true; }
    await new Promise((r) => setTimeout(r, 5_000));
  }
}

if (require.main === module) void main();
