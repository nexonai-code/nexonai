# unpruuf Windows installer

`unpruuf-Setup-<yyyy.MM.dd>.exe` installs every unpruuf program that runs on Windows, with Node.js included (no separate install): node server, Compliance dashboard and Press newsroom (officer app), Control, licence tool, web reporter, optional relay. Per-user install (`%LOCALAPPDATA%\unpruuf`), no administrator rights, Start menu group "unpruuf". Also built as a portable ZIP.

## Get the files
GitHub > Actions > "Windows installer" > Run workflow (branch `android`). The result is the artifact `unpruuf-windows` on the run page: Setup exe, portable ZIP, `SHA256.txt`. The workflow runs on a real Windows runner and checks before it hands anything over: SQLite loads in node server, officer app and relay; Control, web reporter and licence GUI start and answer; no key or customer file is inside; the installer installs silently, contains every program, loads SQLite from the installed copy and uninstalls.

On a Windows PC with Node.js 22 and Inno Setup 6 you can run `build-installer.bat` instead.

## Files
`build-stage.ps1` (builds the tree: each app compiled, production dependencies only, bundled `runtime\node.exe`), `unpruuf.iss` (Inno Setup script), `launchers\*.cmd` (what the Start menu entries run), `INSTALL_INFO.txt` (EN/RO text shown before installing).

## Known limits
- Not code-signed: Windows SmartScreen warns ("More info", "Run anyway"). A code-signing certificate fixes this.
- Data (node identity, onion address, cases, licence stock) is created inside the program folders on first start and survives an uninstall; deleting the folder by hand deletes the identity. A fixed data folder for updates is not built yet.
- The licence tool needs your existing `private-key.json` copied into its folder; the launcher says so.
- Tor is downloaded on first start of the node server (needs internet).
- Not run on a customer PC yet; the workflow tests are the only Windows run so far.
- The single-file `.exe` builds of node server and relay (`EXE_BUILD.md`) are separate and unchanged.
