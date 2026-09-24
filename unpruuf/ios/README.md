# unpruuf — iOS (cross-platform "GRAL" mode)

This is the first iOS build of unpruuf, implementing the relay-mandatory
"cross-platform mode" designed in `../CROSS_PLATFORM_PLAN.md`. It is a
**separate mode** from Android's `unpruuf Pro` (direct P2P over Tor hidden
services). Android Pro grew the matching companion support (per-contact node
assignment, "Wechsel" rotation, the relay-based pairing QR format) on
2026‑08‑19 — see `STATUS.md` §13 — so iOS↔Android pairing is implemented on
both sides now, but has never been diffed against real Swift source or tried
on real hardware (see `STATUS.md`'s own caveat on that). This app can also
still pair with another instance of itself, which is the one path anyone has
even reasoned through end-to-end so far.

**Written entirely without a Mac, Xcode, or a Swift toolchain of any kind.**
Nothing here has been compiled or run. Treat this as a strong first draft:
the crypto/protocol logic (`UnpruufCore/`) is a careful, deliberate port of
the already-working, already-tested Android/Kotlin implementation and is the
part most likely to be correct as-is; the app shell (`UnpruufApp/`) and
especially `TorController.swift` are the parts most likely to need fixing
once you can actually build this. **If anything doesn't compile, paste the
exact error back — fixes are fast once there's a concrete error to work from.**

## What's built vs. deferred

Built: identity generation, mutual-QR pairing, contact list, text-only chat,
Tor connectivity + relay push/poll, manual per-contact relay config with a
"Wechsel" rotation button. As of 2026‑08‑24, also: PIN + panic PIN (mandatory
on first run), opt-in Face ID/Touch ID unlock, wipe-on-background + a 5-minute
message TTL, safety-number contact verification, and an in-app version
display — see `CHANGELOG.md`'s 2026‑08‑24 entry for exactly what changed and
why, and the updated iOS plan for the reasoning behind doing this local-only
security work *before* real-toolchain verification (no wire format involved
in any of it, so no added interop risk from doing it now).

Deliberately deferred (see `STATUS.md` for the full picture): file/photo/
voice attachments (wire format ready, only the picker/UI is missing), a
trusted-node list with liveness auto-select, temp-node TTL auto-revert,
obfs4/Snowflake-on-iOS, and jailbreak detection + a build-expiry gate (Android
has both; porting them is flagged as needing a product decision first, not
just build work — see the iOS plan's Phase iOS-8).

## Setup — turning this into a buildable Xcode project

No `.xcodeproj` is included on purpose: hand-authoring one from a Linux
container with no Xcode to validate it is a well-known way to produce a
project file that silently won't open. Instead:

1. **Validate the core first (fastest feedback loop, no Xcode needed):**
   ```bash
   cd UnpruufCore
   swift test
   ```
   This exercises the ratchet, wire framing, padding, identity/wire-tag math,
   and connection-string/pairing-payload parsing — the part most worth
   trusting. Needs only a Swift toolchain (Xcode Command Line Tools is
   enough — the full Xcode IDE isn't required for this step).

2. **Create the Xcode project:**
   - Xcode → File → New → Project → iOS → App.
   - Product Name: `UnpruufApp`. Interface: SwiftUI. Language: Swift.
   - Bundle Identifier: `com.nexonai.unpruuf` (matches the Android app's
     package, `com.nexonai.unpruuf`, for consistent branding).
   - Minimum deployment target: iOS 16 (uses `NavigationStack`,
     `VisionKit.DataScannerViewController`).

3. **Add `UnpruufCore` as a local Swift Package dependency:**
   - Xcode → File → Add Package Dependencies → Add Local... → select the
     `UnpruufCore/` folder next to this README.

4. **Add CryptoSwift** (File → Add Package Dependencies →
   `https://github.com/krzyzanowskim/CryptoSwift.git`, "Up to Next Major"
   from `1.8.0`) — only used inside `UnpruufCore`'s `DoubleRatchet.swift`,
   for XChaCha20-Poly1305 (CryptoKit only has the 12-byte-nonce IETF
   variant; the Double Ratchet needs the 24-byte-nonce one to interop with
   the Android side's Tink-based implementation).

5. **Add Tor.framework** (`iCepa/Tor.framework` — the iOS sibling of
   `info.guardianproject:tor-android`, already used on Android). **Confirmed
   on real hardware, 2026‑08‑26: CocoaPods-only, no SPM support.** In the
   folder containing `UnpruufApp.xcodeproj`:
   ```bash
   sudo gem install cocoapods   # or: brew install cocoapods
   pod init
   ```
   Edit the generated `Podfile`:
   ```ruby
   platform :ios, '15.0'

   target 'UnpruufApp' do
     use_frameworks!
     pod 'Tor', '~> 409'
   end
   ```
   Then `pod install` — downloads a precompiled `.xcframework` (409.11.2 at
   confirmation time), no build-from-source needed. **From now on open
   `UnpruufApp.xcworkspace`, never `.xcodeproj`** — the classic CocoaPods
   trap; opening the `.xcodeproj` after this gives a spurious `no such
   module 'Tor'` even though everything installed correctly.

   **One more real gotcha before this links**: a fresh Xcode project has
   "User Script Sandboxing" on by default (Xcode 15+), which blocks
   CocoaPods' framework-embed script with `Sandbox: rsync deny(1)
   file-write-create ...`. Fix: project settings → Build Settings → search
   "sandboxing" → set "User Script Sandboxing" to "No" at **both** the
   PROJECT row and the TARGET row (either alone isn't enough) → Clean Build
   Folder (⇧⌘K) before building again.

   `TorController.swift` is written against the long-stable
   `TORThread`/`TORConfiguration`/`TORController` API Onion Browser uses —
   confirmed to still be the current class names — isolated so a fix stays
   contained to that one file if some other detail doesn't match.

6. **Drag in the app source:** add `UnpruufApp/UnpruufApp/Sources/` (all of
   it) into the new project. Xcode 26+ puts new projects' own target folder
   at `<project root>/UnpruufApp/` (nested under the project root of the
   same name) — that's why the tracked path already has the doubled
   `UnpruufApp/UnpruufApp/` segment; drop `Sources/` straight into that
   folder so the physical files sit where Xcode already expects target
   sources, instead of moving them again.

   **Info.plist**: `UnpruufApp/UnpruufApp/Info.plist` is tracked in git with
   the real `NSCameraUsageDescription`/`NSFaceIDUsageDescription`/orientation
   keys already filled in — because the `.xcodeproj` itself is never
   committed (see above), this file is the *only* place those settings
   persist across machines. Recent Xcode defaults new projects to
   `GENERATE_INFOPLIST_FILE = YES` (no physical file, keys live in Build
   Settings instead) — turn that **off** for the target: Build Settings →
   search "Generate Info.plist File" → No, then set "Info.plist File" to
   `UnpruufApp/Info.plist` (relative to the target folder). Do **not** let
   Xcode generate a fresh one and merge into it — use the tracked file as-is,
   or every fresh setup silently loses the camera/Face ID permission strings.

7. **Build.** Physical device recommended for testing (Tor + camera QR
   scanning; `DataScannerViewController` isn't available on the Simulator —
   `QRScannerView`/the pairing and settings screens already guard for this
   via `QRScanner.isSupported` and fall back to paste-text entry).

## Getting a relay to pair against

You need a running relay (`../server/`, already built and documented) before
pairing works at all — cross-platform mode has no direct-connect fallback.
`../server/start-mac.command` (macOS), `../server/start-windows.bat`
(Windows) or `docker compose up` (Docker/Linux) prints a
`unpruuf-relay:v1:...` connection string on first run; paste or scan that
into Settings → "My relay" **before** pairing.

**Set the relay first — the order matters.** A contact's relay address is
frozen into the contact record at the moment you pair, so pairing before a
relay is configured produces a contact that can never receive anything from
you, and adding a relay afterwards does not repair it. The app now refuses
to pair until a relay is set (the scan/paste buttons stay disabled), but if
you have a contact from before that guard existed, re-pair it on **both**
devices — one-sided re-pairing desynchronises the Double Ratchet.

**Who sends first, on a fresh pairing.** The Double Ratchet's bootstrap is
deliberately asymmetric: exactly one of the two devices can send
immediately, the other must receive one message before it can send. This is
correct and unavoidable (making both sides initiators would have them derive
the *same* sending chain and reuse message keys), and applies only to the
very first message. The app tells you which side you are at pairing time.

## Verified on real hardware, 2026‑08‑29

Two real iPhones (iPhone 12 and iPhone 16) paired by mutual QR and exchanged
messages **in both directions** through a relay hosted on the user's own Mac,
over Tor, with real Double-Ratchet decryption confirmed in the logs. Getting
there took thirteen distinct real bug fixes in one session — see
`../CHANGELOG.md`'s 2026‑08‑29 entries and `../STATUS.md` §11 for the full
account. Still unproven: iOS↔Android interop (both ends were iOS here) and
attachments over the relay.

## Known risk areas, in order of how likely they are to need attention first

1. **`DoubleRatchet.swift`'s AEAD framing** — must byte-for-byte match
   Tink's `XChaCha20Poly1305` output layout (`nonce(24) || ciphertext ||
   tag(16)`) for cross-platform messages to ever decrypt correctly once
   Android grows companion support. iOS↔iOS is now proven, which means the
   framing is self-consistent — but that says nothing about whether it
   matches Tink. Documented inline as the first thing to check if
   cross-platform decryption ever fails.
2. **`SocksHTTPClient.swift`** — hand-rolled SOCKS5 + HTTP/1.1 over
   `Network.framework`, since iOS's `URLSession` has no supported SOCKS5
   proxy path. Deliberately narrow (three known endpoints only) rather than
   a general solution, to keep it small enough to actually debug. Now proven
   to work for real relay push/poll traffic.
3. **`TorController.swift`** — no longer a risk area in the "does this API
   even exist" sense: the framework's API surface is confirmed and Tor
   connects reliably. It is, however, by far the most hard-won file in the
   project (nine real bugs, all documented inline as numbered notes). Read
   those notes before changing anything in it — several of the constraints
   are non-obvious platform limits, not style choices.
