/**
 * Override hook for `better-sqlite3`'s native addon, used only by the standalone `.exe` build
 * (see `sea-entry.ts`/`build-exe.js`). Every other entry point (Docker, `npm start`,
 * `start-windows.bat`) never touches this — `blobStore.ts` falls back to `better-sqlite3`'s
 * normal auto-discovery (`require('bindings')(...)`) when nothing has been set here, exactly as
 * before this file existed.
 *
 * Why this exists at all: inside a Node "Single Executable Application" (SEA), a plain
 * `require(somePath)` for anything other than a Node built-in throws `ERR_UNKNOWN_BUILTIN_MODULE`
 * — confirmed directly against Node 22, not assumed. The compiled native addon (`.node` file)
 * can't be embedded in the SEA blob itself either way, so it ships as a sibling file next to the
 * `.exe`, loaded via `module.createRequire()` (a real, unrestricted require bound to a real path)
 * in `sea-entry.ts`, then handed to `better-sqlite3` through its own supported
 * `new Database(path, { nativeBinding })` override (confirmed in `better-sqlite3`'s own source,
 * `lib/database.js` — passing an already-loaded addon *object* there skips its internal
 * `require('bindings')` call entirely, so that call never has to work inside the SEA blob).
 */
let override: object | undefined;

export function setSqliteNativeBinding(binding: object): void {
  override = binding;
}

export function getSqliteNativeBinding(): object | undefined {
  return override;
}
