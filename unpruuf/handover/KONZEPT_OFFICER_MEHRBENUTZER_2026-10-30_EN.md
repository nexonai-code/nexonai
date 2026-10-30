# Officer app for several people: named accounts, "handled by", activity log

Concept paper, draft of 30 October 2026. Applies to unpruuf Compliance and unpruuf Press (same program, two editions). Nothing of this is built. Product decisions are Gabriel's alone.

## 1. Goal

An office that receives reports is rarely one person. Two or three staff share the cases, one is on holiday, one must not see a case about their own department. Today the officer app knows exactly one user. This paper describes how several named people can work in the same case system, and how every action shows who did it ("handled by"), without touching what reporters see or how messages travel.

## 2. What exists today (from the code, `officer-app/`)

- **One user.** One password (`OFFICER_PASSWORD`) decrypts the officer identity file (`officer-identity.json`: scrypt key, AES-256-GCM). The case database key is derived from that identity (`deriveDbKey`), so the database and the identity stand and fall together.
- **One program per identity.** The program polls the relay or nodes, advances the encryption state of every case and sends replies. Two programs with the same identity would break each other's state. Several people therefore have to share **one running program**, not run one each.
- **Access from other computers** is possible (`OFFICER_BIND_HOST`) with one shared dashboard password (HTTP Basic) and a random access token per start. The README itself warns that plain HTTP on a network exposes password and reports.
- **No "who".** The tables `cases` and `case_messages` have no handler or author column, and there is no activity log. Press has "recherchen" (one contact code per research); that is not a user model.

## 3. What must not change

- The reporter side. A reporter never sees a staff name, only "the office". Replies look the same as today.
- Message format, wire format, packet length (the open decision F1 stays untouched), relay and node, Android and iOS reporter apps. This is a change inside the officer program only. No iOS work (the officer app runs on the PC).
- No server of ours. The program runs at the customer, as today.
- Existing databases keep working. The case database format stays; only new columns and tables are added.

## 4. Design

### 4.1 Accounts and key wrapping (the core)

Today the password wraps the identity directly. New: the identity secret is encrypted once with a random **data key** (32 bytes). Each account holds its own copy of that data key, wrapped with a key derived from that person's password (scrypt, same parameters as today, AES-256-GCM). A new file `officer-users.json` holds, per account: id, display name, role, salt, wrapped data key, created and last-change time.

- **Migration.** On the first start of the new version, the existing password becomes the first account (role Admin, name asked once). The old identity file is first copied to `officer-identity.json.bak`. The case database is not touched, because its key is derived from the unchanged identity.
- **Password change** re-wraps one copy. **Removing an account** deletes its copy. A forgotten password of one person costs only that person's access (the Admin sets a new one); it no longer means the loss of every case.
- **Start.** One person with an account unlocks the program at start (as the password prompt today). Everyone else then logs in through the dashboard with their own password.

### 4.2 Login in the dashboard

The shared HTTP Basic password is replaced by a login page with personal accounts and a session cookie (HttpOnly, SameSite=Strict). Proposal: idle timeout 30 minutes, a delay after repeated wrong passwords (for example 5 tries, then growing waits), minimum password length 12. The per-start access token stays. For use across a network, the README recommends HTTPS (reverse proxy) or an SSH tunnel; plain HTTP stays a documented risk.

### 4.3 Roles

- **Officer**: sees and works the cases they may see, replies, sets status and category, adds internal notes.
- **Admin**: everything an Officer can, plus accounts, assignment of any case, activity log, settings, export and deletion.
- Stage 2: **Reader** (read only), for example an auditor or deputy.

### 4.4 "Handled by" and what we add around it

