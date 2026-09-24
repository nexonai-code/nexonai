# unpruuf — Branding & Logo ("Eclipse" concept)

Design reference approved 2026‑08‑23, delivered as a light-mode mockup
(`unpruuf_Light_Mode__Document_Context.html`). Supersedes the placeholder
note in `EDITIONS.md` ("Icons are placeholders for now") — this is the
actual mark going forward. Not yet wired into the app's launcher icons or
in-app wordmark; this file exists so the design survives until it is.

## The mark

A single open crescent/arc — an incomplete ring, evoking an eclipse — drawn
as one stroked SVG path, **never filled**, always a `linearGradient` stroke
that fades from full opacity at the bottom to fully transparent at the top:

```html
<svg viewBox="0 0 100 100">
    <defs>
        <linearGradient id="fadeBlack" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stop-color="#000000" stop-opacity="1" />
            <stop offset="100%" stop-color="#000000" stop-opacity="0" />
        </linearGradient>
    </defs>
    <path d="M20,20 L20,60 A30,30 0 0,0 80,60 L80,20"
          stroke="url(#fadeBlack)" stroke-width="8" stroke-linecap="round" fill="none"/>
</svg>
```

Only the gradient's `stop-color` changes per context (black on light
backgrounds, white on dark backgrounds, or a tier color — see below). The
path geometry and the fade direction (solid at the bottom, vanishing toward
the top) stay fixed.

## Contexts

**1. Freestanding (web / pitch deck)** — no frame, no card, no background
shape. The mark sits directly on the page and fades to nothing; paired with
the `unpruuf` wordmark (monospace, wide letter-spacing `0.3em`, bold) placed
to the lower-right of the mark, not centered under it.

**2. App icon** — the freestanding mark does NOT work as a launcher icon on
its own; it needs a container. Use an Apple-style squircle (`border-radius:
22.5%` approximates it in CSS; native platforms should use their own squircle
mask, not a plain rounded rect). Two variants, user's choice: a white
squircle with the black-gradient mark, or a near-black (`#111827`-ish)
squircle with a white-gradient mark. This is the intended replacement for
the "clean coloured tiles" placeholder icons `EDITIONS.md` currently
describes.

**3. Print / letterhead / documents** (NDAs, contracts, invoices) — mark at
small size (e.g. `56px`) inline with the wordmark, both bottom-aligned,
sitting above a `2px` solid dark rule that separates the letterhead block
from the document body. A very faint (5% opacity) large copy of the same
mark can be used as a centered watermark within the document body. Company
identity block (name, location, registration number) goes top-right,
opposite the logo, in small monospace text.

**4. Tier colors on white** — same mark, gradient recolored per tier, used
standalone (no squircle, no card beyond a plain bordered box) to represent
each product/tier at a glance:

| Tier | Hex (on white) | Wordmark |
|---|---|---|
| Pro | `#b8860b` (dark gold — darker than the tier's usual accent, for contrast on white) | `pro` |
| Compliance | `#059669` (green) | `compliance` |
| Client | `#0284c7` (blue) | `client` |

Note: `EDITIONS.md` currently defines unpruuf's three editions as
**Standard (teal) / Pro (gold) / Client (blue)** — no "Compliance" edition of
unpruuf itself exists. **Confirmed 2026‑08‑23**: the green "Compliance" tier
is for **Case Vault** (`case-vault/`, NexonAI's separate whistleblower/HinSchG
product) — it shares this mark system, it is not a 4th unpruuf edition.

## Rules, stated plainly

- The mark is always a stroke, never filled, always gradient-faded — a solid
  or flat-color version is off-brand.
- Fade direction is fixed: solid at the bottom/start of the arc, transparent
  at the top/open end.
- Freestanding contexts get no container. Icon contexts require a squircle.
  Never put the freestanding version in a plain square or circle badge.
- Wordmark is always the lowercase `unpruuf`, monospace, wide tracking —
  matches the existing in-app wordmark treatment already used in
  `ContactsScreen.kt`'s `TopAppBar` (bold "un" in the accent color + "pruuf"
  in default text color) — this new mark doesn't replace that in-app
  treatment, it's for external-facing surfaces (web, deck, print, icon).

