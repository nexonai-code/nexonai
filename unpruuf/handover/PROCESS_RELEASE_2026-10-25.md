# Release process: from a tagged commit to a delivery the auditor and the customer can verify

How we turn a tested state of the code into a signed delivery of the node server, Control and the Android apps, and what we record so that anyone can check later what was shipped. Steps marked **to build** do not exist yet; they are part of the target process.

**Suggested owner:** Gabriel, with Norbert and Floretta as listed below (a proposal; the team decides together) · **Last updated:** 25 October 2026 · **Review cadence:** every quarter and after every audit

## Purpose

- Every delivery can be traced to one git tag, one signed file list (server) and one signing key (apps).
- An outsider (a customer, the auditor) can check that what runs is what we released, without trusting us: `verify-release` for the server, `apksigner` for the apps.
- No build leaves with a debug key, a test flag or a failed check.
- The releases do not run out on the customer: every app build stops working about 180 days after it was compiled.

## Scope

**In:** node server (source package, Windows single-file build, Docker bundle for Control), Control, Android apps (`pro`, `group`, and `client`, `whistleblower`, `press` when ordered), the Android node (`relay-android`), the delivery ZIP and its record.

**Out:** iOS (Norbert builds from `ios/IOS_BUSINESS_BUILD_SPEC.md`; this process only says when he is told), Play Store or other distribution, the website, licence issuing (`license-tool`, see its README).

## Who does what (RACI, suggested)

| Step | Responsible | Accountable | Consulted | Informed |
|---|---|---|---|---|
| 1 Prepare the version | Gabriel | Team | Norbert | Floretta |
| 2 Verify (tests, evidence) | Gabriel | Gabriel | | Team |
| 3 Tag | Gabriel | Gabriel | | Team |
| 4 to 6 Server: build, sign, bundle | Gabriel | Gabriel | | Norbert |
| 7 to 8 Apps: build, check | Gabriel | Gabriel | Norbert (iOS parity) | Team |
| 9 Record | Gabriel | Gabriel | | Team |
| 10 Package | Gabriel | Gabriel | | Floretta |
| 11 Hand over | Norbert | Team | Gabriel | Floretta |
| 12 Keys and backups | Gabriel | Team | Norbert | |
| 13 After the release | Gabriel | Team | | Norbert, Floretta |

## Process flow

```
 1 Prepare ──> 2 Verify ──> 3 Tag ──┬─> 4 Build server ─> 5 Sign ─> 6 Bundle (Control)
      ^           |                 │
      │       any red: stop         └─> 7 Build apps ───> 8 Check apps
      │                                                      │
      └──────────── fix, new commit ────────────────────────┘
                                   │
   9 Record ─> 10 Package (ZIP) ─> 11 Hand over ─> 12 Keys, backups ─> 13 After (calendar)
```

## Detailed steps

### Step 1: Prepare the version
- **Who:** Gabriel
- **When:** when the team calls a release, after the open decisions that change what is shipped (today F1 and M5) are made.
- **How:** work on the `android` line and keep it clean. Raise `versionCode` (must strictly increase) and `versionName` in `app/build.gradle.kts` and `relay-android/app/build.gradle.kts`, and the server version in `node-mesh-server/package.json`. Write the entry in `CHANGELOG.md`. Check that `SECURITY_CLAIMS.md`, `STATUS.md` and the audit briefs say what the code does.
- **Output:** one commit "Release <date> v<N>" with the version numbers and the changelog.

### Step 2: Verify
- **Who:** Gabriel
- **When:** before the tag, on the exact commit.
- **How:** run the checks of every component and keep the numbers.
  - Server: `cd node-mesh-server && npm ci && npm test`; the same in `server`, `control`, `officer-app`.
  - Android unit tests and compile of every variant: `:app:testStandardDebugUnitTest :app:testProDebugUnitTest :app:testGroupDebugUnitTest`, then `:app:compile<Variant>DebugKotlin` for `client`, `whistleblower`, `press`.
  - Evidence: `evidence/run-evidence.bat` (or `.sh`), which runs `00-run-all.js --online --tests`. Expected: 0 failed. Known open findings stay listed.
  - Dependencies: `npm audit --omit=dev` shows 0 in the four packages (script `09`).
