# unpruuf

A privacy-focused, serverless-by-default P2P messenger. Two devices talk directly over **Tor
hidden services**, with a same-Wi-Fi LAN shortcut. No account, no phone number, no central server
required. Package `com.nexonai.unpruuf`, architecture codename **GRAL**.

## Start here

**Read `HANDOFF.md` first.** It's written specifically to let a new session (human or AI) pick
this project up without re-deriving context — what the project is, who the people in the docs
are, and the single most important fact about this codebase: **the Android and iOS code has never
been compiled in the environment it was developed in** (no Android SDK / Xcode available there).
Every change was reasoned through and structurally verified (balanced braces, type-checked by
hand), never build-verified, until a human compiles it. Treat that as still true here.

After `HANDOFF.md`, the core reference docs, roughly in the order you'll need them:

| File | What it's for |
|---|---|
| `STATUS.md` | The single source of truth for full technical state — huge, section-numbered. If in doubt, this file wins. |
| `CHANGELOG.md` | Delivery history, newest first — what changed, why, and how each bug was found/fixed. |
| `NODE_MESH_SPEC.md` | Architecture spec for the **Business / Node-Mesh** product line (self-hosted nodes, no relay operator). |
| `CROSS_PLATFORM_PLAN.md` | Wire protocol and design for iOS↔Android interop. |
| `SECURITY_CLAIMS.md` | The threat model — what's actually protected against, and explicitly, what isn't. |
| `EDITIONS.md` | Standard / Pro / Client edition matrix and pairing rules. |
| `COMPLIANCE.md`, `PATENT_DISCLOSURE.md`, `MARKETING.md`, `BRANDING.md` | Business-side reference docs. |

## Directory map

```
app/                Android app (Kotlin, Jetpack Compose) — the main, most feature-complete client
ios/                 iOS app — a narrower, relay-mandatory cross-platform companion
server/              Node.js relay server (optional for Android, mandatory for iOS) — blind store-and-forward
relay-android/       Native Android build of the relay server (self-hosting a relay on a phone)
node-mesh-server/    Business / Node-Mesh server (owner-only write, read-only fetch) — see NODE_MESH_SPEC.md
license-tool/        Offline Ed25519 license issuing/verification for the Standard/Pro editions
relaypool-tool/      Small utility for managing a pool of relay instances
design/              Design assets
assets/gradle/       Gradle wrapper plumbing for the Android app
```

## Building

- **Android app** (`app/`): open this `unpruuf/` folder in Android Studio. Note — only
  `gradlew.bat` is present at this level (no Unix `gradlew`/`gradlew.jar`); this project has so
  far only ever been built through Android Studio's own Gradle integration, not the command-line
  wrapper directly on Linux/macOS. Regenerate the wrapper (`gradle wrapper`) if you need a CLI
  build there.
- **Relay server** (`server/`): `npm install && npm test`, see `server/README.md` for Docker/
  Windows/macOS deployment and the standalone `.exe` build (`server/EXE_BUILD.md`).
- **Node-Mesh server** (`node-mesh-server/`): `npm install && npm test`, see
  `node-mesh-server/README.md` and `node-mesh-server/EXE_BUILD.md` for the standalone `.exe`
  build and `EPHEMERAL=1` Temp Node mode.
- **Android relay** (`relay-android/`): separate Gradle project, own root, open independently in
  Android Studio.
- **iOS app** (`ios/`): open in Xcode.
- **License tool** (`license-tool/`): Node.js CLI + a small GUI (`license-tool/gui/`); never
  commit the generated private key.