## Launcher icons — done 2026‑09‑16

Shipped in app version **1.03**. `app/src/{main,pro,client}/res/drawable/ic_launcher_foreground.xml`
each draw the Eclipse mark as a **vector drawable** (BRANDING.md's canonical
100×100 path, scaled 0.75× and re-centered into Android's 108dp adaptive-icon
canvas so it sits inside the OS-masked safe zone) — no PNG export exists or
was needed, since `mipmap-anydpi-v26/ic_launcher.xml` resolves the adaptive
icon from a vector foreground + a background color directly.

The open color question was put to the user and answered: **keep per-edition
color**, not a single shared black/white mark. Resolved as:
- **Standard**: near-black squircle (`#111827`) + white-gradient mark — one
  of this doc's own two approved monochrome app-icon variants.
- **Pro**: white squircle + gold-gradient mark, using this doc's own "Tier
  colors on white" hex (`#b8860b`).
- **Client**: white squircle + blue-gradient mark (`#0284c7`), same section.

`app/src/{pro,client}/res/values/ic_launcher_background.xml` override
`main`'s near-black default to white for these two flavors.

**Not yet done / known gaps:**
- **Not build-verified** — no Android SDK in the environment that wrote
  this (see `STATUS.md`'s standing Android caveat). Reviewed only for
  well-formed XML and hand-checked geometry; ask for the actual rendered
  icon (a real device/emulator screenshot, or Android Studio's preview) to
  confirm it before treating this as visually final.
- The legacy per-density `mipmap-*/ic_launcher.png` / `ic_launcher_round.png`
  files (pre-adaptive-icon fallback) were deliberately left in place,
  untouched — `minSdk` is 26, the same API level adaptive icons require, so
  these are dead weight on every device the app actually runs on, but
  removing them wasn't necessary for this change and was left alone to
  avoid any risk to a toolchain step that might still expect them (e.g. a
  store-listing icon export). Safe to clean up later once confirmed unused.
- Still no production-ready, standalone SVG/PNG export of the mark for use
  outside this codebase (web, deck, print) — the path lives only inline in
  these vector drawables, in `EclipseMark.kt` (below), and in this doc's
  own mockup reference.

## In-app logos — done 2026‑09‑16

Shipped in app version **1.04**. `ui/components/EclipseMark.kt` draws
BRANDING.md's canonical mark directly with Compose `Canvas`/`Path`/`arcTo`
(same 100×100 geometry as the launcher-icon vector drawables, just expressed
as draw calls instead of XML), taking a `color` parameter that defaults to
`MaterialTheme.colorScheme.primary` — so it automatically picks up the
current edition's accent (seafoam/gold/blue) instead of being a fixed asset.

- **Home screen** (`HomeScreen.kt`): the old `logo_unpruuf.png` `Image` is
  replaced with `EclipseMark` + the `unpruuf` wordmark (bold "un" in the
  accent color, plain "pruuf"), mark upper-left and wordmark bottom-aligned
  to its lower-right — this doc's "Freestanding" context (§1), not the
  in-app `TopAppBar` treatment `ContactsScreen.kt` already uses (that one is
  unchanged).
- **Settings → About** (`SettingsScreen.kt`): the real NexonAI company logo
  (`logo_nexonai.jpg` — square, white background, not ours to redraw) is now
  wrapped in a light "letterhead card" (off-white `#F7F5F1` surface, rounded
  corners, a 2px dark rule beneath the mark, small monospace "NexonAI" text
  below it) instead of sitting directly on the screen's dark surface, where
  it previously read as a mismatched crop. This adapts this doc's §3
  print/letterhead spec to a mobile footer rather than making the whole
  Settings screen white — the rest of the screen keeps the normal dark
  "Quiet Ink" theme.
- `logo_unpruuf.png` itself was left in place, unreferenced (release builds'
  `isShrinkResources` will drop it); not deleted in case anything else still
  points at it.
- **Not build-verified** — same standing caveat as the launcher icons above;
  reviewed only for well-formed Kotlin and hand-checked geometry/brace
  balance, not an actual Gradle/Compose compile (no Android SDK in this
  environment). Ask for a real device/emulator screenshot to confirm the
  mark renders and is positioned as intended before treating this as
  visually final.
