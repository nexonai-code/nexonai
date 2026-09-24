# unpruuf — Editions Guide

unpruuf ships as **three editions** built from a single codebase using Gradle
product flavors. They share 100% of the code; the only differences are the
**pairing rules** (who may add whom) and the **look** (colour + icon) so you can
tell them apart instantly.

---

## The three editions

| Edition | App colour | Launcher icon | Install ID |
|---|---|---|---|
| **Standard** | Teal | unpruuf logo | `com.nexonai.unpruuf` |
| **Pro** | Gold / Amber | Gold tile + chat glyph | `com.nexonai.unpruuf.pro` |
| **Client** | Blue | Blue tile + chat glyph | `com.nexonai.unpruuf.client` |

Because each edition has its own install ID, **all three can be installed on the
same phone at the same time** (useful for testing a Pro↔Client pairing on one
device pair).

---

## Pairing rules (who can add whom)

Adding a contact happens by scanning the other person's QR code. The rule is
enforced on **every scan**, in both directions.

| I am… | I can add… | I **cannot** add… |
|---|---|---|
| **Standard** | Standard, Pro | Client |
| **Pro** | Standard, Pro, Client | — (can add everyone) |
| **Client** | Pro | Standard, Client |

In plain words:
- **Standard ↔ Standard** ✅
- **Standard ↔ Pro** ✅
- **Pro ↔ Pro** ✅
- **Pro ↔ Client** ✅ — the **Pro user invites the Client user**
- **Standard ↔ Client** ⛔ blocked
- **Client ↔ Client** ⛔ blocked

> A **Client** user can only ever talk to **Pro** users — but there is **no
> limit on how many**. A single Client can be paired with as many different
> Pro accounts as they like, and a single Pro account can likewise invite an
> unlimited number of different Client users. The relationship is
> many-to-many, not a fixed 1:1 pairing. A **Standard** user can never add a
> **Client** user.

If a pairing is not allowed, the scan is rejected with a clear message
(e.g. *"unpruuf Client can only connect with unpruuf Pro users."*).

---

## How you can tell which edition you're running

The edition is visible at a glance — **by colour**, as requested:

1. **Launcher icon** — teal logo (Standard) / gold tile (Pro) / blue tile (Client).
2. **App accent colour** — the whole UI is tinted teal / gold / blue.
3. **Home screen badge** — a coloured `STANDARD` / `PRO` / `CLIENT` chip next to
   the title.
4. **Settings → Security → App edition** — shows `unpruuf Pro` etc.

---

## Building an edition (Android Studio)

1. Open the `unpruuf/` project and let Gradle sync.
2. Open **Build → Select Build Variant…** (or the *Build Variants* panel,
   bottom-left).
3. Pick the variant:
   - `standardDebug` → unpruuf (Standard)
   - `proDebug` → unpruuf Pro
   - `clientDebug` → unpruuf Client
4. Run. Install more than one variant to test cross-edition pairing.

> For release builds, use the matching `…Release` variant.

---

## How it works under the hood

- **Gradle flavors** (`app/build.gradle.kts`, dimension `edition`) set a
  `BuildConfig.EDITION` string and the app name per edition, plus an
  `applicationIdSuffix` for Pro/Client.
- **`AppEdition`** (`domain/AppEdition.kt`) reads `BuildConfig.EDITION` and holds
  the whole rule set:
  - `AppEdition.current` — the running edition.
  - `AppEdition.canAdd(theirEdition)` — the pairing matrix above.
  - `AppEdition.blockReason(theirEdition)` — the message shown on a blocked scan.
- **QR payload** carries the sender's real edition (`appEdition`), so the scanner
  can apply the rule.
- **Theme** (`ui/theme/Theme.kt`) picks the accent colour from `AppEdition`.
- **Icons** — Pro/Client provide their own adaptive launcher icon in
  `app/src/pro/res` and `app/src/client/res`; Standard uses the shared logo.

To change a rule, edit `AppEdition.canAdd()` in one place — it governs all
editions.

---

## Notes & limits

- **Same version on both phones:** the wire protocol (rotating IDs, ACKs, dummy
  traffic, bidirectional delete) is identical across editions, but two phones
  must run the **same app version** to talk — the *edition* may differ (e.g. Pro
  and Client), the *version* must match.
- **Separate data per edition:** installing Pro next to Standard gives each its
  own encrypted contacts DB, identity and PIN — they do not share anything.
- **Icons are placeholders for now:** clean coloured tiles for quick recognition.
  They can later be replaced with fully designed per-edition artwork.

---

## Pricing

| Edition | Price |
|---|---|
| **Standard** | €14.99 / month |
| **Pro** | €49 / month |
| **Client** | Free |

The Client edition is free by design: it's the counterpart a Pro user invites
in (e.g. their own customers/contacts), so it carries no cost of its own. See
`MARKETING.md` for the full pricing/positioning narrative.

---

*Part of the unpruuf project · built by NexonAI · see `STATUS.md` for the full
feature status.*
