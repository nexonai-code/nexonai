import * as fs from "fs";
import * as path from "path";
import { createControlApp } from "./app";

const PORT = Number(process.env.CONTROL_PORT ?? 8860);
const ROOT = path.join(__dirname, "..");
const DATA_DIR = process.env.CONTROL_DATA_DIR ?? path.join(ROOT, "data");
const BUNDLE_DIR = process.env.CONTROL_BUNDLE_DIR ?? path.join(ROOT, "bundle");
const PUBLIC_DIR = path.join(__dirname, "public");

fs.mkdirSync(DATA_DIR, { recursive: true });
const { app } = createControlApp({ dataDir: DATA_DIR, bundleDir: BUNDLE_DIR, port: PORT, publicDir: PUBLIC_DIR });
// Loopback only: Control is a page on this PC, never on the network.
app.listen(PORT, "127.0.0.1", () => {
  console.log(`unpruuf Control: http://127.0.0.1:${PORT}  (data: ${DATA_DIR})`);
});
