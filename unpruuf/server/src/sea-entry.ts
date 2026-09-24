import * as path from "path";
import { createRequire } from "module";
import { setSqliteNativeBinding } from "./sqliteNativeBinding";

/**
 * Entry point for the standalone `unpruuf-relay.exe` build only (see `build-exe.js` /
 * `unpruuf/server/EXE_BUILD.md`) — never used by `npm start`, Docker, or `start-windows.bat`.
 *
 * Deployed layout (mirrors the existing dist/../ nesting `config.ts`/`windowsTor.ts` already
 * assume, so nothing else in the app needs to know it's running from a single exe instead of a
 * folder of .js files):
 *   unpruuf-relay/
 *     dist/unpruuf-relay.exe   <- this file, bundled + SEA-injected
 *     native/better_sqlite3.node
 *     windows/tor/             <- auto-downloaded on first run, same as today
 *     relay-identity.json, relay.sqlite, torrc  <- written here at runtime, same as today
 */
const exeDir = path.dirname(process.execPath); // .../unpruuf-relay/dist
const nativeBindingPath = path.join(exeDir, "..", "native", "better_sqlite3.node");

// A plain require() inside a SEA blob only resolves Node built-ins (throws
// ERR_UNKNOWN_BUILTIN_MODULE for anything else — confirmed against Node 22, see
// sqliteNativeBinding.ts's doc comment). createRequire() bound to a real on-disk path gives back
// an unrestricted require that can load the native addon normally.
const realRequire = createRequire(path.join(exeDir, "sea-entry.js"));
setSqliteNativeBinding(realRequire(nativeBindingPath));

// Deliberately a runtime require(), NOT a static "import './windows-start'": TypeScript hoists
// static imports to the top of the compiled output, which would run windows-start.ts's main()
// (and construct BlobStore) *before* the setSqliteNativeBinding() call above — a plain require()
// here executes exactly where it appears in program order, after the override is already set.
require("./windows-start");
