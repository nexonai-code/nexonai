# unpruuf Control: Changelog

## Version 1 (13 Oct 2026)

First delivery. The customer's own console for node servers and licence codes. New component; the apps, the node server and the licence format are unchanged. (One small change in the node server's Dockerfile: it now also copies `release-manifest.txt` when the release was signed, so servers installed by Control can show "unchanged, signed".)

**What it does**

- Runs on the customer's admin PC as a local web page (`127.0.0.1:8860`, English and Romanian). Windows: `install.bat`, then `start.bat`.
- Vault: everything (servers, SSH keys, write codes, licence codes) in one file encrypted with a passphrase (scrypt + AES-256-GCM, header authenticated). Locks itself after 20 minutes. Encrypted backup download. Passphrase change. Five wrong passphrases lock the page for 30 seconds.
- Add a server: login with the VPS password once; host key pinned; checks (Linux, 64-bit, memory, disk, Docker, port, sudo); Control's own SSH key per server; password login on the server switched off afterwards (optional).
- Install: uploads the bundled server software, checks its checksum on the server, installs Docker on Debian/Ubuntu if missing, builds and starts the container with the chosen profile (Business: standard; safeline and Press: offline tolerant; RAM or disk), applies the licence, waits for the node addresses and keeps the server's write code. The server's setup page is reached only through the SSH connection.
- Operate: status of all servers (reachable, locked, licence days, addresses registered, version, program check), unlock after a restart (single or all), update, push a renewed licence, company bridge lines, new write key, node list download (single or ZIP), remove (with or without wiping the data).
- Licence inventory: import server and app codes (pasted or the licence tool's CSV), verified offline; next free code goes to a new server; app codes are given to named devices (code and QR on screen); renewals (same serial, later expiry) replace the code and keep the assignment; no code can sit on two servers; CSV export.
- Warnings: one server only, all servers at one provider or one region, locked, unreachable, container stopped, licence missing/expiring/expired, same serial on two servers, serial not in the inventory, renewal not yet on the server, program files changed, addresses missing, update available.

**Checked**

- 60 automated tests, run three times in a row: vault (encryption, tampering, passphrase rules), licence inventory, tar/zip writers (opened with `tar` and `unzip`), every remote shell script parses (`sh -n`), the preflight script runs for real on this machine, the whole installation, update, unlock, rotate, bridge, remove flow against a simulated SSH server (with real key login, host-key pinning, sudo wrapping and port forwarding to a simulated setup page that follows the real one's host and header rules), the web API (token, header, host checks, idle lock, throttling), and the page's texts (English and Romanian identical, every key present, no inline script or style).
- The page was driven in a real browser from first start to a finished installation, in both languages.
- The server bundle compiles on its own (`tsc`).

**Not checked**

- A real VPS. The Docker build and run on a real machine, the `apt` Docker installation, the sshd switch-off of password login on real distributions, and the real setup page's answers have not been run. Try the first installation on a spare VPS.
- The signed-release path (no private key here): the bundle is unsigned until `sign-release.js` is run before `npm run bundle`.
- Windows: install.bat and start.bat were not run (Linux machine here).

**Known limits (by design)**

- Bookkeeping, not copy protection: a code can still be copied by hand. "One server per licence" stays in the contract.
- Control sees no phone and no message. Whoever has the vault file and the passphrase has every key in it.
