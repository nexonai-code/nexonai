# Evidence package

Statements unpruuf makes about itself, each with the thing that backs it and a way to check it again.
**Not a security audit and not a certificate.** It shows what can be checked by script on this source; the rest is listed
as needing an independent specialist.

| File | What it is |
|---|---|
| `CLAIMS_TO_EVIDENCE.md` | The table: claim → evidence → status. Start here. |
| `AUDITOR_SCOPE.md` | A proposed scope for an independent review. |
| `01`–`09-*.js` | The checks. Each runs on its own: `node 01-server-surface.js`. |
| `00-run-all.js` | Runs all of them and writes `REPORT.md` and `REPORT.json`. |
| `REPORT.md` | The result of the last run (commit, date, every check). |
| `run-evidence.bat` / `run-evidence.sh` | Build the node server once and run everything. |

## Run it

Windows: double-click `run-evidence.bat`. Linux/macOS: `./run-evidence.sh`. Needs Node.js 20 or newer and, for the
online comparison of the Tor hashes, internet access and `gpg`. Options of `00-run-all.js`: `--online` (compare the Tor
hashes with the Tor Project's signed list), `--tests` (also run the node server's own tests).

## Show it to a customer

The two checks that need no knowledge: `node 02-server-storage.js` prints the whole database (one table, five columns,
random bytes) and proves that no address, no name and no secret is in the files; `node 01-server-surface.js` tries to
delete, list and write on the server as a stranger and as a contact, and fails every time.

## What the checks do not cover

Network capture of a running server or phone, forensic images of a phone, the strength of the cryptographic design, the
effect of cover traffic against a node operator, load, and anything about Tor or the operating system. See
`AUDITOR_SCOPE.md`.

## Findings

**F1.** The first 8 bytes of every stored packet show its payload length in the clear (`08`, `PacketMetadataTest.kt`).
A node operator can read message lengths and tell cover packets from messages. The claims were corrected; the fix needs
a wire-format change in every client and a decision of the team.