- **Handler per case** (`assigned_to`), shown in the list and the case view, filter "my cases".
- **Author per message and per status change** (internal record). The reporter sees none of it.
- **Last handled by / at**, visible in the list, so a colleague sees at once whether someone is on it.
- **Internal notes** per case (never sent to the reporter), with author and time, encrypted like messages.
- **Reassign / hand over** (holiday, leaving): Admin or the current handler moves a case; the move is logged.
- **Recusal**: a case can be restricted to named accounts, so a person who is the subject of, or close to, a report is locked out of it. This matters most in practice and is also the hardest to do right (see 6).
- **Safe against double work:** a status change carries the version the person saw; if someone else changed it meanwhile, the screen says so instead of overwriting.
- **Deadlines per person:** the existing acknowledgement and feedback deadlines (7 days, 3 months) can be listed per handler.
- **Press:** the same model, with "editor" as the wording; a research can be assigned to a person.

### 4.5 Activity log

A table of events: sign-in, failed sign-in, case opened, reply sent, status or category changed, note added, export, deletion, account created or removed, case moved. Each entry is encrypted with the data key and chained to the previous entry by its hash, so that **an edited or removed entry is detected** by anyone checking the chain. Only Admins see it. Retention is set by the customer (they decide how long it is needed; we do not set a legal period). The log is itself personal data about staff; the customer is the controller.

## 5. Stages

| Stage | Content | Size |
|---|---|---|
| 1 | Accounts and key wrapping with migration, login page and sessions, roles Officer and Admin, handler per case, author per message and status change, "last handled", activity log with chain, user screen for Admins, tests, README, new first-start text in `start.bat` | medium: identity file, dashboard login, new columns and tables, one new screen |
| 2 | Internal notes, recusal (case restricted to named accounts), reassign, version check on status change, Reader role, per-person deadline list | medium |
| 3 | Optional: second factor (one-time code) for Admins, four-eyes closing for sensitive categories | small to medium |

Proof before delivery: unit tests for wrapping, migration (old file opens, `.bak` restores), wrong passwords, rate limit, role checks, log chain (edit one entry, check fails); an end-to-end run with two accounts on one case. No test against real Tor, no audit.

## 6. Honest limits (say them as they are)

1. **Removing an account does not take back what the person already saw.** The identity of the office cannot be rotated without re-pairing every reporter, so the data key stays. Removal stops future access through the program; it does not protect against a person who earlier copied the data folder and knows their own password. This is also true today with one password.
2. **The activity log shows manipulation, it does not prevent it.** An Admin who holds the data key can rebuild the whole chain. We say "changes become detectable", never "tamper-proof".
3. **Recusal is only as good as the setup.** An Admin can always add themselves. A restriction protects against ordinary users, not against a dishonest Admin; the log shows it happened.
4. **No password recovery.** Recommendation: at least two Admins, and the setup warns if there is only one.
5. **Shared computer and plain HTTP** remain the customer's responsibility (README).
6. Not audited. Part of the audit scope should be the new key wrapping.

## 7. Legal pointers (to be confirmed by a lawyer, not yet checked against Romanian law 361/2022)

Directive (EU) 2019/1937, Article 9(1)(a) asks for channels that keep identities protected and prevent access by non-authorised staff members; 9(1)(c) asks for an impartial person or department competent to follow up. Named accounts, roles and recusal serve exactly this. Text taken from a copy of the directive on [legislation.gov.uk](https://www.legislation.gov.uk/eudr/2019/1937/article/9/data.htm); check against EUR-Lex. We do not claim that the product meets these articles: it supports the organisation in meeting them.

## 8. How we may say it

"Every person in your reporting office has their own account. Every action shows who did it. A colleague who is involved in a case can be kept out of it. Changes to the record become visible." Not: "audit-proof", "tamper-proof", "compliant".

## 9. Decisions for Gabriel

1. Build stage 1 as described? It reworks how the working identity file is opened, so it needs your yes before work starts. Recommended: yes, with the backup and rollback above.
2. Roles for stage 1: Officer and Admin only (recommended), Reader later.
3. Idle timeout 30 minutes and password length 12 as defaults?
4. Setup requires or only recommends a second Admin (recommended: warn, do not force)?
5. Stage 2 recusal and internal notes right after stage 1, or wait for the first customer who asks?
6. Press: same model with the wording "editor" (recommended).
