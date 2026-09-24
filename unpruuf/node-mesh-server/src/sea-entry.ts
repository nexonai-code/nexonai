import * as path from "path";
import { createRequire } from "module";
import { setSqliteNativeBinding } from "./sqliteNativeBinding";

/**
 * Entry point for the standalone `unpruuf-node-mesh.exe` build only (see `build-exe.js` /
 * `EXE_BUILD.md`) — never used by `npm start`, `npm run dev`, or `npm test`.
 *
 * Deployed layout (mirrors the existing dist/../ nesting `config.ts` already assumes via
 * `path.join(__dirname, "..")`, so nothing else in the app needs to know it's running from a
 * single exe instead of a folder of .js files):
 *   unpruuf-node-mesh/
 *     dist/unpruuf-node-mesh.exe   <- this file, bundled + SEA-injected
 *     native/better_sqlite3.node
 *     node-mesh-identity.json, node-mesh.sqlite   <- written here at runtime, same as today
 *
 * `EPHEMERAL=1`/`--ephemeral` (Temp Node mode, NODE_MESH_SPEC.md §7) works exactly the same
 * through this entry point as through `npm start` — index.ts reads `process.env`/`process.argv`
 * either way, nothing SEA-specific needed there. That's the main reason this binary is worth
 * having at all: someone running a Temp Node from a second Windows machine shouldn't need Node.js
 * installed on it either.
 */
const exeDir = path.dirname(process.execPath); // .../unpruuf-node-mesh/dist
const nativeBindingPath = path.join(exeDir, "..", "native", "better_sqlite3.node");

// A plain require() inside a SEA blob only resolves Node built-ins (throws
// ERR_UNKNOWN_BUILTIN_MODULE for anything else — confirmed against Node 22, see
// sqliteNativeBinding.ts's doc comment). createRequire() bound to a real on-disk path gives back
// an unrestricted require that can load the native addon normally.
const realRequire = createRequire(path.join(exeDir, "sea-entry.js"));
setSqliteNativeBinding(realRequire(nativeBindingPath));

// Deliberately a runtime require(), NOT a static "import './index'": TypeScript hoists static
// imports to the top of the compiled output, which would run index.ts's top-level NodeStore
// construction *before* the setSqliteNativeBinding() call above — a plain require() here executes
// exactly where it appears in program order, after the override is already set.
require("./index");