- **Output:** the numbers in the release record (step 9). Anything red stops the process; fix it and start again at step 1.

### Step 3: Tag
- **Who:** Gabriel
- **How:** an annotated tag on that commit, `release-<date>-v<N>`, pushed to GitHub. Move `main` forward to `android` as before (fast-forward only). The tag is what an auditor or customer is told; nothing is built from a moving branch.
- **Output:** the tag. **Never** retag; a mistake means a new version number.

### Step 4: Build the server
- **Who:** Gabriel
- **How:** `cd node-mesh-server && npm ci && npm run build` for the source package (`dist/`). The Windows single-file version: `npm run build:exe` on Windows (see `EXE_BUILD.md`).
- **Output:** `dist/` of that tag. Build from a clean checkout of the tag, not from a working folder.

### Step 5: Sign the server release
- **Who:** Gabriel, on the offline machine that holds `private-key.json`.
- **How:** `node license-tool/sign-release.js` (or the card in the licence tool GUI) after the build and before packing. It writes `release-manifest.txt` (SHA-256 of `dist/**/*.js` and `package.json`, signed) and appends the fingerprint to `license-tool/release-fingerprints.txt`. Check at once: `node node-mesh-server/tools/verify-release.js <copy of the folder> --fingerprint "<fingerprint>"` must say unchanged and signed.
- **Output:** `release-manifest.txt` and the fingerprint. **To build:** extend the signed list to `node_modules`, the native SQLite file and the Tor program, and sign the single-file build (pre-audit M8). Until then the release record says what the fingerprint does not cover.
- **Note:** the signing key is the same key pair as the licence key (under its own signing domain). Its loss or theft would hit both; keep it offline.

### Step 6: Bundle for Control
- **Who:** Gabriel
- **How:** `cd control && npm ci && npm run build && npm run bundle && npm test`. This writes `bundle/node-server.tgz` and `bundle/bundle.json` from the signed server folder; installed servers then show "unchanged, signed" and the fingerprint.
- **Output:** `bundle/`, shipped with the Control delivery.

### Step 7: Build the apps
- **Who:** Gabriel, in Android Studio on the PC that holds the release key.
- **How:** put `unpruuf-release.jks` and `release.properties` next to `settings.gradle.kts` (both are in `.gitignore`). Build Variant `proRelease`, `groupRelease` (and the others if ordered), Build, then the Android node (`relay-android`) as release. Without the key files a release build stays **unsigned**; it never falls back to the test key. The Gradle lint step (`lintVital`) runs in Studio; if it complains, the build is not released.
- **Output:** the release APKs. Each build carries its own expiry date (compile time plus 180 days); the build date is written down in step 9.
- **Not in the cloud:** the release key is not kept there.

### Step 8: Check the apps
- **Who:** Gabriel
- **How:** for every APK: `aapt2 dump xmltree --file AndroidManifest.xml <apk>` shows neither `testOnly` nor `debuggable`; `apksigner verify --print-certs <apk>` shows the release fingerprint `9E:E8:5E:91:16:9F:62:50:09:5D:4F:36:E6:A6:EA:D5:CB:42:DC:C7:B7:26:36:CB:4B:99:B7:D3:A0:D1:4E:7E`; `aapt2 dump badging` shows the intended version; the permission list is the expected eleven. Install on the Pixel and the Samsung and run a smoke test: update from the previous release, pair, send and receive, unlock a server, panic PIN on a spare profile. Save the R8 mapping file with the tag.
- **Output:** a pass or the list of what failed. A failure means a new version, not a patched APK.

### Step 9: Record
- **Who:** Gabriel
- **How:** one table per release in the release notes: tag, date, commit, server manifest fingerprint, SHA-256 of each file delivered, signing certificate fingerprint, build expiry date of each app, test and evidence numbers, open findings. **To build:** a small script that fills it from the folders so that it is not typed by hand, and a bill of materials for server and app.
- **Output:** `RELEASE_RECORD_<date>_v<N>.md` next to the changelog.

