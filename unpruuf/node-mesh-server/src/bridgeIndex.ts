import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { PACKAGE_ROOT, TOR_BIN_DIR } from "./config";
import { ensureTorBinary } from "./tor/torDownload";
import { buildBridgeTorrc, composeBridgeLine, parseFingerprintFile, parseObfs4Template } from "./bridge/bridgeTorrc";

/**
 * Runs the company's private Tor bridge (see bridge/bridgeTorrc.ts) and prints the bridge line.
 * Put it on a SMALL SEPARATE server (a few euros a month), not on the node server, so the bridge
 * and the nodes do not share a fate. Paste the printed line on the node server's setup page
 * ("Firmen-Bridge"); from there it travels to every phone in the node list and the company feed.
 *
 *   NODE_MESH_BRIDGE_ADDRESS   public IP or DNS name of THIS machine (asked by start-bridge.bat)
 *   NODE_MESH_BRIDGE_PORT      obfs4 port, default 443
 *   NODE_MESH_BRIDGE_DIR       where the bridge keeps its keys (default data/bridge); keep it, the
 *                              line stays the same as long as the folder stays
 */

const address = (process.env.NODE_MESH_BRIDGE_ADDRESS ?? "").trim();
const port = Number(process.env.NODE_MESH_BRIDGE_PORT ?? 443);
const dir = process.env.NODE_MESH_BRIDGE_DIR ?? path.join(PACKAGE_ROOT, "data", "bridge");

async function main(): Promise<void> {
  if (!address) {
    console.error("Die öffentliche Adresse dieses Rechners fehlt (NODE_MESH_BRIDGE_ADDRESS). start-bridge.bat fragt danach.");
    process.exit(1);
  }
  const torExe = process.env.TOR_EXE_PATH ?? (await ensureTorBinary(TOR_BIN_DIR));
  const binDir = path.dirname(torExe);
  const lyrebird = path.join(binDir, "pluggable_transports", process.platform === "win32" ? "lyrebird.exe" : "lyrebird");
  if (!fs.existsSync(lyrebird)) {
    console.error(`lyrebird (obfs4) nicht gefunden: ${lyrebird}. Das Tor Expert Bundle muss den Ordner pluggable_transports enthalten.`);
    process.exit(1);
  }
  const dataDir = path.join(dir, "tor-data");
  fs.mkdirSync(dataDir, { recursive: true });
  if (process.platform !== "win32") fs.chmodSync(dataDir, 0o700);
  const torrcPath = path.join(dir, "torrc-bridge");
  fs.writeFileSync(torrcPath, buildBridgeTorrc({ dataDir, lyrebirdPath: lyrebird, port, ownerPid: process.pid }), "utf8");

  const env = process.platform === "win32"
    ? process.env
    : { ...process.env, LD_LIBRARY_PATH: [binDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":") };
  const proc = spawn(torExe, ["-f", torrcPath], { stdio: ["ignore", "pipe", "pipe"], env });
  proc.stdout.on("data", (d) => process.stdout.write(`[tor] ${d}`));
  proc.stderr.on("data", (d) => process.stderr.write(`[tor] ${d}`));
  proc.on("exit", (code) => { console.error(`Tor wurde beendet (Code ${code}).`); process.exit(code ?? 1); });
  const stop = () => { proc.kill(); process.exit(0); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  const fpFile = path.join(dataDir, "fingerprint");
  // lyrebird writes the template as obfs4_bridgeline.txt (older obfs4proxy: obfs4_bridge_line.txt).
  const tplFiles = ["obfs4_bridgeline.txt", "obfs4_bridge_line.txt"].map((f) => path.join(dataDir, "pt_state", f));
  let line: string | null = null;
  for (let i = 0; i < 90 && !line; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const fp = parseFingerprintFile(fs.readFileSync(fpFile, "utf8"));
      const tplFile = tplFiles.find((f) => fs.existsSync(f));
      const tpl = tplFile ? parseObfs4Template(fs.readFileSync(tplFile, "utf8")) : null;
      if (fp && tpl) line = composeBridgeLine(address, port, fp, tpl);
    } catch { /* files not there yet */ }
  }
  if (!line) {
    console.error("Die Bridge-Zeile konnte nicht erzeugt werden. Meldungen oben lesen (Port belegt? Adresse richtig?).");
    process.exit(1);
  }
  fs.writeFileSync(path.join(dir, "bridge-line.txt"), line + "\n", "utf8");
  console.log("\n================================================================");
  console.log("DEINE FIRMEN-BRIDGE IST BEREIT. Diese Zeile auf der Einrichtungsseite deines");
  console.log("Node-Servers einfügen (Karte \"Firmen-Bridge\"). Sie steht auch in:");
  console.log(`  ${path.join(dir, "bridge-line.txt")}\n`);
  console.log(line);
  console.log("\nWichtig:");
  console.log(`  - Den Port ${port} (TCP) in der Firewall dieses Rechners und beim Hoster freigeben.`);
  console.log("  - Diesen Ordner nicht löschen: Er enthält die Schlüssel, die Zeile bleibt nur dann gleich.");
  console.log("  - Dieses Fenster offen lassen. Schließen stoppt die Bridge.");
  console.log("================================================================\n");
}

main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