### Step 10: Package the delivery
- **Who:** Gabriel
- **How:** `unpruuf_<Date>_v<N>.zip` (for a special edition: `unpruuf_<Edition>_<Date>_v<N>.zip`) with `CHANGELOG.md`, the APKs, `bundle/`, the install and start scripts for Windows, and the release record. Never put keys, `private-key.json`, `release.properties`, licence files or test data in it.
- **Output:** the ZIP. Open it once and read the list of files.

### Step 11: Hand over
- **Who:** Norbert (suggested), with Gabriel for technical questions.
- **How:** the delivery goes to the customer over the agreed channel. The fingerprint is published next to the download (the website or the handover letter) so the customer can run `verify-release --fingerprint`. For an audit the auditor receives the tag, the record and the build instructions. Tell Norbert the version so that iOS can follow the same wire format; tell Floretta only what customers may be told.
- **Output:** receipt noted in the record.

### Step 12: Keys and backups
- **Who:** Gabriel
- **How:** `unpruuf-release.jks`, `release.properties` and `private-key.json` each exist in two separate places, offline, and the start password of the release key has been changed (it came from a cloud session). Note who has access.
- **Output:** a dated line in the record: keys checked, passwords changed, backups verified.

### Step 13: After the release
- **Who:** Gabriel
- **How:** put a reminder in the calendar **150 days** after the build date: a new release must be delivered before the 180-day build expiry, otherwise the customer's apps stop. Keep the tag, the record and the R8 mapping for as long as a customer may run that version.
- **Output:** the reminder, and the open items for the next release.

## Exceptions and edge cases

| Scenario | What to do |
|---|---|
| A check in step 2 is red | Stop. Fix, new commit, start at step 1. Never tag with a red or skipped check. |
| `private-key.json` is not at hand | No signed server release. Do not ship an unsigned one as a release; say it is a test build. |
| The release key is lost or stolen | Lost: no customer can update, everyone must reinstall. Stolen: stop shipping, tell customers, rotate; the apps cannot trust the old key any more. Prevention is step 12. |
| Wrong build found after the tag | New version number and a new tag. Android cannot go back (the version code must rise), so a fix is always a new release. |
| A customer's build has expired | Deliver a current build. Their data stays; the new build must be signed with the same key. |
| A wire-format change (F1 and M6) is part of the release | Old and new apps cannot read each other. The record says so, and the release goes to all clients (Android, Officer app, Web reporter, iOS) together, or to none. |
| Maven or another download is throttled during a build | Build in Android Studio on the PC, not in the cloud; do not work around checksums. |
| Evidence shows a new advisory in a dependency | Update the lock file, repeat steps 2 to 9; do not release with a known high advisory. |
| Hotfix for one customer | Same process, shorter list of components; still tag, record and fingerprint. No hand-patched APKs. |

## Metrics

| Metric | Target | How to measure |
|---|---|---|
| Deliveries with a verified fingerprint and a release record | 100 % | Count of ZIPs against records |
| Evidence and test result on the tag | 0 failed; open findings listed | `REPORT.md` and test output in the record |
| Days of build life left at delivery | at least 150 of 180 | Build date in the record |
| Time from tag to delivery | agreed per release, noted | Dates in the record |
| Releases signed with the test or an unknown key | 0 | `apksigner` check in step 8 |
| Known open findings at release | listed, none high unreported | Audit brief section on our own findings |

## Related documents

- `unpruuf/SIGNING_TEST_KEY.md` (test key and release key, fingerprints, loss)
- `unpruuf/license-tool/README.md` (sign-release, keys) and `release-fingerprints.txt`
- `unpruuf/control/README.md` (bundle, delivery) and `node-mesh-server/EXE_BUILD.md`
- `unpruuf/evidence/README.md`, `AUDIT_BRIEF_NODE_SERVER.md`, `AUDIT_BRIEF_ANDROID_APP.md`
- `unpruuf/handover/F1_DECISION_SHEET_2026-10-25.md` (wire format) and `AUDIT_READINESS` page
- `CLAUDE.md` (delivery naming, branches, honesty rules: not audited, not certified)
