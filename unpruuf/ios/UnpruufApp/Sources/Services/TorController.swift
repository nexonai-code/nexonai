import Foundation
import Combine
#if canImport(Tor)
import Tor
#endif

/// Wraps `iCepa/Tor.framework` (the iOS sibling of `info.guardianproject:tor-android` already
/// used on the Android app) — the control connection is (re)established when the app becomes
/// active and torn down when backgrounded, per `CROSS_PLATFORM_PLAN.md` §6 ("foreground-scoped
/// Tor"); the underlying Tor engine itself, once started, keeps running for the rest of the
/// process's life — see the second real-bug note below for why.
///
/// **Distribution confirmed on real hardware, 2026‑08‑26**: CocoaPods-only (no SPM support) —
/// `pod 'Tor', '~> 409'` in the app's Podfile with `use_frameworks!`, resolving to a precompiled
/// `.xcframework` (409.11.2 at confirmation time, no build-from-source step). Linked successfully
/// into a fresh Xcode project — see `STATUS.md` §11 for the one unrelated gotcha that blocked
/// this the first time (Xcode's "User Script Sandboxing" build setting needs to be off).
///
/// **API surface confirmed on real hardware, 2026‑08‑26**: at 409.11.2, the framework's
/// Objective-C `TORThread`/`TORController`/`TORConfiguration` classes all now import into Swift
/// with the all-caps `TOR` prefix dropped — `TorThread`/`TorController`/`TorConfiguration`. The
/// `TorController` rename collides with this file's own wrapper class of the same name — every
/// reference to the framework's `TorThread`/`TorController` below is therefore module-qualified
/// (`Tor.TorThread`, `Tor.TorController`) to disambiguate; this file's own `TorController` class
/// stays unqualified. `TorConfiguration` needs no qualification (no collision). Otherwise
/// unchanged from the long-stable shape Onion Browser is built on (`TorThread` to launch the
/// process from a `TorConfiguration`, `TorController` over the control socket to query readiness
/// and the local SOCKS port via the standard Tor control-protocol `GETINFO net/listeners/socks`
/// — the control-protocol command itself, unlike any specific Swift API, is part of Tor's stable
/// spec and not a guess). `RelayService`/`SocksHTTPClient` only see `isReady`/`socksPort` below,
/// nothing Tor.framework-specific.
///
/// **Real bug found on real hardware, 2026‑08‑29**: `connectAndAuthenticate` was calling
/// `controller.authenticate(with: Data())` — an empty cookie — despite `cookieAuthentication`
/// being on. Cookie auth needs the actual bytes Tor writes to `control_auth_cookie` in its data
/// directory; an empty/wrong cookie makes `authenticate` fail every time, silently, leaving the
/// app stuck showing "Connecting to Tor…" forever even though Tor itself bootstraps to 100% in
/// its own log. Fixed by reading that file and passing its real contents.
///
/// **Second real bug found on real hardware, 2026‑08‑29**: `TORThread` asserts
/// `_thread == nil` in its own `-initWithArguments:` — it only ever tolerates **one instance
/// per process, for the process's entire lifetime**. The original "foreground-scoped Tor"
/// design (`stop()` cancelling the thread, `start()` creating a fresh one on every
/// foreground/background cycle) crashes the app with `NSInternalInconsistencyException:
/// There can only be one TORThread per process` the moment you background and reopen the app.
/// Fixed by creating the `TORThread` exactly once per process and never cancelling it again —
/// `stop()`/`start()` now only tear down and rebuild the control connection, which is safe to
/// recreate freely (this is `TORThread`-specific; the control connection itself is no longer
/// `Tor.framework`'s own class — see the thirteenth note below).
///
/// **Third real bug found on real hardware, 2026‑08‑29**: with the above two fixes in place,
/// `controller.connect()` still failed on *every* attempt with POSIX ENOENT ("No such file or
/// directory") — confirmed by Tor's own log never mentioning a control port/socket at all, only
/// the SOCKS listener. Root cause: `TorConfiguration` was never told to actually create a
/// control socket — `config.controlSocket` (the real, verified property, fetched from
/// `iCepa/Tor.framework`'s own `TORConfiguration.h`) was never set, so Tor had nothing to
/// listen on at the path we were guessing. Fixed by setting `config.controlSocket` explicitly.
/// (Also tried switching to `TORConfiguration`'s readonly `cookie` property instead of reading
/// `control_auth_cookie` off disk — reverted in the sixth real-bug note below, it doesn't
/// reliably match what Tor actually uses.)
///
/// **Fourth real bug found on real hardware, 2026‑08‑29**: with `controlSocket` set, Tor's own
/// log gave the real reason `connect()` still failed on every attempt: `Unix socket path ... is
/// too long to fit` / `Failed to bind one of the listener ports.` AF_UNIX paths are capped at
/// ~104 bytes on Darwin, and an iOS sandbox container path alone eats ~78 of that — this file's
/// original `<Caches>/tor/control_port` came to 110 bytes, over the limit before our own
/// filename even started. Fixed by moving *only* the control socket (not `dataDirectory`,
/// which has no such limit — it's regular files) to the shortest writable directory
/// (`FileManager.default.temporaryDirectory`) with a 2-character filename.
///
/// **Fifth real bug found on real hardware, 2026‑08‑29**: with the path short enough, Tor's log
/// gave the next real reason: `Permissions on directory ... are too permissive` / `the
/// directory ... needs to ... be accessible only by the user account that is running Tor.` Tor
/// refuses to place a control socket in a directory it doesn't consider private, and iOS's
/// shared per-app `tmp` root doesn't qualify. Fixed by creating a dedicated one-character
/// subdirectory under `tmp` with explicit `0700` permissions and putting the socket there
/// instead of directly in `tmp`.
///
/// **Sixth real bug found on real hardware, 2026‑08‑29**: with all of the above fixed,
/// `connect()` finally succeeded for the first time — Tor's log showed `Opening Control
/// listener` / `Opened Control listener connection (ready)` — but `authenticate` then failed
/// with Tor logging `Got mismatched authentication cookie`. The cookie captured from
/// `TORConfiguration.cookie` right after creating the configuration (see the third real-bug
/// note) does not reliably match the cookie the Tor *process* actually ends up using once it
/// runs. Reverted to reading the real `control_auth_cookie` file Tor itself writes to
/// `dataDirectory` — but now doing so only *after* `connect()` succeeds, which is proof Tor has
/// been running long enough for that file to actually exist.
///
/// **Seventh real bug found on real hardware, 2026‑08‑29**: reported symptom — a fresh install
/// connects immediately, but simply reopening that same install without reinstalling gets stuck
/// on "Connecting to Tor…" forever. Root cause: `tmp` (unlike RAM/messages) survives an app
/// relaunch, so the control-socket special file from the *previous* run's Tor process can still
/// be sitting at the exact path the *new* run tries to bind — a fresh install never has this
/// problem simply because its `tmp` is empty. Fixed by unlinking any file at `controlSocketURL`
/// before Tor gets a chance to use it, on every `start()`.
///
/// **Eighth real bug found on real hardware, 2026‑08‑29**: a real-device log showed a *second*
/// `reconnectController()` firing (`SwiftUI`'s `scenePhase` can report `.active` more than once
/// for a single foreground session, without an intervening `.background`) shortly after the
/// first one had already authenticated successfully — spinning up a competing control connection
/// against the same engine instead of leaving the working one alone. Fixed by guarding
/// `reconnectController()` to no-op if `controller` is already set; only `stop()` clears it for
/// a real reconnect.
///
/// **Ninth real bug found on real hardware, 2026‑08‑29**: even with the eighth fix, backgrounding
/// the app and reopening it reliably got stuck on "Connecting to Tor…" for the full retry budget
/// (~20s) and then gave up — every time — while a full app relaunch connected fine every time.
/// Root cause, confirmed by reading `iCepa/Tor.framework`'s own `TORController.m` source directly
/// (not guessed): `stop()`'s `controller?.disconnect()` call sends Tor's own control-protocol
/// `SIGNAL SHUTDOWN` command before closing the local socket — that doesn't just end *this app's*
/// control connection, it tells the real Tor **daemon** to shut down. So every single
/// background/foreground cycle was silently killing the actual Tor process, while the `TORThread`
/// Swift wrapper object itself (per the second real-bug note above) survived untouched. Fixed by
/// never sending that command (this app's own control client — see the thirteenth note — never
/// implements `disconnect`/`SIGNAL SHUTDOWN` at all, so this class of mistake is no longer
/// possible).
///
/// **Tenth real bug found on real hardware, 2026‑09‑02**: even with the ninth fix in place,
/// backgrounding the app and reopening it *still* failed every single retry with an uninformative
/// `nilError`, exhausting the full ~20s budget every time, while a fresh launch kept connecting
/// fine — Tor's own log showed exactly one `New control connection opened.` line no matter how
/// many Swift-side retries followed, meaning the daemon only ever actually accepted the very first
/// attempt. Traced to `Tor.framework`'s own `TORController.connect()` retried on the same instance
/// across attempts; fixed at the time by constructing a fresh instance per retry — see the
/// thirteenth note below for why this turned out to be a symptom of a deeper, unfixable-from-here
/// framework limitation, not the actual root cause.
///
/// **Eleventh/twelfth, real hardware, 2026‑09‑02**: a 2-second pre-reconnect delay (testing
/// "resuming too soon after suspend") was tried and disproved by real-hardware data — 20+ seconds
/// of continuous retrying, zero successes, and the identical failure even on a fresh launch
/// whenever its first attempt needed even one retry. A structural fix (never tearing the
/// connection down on background, just re-polling it on resume) followed, on the theory that the
/// purely intra-process connection never actually broke — also insufficient on its own once it
/// turned out the *very first* reconnect after backgrounding still hit the same wall, because the
/// underlying one-shot limitation applies to `Tor.framework`'s connection object itself, not to
/// background/foreground specifically.
///
/// **Thirteenth: root cause and final fix, real hardware, 2026‑09‑02.** Read
/// `iCepa/Tor.framework`'s actual `Tor/TORController.m` source on GitHub directly (not guessed) to
/// find out why *every* second real connection attempt in a process fails, regardless of which
/// instance makes it or how long it waits first. Confirmed: `-connect:` backs every attempt with
/// `dispatch_io_create(..., [[self class] controlQueue], ...)` — a **private, class-level shared
/// serial queue**, the same one for every `TORController` instance ever created in the process.
/// Once that queue has backed one real channel, a second `dispatch_io_create` call against it
/// reliably returns `NULL` — confirmed from source: `if (!_channel) return NO;`, **without ever
/// populating the `NSError`** (an API-contract violation, which is exactly why Swift showed the
/// uninformative `nilError` instead of a real one), and the raw socket is leaked on that path
/// too (never closed) — a genuine bug in the framework itself, not fixable by anything on this
/// side of its public API. Checked for a newer framework release (none — 409.11.2, current at
/// investigation time, is already the latest tag) and for a viable alternative Tor engine (Arti,
/// Tor Project's own Rust rewrite, has no stable API yet and would need hand-written FFI bindings
/// — not a safe swap for a shipping app).
///
/// **The fix**: since `TORThread`/`TORConfiguration` (actually running Tor) were never the
/// problem — only `TORController`, the thin control-socket client — this file no longer uses
/// `Tor.framework`'s `TORController` at all. `TorControlConnection.swift` is a small,
/// independently-implemented control-protocol client (`AUTHENTICATE`/`GETINFO` only, everything
/// this app actually needs) built on Apple's own `Network.framework`, which has no shared-queue
/// limitation of this kind. Tor itself — `Tor.TorThread`/`TorConfiguration`, the actual daemon —
/// is completely untouched by this change and keeps working exactly as already proven on real
/// hardware; only the connection *to* it was ever broken.
///
/// **Fourteenth, real hardware, 2026‑09‑02**: with the thirteenth fix in place (custom
/// `Network.framework`-based `TorControlConnection`), backgrounding/foreground still failed —
/// the same uninformative `nilError` text, on every retry, despite Tor's own log confirming `New
/// control connection opened.` for essentially every attempt (Tor genuinely accepted the
/// connection at the OS level each time). Since this class has zero Objective-C bridging, that
/// couldn't be the same synthesized-NSError artifact the thirteenth note diagnosed in
/// `Tor.framework` — the real cause was invisible only because `TorControlConnection` logged
/// nothing but the error's `CustomStringConvertible` description. Added full diagnostics (every
/// `NWConnection` state transition, and on failure the real `NSError` domain/code/`userInfo`) to
/// see the actual reason on the next real-device run — this note's own fix is what that run found.
///
/// **Fifteenth, real hardware, 2026‑09‑02**: the fourteenth note's diagnostics found it. The real
/// device log showed the very first connect attempt after backgrounding — made before Tor has
/// even booted, so the control-socket file doesn't exist yet — put `NWConnection` into
/// `.waiting(POSIXErrorCode.ENOENT)`, a state `TorControlConnection.connect()` didn't handle at
/// all (fell into `default: break`). Since that state never called `completion`, this class's own
/// retry loop below — entirely driven by that completion firing — silently deadlocked forever on
/// its very first attempt, while Tor went on to boot, open its control listener, and bootstrap to
/// 100% completely unnoticed. `NWConnection` does not itself re-poll a Unix-domain socket path
/// that didn't exist at connect time, even once the path starts existing — unlike a real
/// network-path change, which is what its automatic `.waiting` retry is actually designed for.
/// Fixed in `TorControlConnection.connect()`: `.waiting` is now treated as a failure for this
/// class's purposes, so this retry loop gets its completion call and constructs a fresh attempt,
/// exactly as it already does for a real `.failed`.
///
/// **Verified 2026‑09‑02, real hardware.** The next attempt after the expected first-attempt
/// ENOENT connected the instant Tor opened its control listener, authenticated, and bootstrapped
/// to 100% — and three separate background/foreground cycles in the same run all hit
/// `start(): reusing existing authenticated controller, re-polling bootstrap status` →
/// `ready! port=…` immediately, with zero reconnect failures. Fifteen real bugs, one debugging
/// arc, closed.
@MainActor
final class TorController: ObservableObject {
    @Published private(set) var isReady = false
    /// 0 until Tor reports a live SOCKS listener.
    @Published private(set) var socksPort: UInt16 = 0

    #if canImport(Tor)
    private var thread: Tor.TorThread?
    private var controller: TorControlConnection?
    private var dataDirectory: URL?
    private var controlSocketURL: URL?
    /// True only once `controller` has actually authenticated successfully at least once —
    /// distinct from `controller != nil`, which is also true for an in-flight, not-yet-confirmed
    /// retry attempt (see `connectAndAuthenticate`). `start()` only re-polls an existing
    /// connection instead of (re)connecting when this is true; a background/foreground cycle that
    /// happens to land mid-retry, before any attempt has ever succeeded, still needs a real
    /// (re)connect.
    private var hasAuthenticated = false
    #endif

    func start() {
        #if canImport(Tor)
        // The connection is a purely intra-process one (both ends — Tor's own thread and this
        // app's control client — live in the same process), so it never actually breaks across a
        // background suspend (the whole process, Tor's thread included, is simply frozen and
        // resumes exactly where it left off) — see the eleventh/twelfth real-bug notes above for
        // the real-hardware evidence that ruled out every alternative explanation first. If we
        // already have a working one, just re-poll it for current bootstrap status instead of
        // reconnecting.
        if hasAuthenticated, let existing = controller {
            print("[Tor] start(): reusing existing authenticated controller, re-polling bootstrap status")
            pollBootstrap(existing)
            return
        }
        guard thread == nil else {
            // Engine already running, but no *authenticated* controller yet — either a fresh
            // process whose first connection attempt is still retrying, or one that never
            // succeeded before backgrounding happened. A real (re)connect attempt is needed.
            reconnectController()
            return
        }
        let dataDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("tor", isDirectory: true)
        try? FileManager.default.createDirectory(at: dataDir, withIntermediateDirectories: true)
        dataDirectory = dataDir

        // AF_UNIX socket paths are capped at ~104 bytes (sockaddr_un.sun_path) on Darwin. An
        // iOS sandbox container path alone (`/var/mobile/Containers/Data/Application/<UUID>/`)
        // already eats ~78 of that, so `dataDir`'s own `Library/Caches/tor/control_port` (110
        // bytes total) doesn't fit — confirmed by Tor's own log: "Unix socket path ... is too
        // long to fit" / "Failed to bind one of the listener ports." This limit only applies to
        // the *socket* itself, not regular files, so only the control socket moves to the
        // shortest writable directory available with a minimal filename; everything else Tor
        // needs keeps living in `dataDir` above.
        //
        // Tor also refuses to place a control socket directly in `tmp` itself: "Permissions on
        // directory ... are too permissive" — it insists the *immediate parent directory* of
        // the socket be accessible only by the current user (0700), and iOS's shared per-app
        // tmp root doesn't satisfy that. Fixed by creating our own single-character
        // subdirectory with explicit 0700 permissions just for this socket.
        let socketDir = FileManager.default.temporaryDirectory.appendingPathComponent("t", isDirectory: true)
        try? FileManager.default.createDirectory(at: socketDir, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        try? FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: socketDir.path)
        let socketURL = socketDir.appendingPathComponent("c")
        controlSocketURL = socketURL
        let dirPerms = (try? FileManager.default.attributesOfItem(atPath: socketDir.path))?[.posixPermissions] ?? "?"

        // `tmp` survives an app relaunch (it's only RAM/messages that get wiped, per this
        // file's foreground-scoped design) — a stale socket special file left behind by the
        // previous run's Tor process can make bind() fail or hang for the new one. Confirmed by
        // a real, reproducible symptom: fresh installs connect immediately, but reopening the
        // same install without reinstalling gets stuck on "Connecting to Tor…" forever. Always
        // unlink any leftover file at this exact path before Tor gets a chance to use it.
        let stalePreexisted = FileManager.default.fileExists(atPath: socketURL.path)
        try? FileManager.default.removeItem(at: socketURL)
        print("[Tor] control socket path is \(socketURL.path.utf8.count) bytes: \(socketURL.path), parent dir permissions=\(dirPerms), removed stale file=\(stalePreexisted)")

        let config = TorConfiguration()
        config.cookieAuthentication = true
        config.dataDirectory = dataDir
        config.controlSocket = socketURL
        config.options = [
            "SocksPort": "auto",
            "AvoidDiskWrites": "1",
        ]

        print("[Tor] start(): dataDir=\(dataDir.path) controlSocket=\(socketURL.path) controlPortFile=\(config.controlPortFile?.path ?? "nil")")

        let newThread = Tor.TorThread(configuration: config)
        newThread.start()
        thread = newThread

        reconnectController()
        #endif
    }

    func stop() {
        #if canImport(Tor)
        // Deliberately NOT cancelling `thread` here — see the doc comment above: TORThread
        // asserts on a second instantiation, so cancelling it would make every subsequent
        // `start()` in this process crash instead of reconnecting. The Tor engine itself keeps
        // running underneath regardless of anything below.
        //
        // Deliberately NOT closing `controller` either — see the eleventh/twelfth/thirteenth
        // notes above: the connection is purely intra-process and never actually breaks across a
        // background suspend, so there's nothing to gain by closing it (and, before the
        // thirteenth fix, real cost in trying to rebuild it against the framework's shared-queue
        // limitation). `start()` just re-polls the same connection when the app resumes.
        print("[Tor] stop(): leaving the control connection alone (have controller=\(controller != nil))")
        #endif
        isReady = false
        socksPort = 0
    }

    #if canImport(Tor)
    private func reconnectController() {
        // SwiftUI's scenePhase can report `.active` more than once for a single foreground
        // session (confirmed on real hardware: a second reconnectController() call fired right
        // after the first one had already authenticated successfully) — without this guard, the
        // second call spins up a *competing* connection against the same still-running Tor
        // engine instead of just leaving the already-working one alone. Only proceed if we
        // don't already have a controller; `stop()` is what clears it for a real reconnect.
        guard controller == nil else {
            print("[Tor] reconnectController: already have a controller, skipping duplicate call")
            return
        }
        guard let controlSocket = controlSocketURL else {
            print("[Tor] reconnectController: no controlSocketURL, aborting")
            return
        }
        print("[Tor] reconnectController: control socket at \(controlSocket.path)")

        // Poll-connect: the control socket file doesn't exist until Tor finishes writing it out,
        // shortly after the thread starts. Budget covers connect, cookie-file, and auth retries
        // together (see connectAndAuthenticate) — 40 × 0.5s = 20s, generous for a slow first run.
        connectAndAuthenticate(controlSocket: controlSocket, attemptsLeft: 40)
    }
    #endif

    #if canImport(Tor)
    private func connectAndAuthenticate(controlSocket: URL, attemptsLeft: Int) {
        print("[Tor] connectAndAuthenticate: attemptsLeft=\(attemptsLeft)")
        guard attemptsLeft > 0 else {
            print("[Tor] connectAndAuthenticate: gave up, attempts exhausted")
            controller = nil
            return
        }
        let attempt = TorControlConnection(socketPath: controlSocket.path)
        controller = attempt
        attempt.connect { [weak self] result in
            guard let self else { return }
            switch result {
            case .failure(let error):
                print("[Tor] connect() failed: \(error)")
                // A failed NWConnection was never explicitly closed before — dangling failed
                // connection objects piling up across up to 40 retries in ~20s is itself worth
                // ruling out as a contributor. Harmless if it isn't the cause.
                attempt.close()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
                    self?.connectAndAuthenticate(controlSocket: controlSocket, attemptsLeft: attemptsLeft - 1)
                }
            case .success:
                print("[Tor] connect() succeeded")
                // Cookie authentication (config.cookieAuthentication = true above) needs the
                // exact cookie the running Tor *process* wrote to `control_auth_cookie` in its
                // data directory — confirmed by a real "Got mismatched authentication cookie"
                // failure that `TORConfiguration.cookie` (read once, before the thread even
                // started) does NOT reliably match what Tor ends up using once it actually runs.
                // Read the real file instead, now that `connect()` succeeding proves Tor has
                // been running long enough for it to exist.
                guard let dataDir = self.dataDirectory,
                      let cookie = try? Data(contentsOf: dataDir.appendingPathComponent("control_auth_cookie")) else {
                    print("[Tor] control_auth_cookie not readable yet, retrying")
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
                        self?.connectAndAuthenticate(controlSocket: controlSocket, attemptsLeft: attemptsLeft - 1)
                    }
                    return
                }
                print("[Tor] have cookie, \(cookie.count) bytes, calling authenticate")
                attempt.authenticate(cookie: cookie) { [weak self] success, error in
                    print("[Tor] authenticate callback: success=\(success) error=\(String(describing: error))")
                    guard success else {
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
                            self?.connectAndAuthenticate(controlSocket: controlSocket, attemptsLeft: attemptsLeft - 1)
                        }
                        return
                    }
                    self?.hasAuthenticated = true
                    self?.pollBootstrap(attempt)
                }
            }
        }
    }

    private func pollBootstrap(_ controller: TorControlConnection) {
        controller.getInfoForKeys(["net/listeners/socks", "status/bootstrap-phase"]) { [weak self] values in
            guard let self else { return }
            print("[Tor] pollBootstrap values=\(values)")
            let bootstrapLine = values.count > 1 ? values[1] : ""
            let bootstrapped = bootstrapLine.contains("PROGRESS=100")
            let socksLine = values.first ?? ""
            // Format: `"127.0.0.1:39000"` (quoted). Extract the trailing port number.
            if bootstrapped, let portString = socksLine.split(separator: ":").last?.trimmingCharacters(in: CharacterSet(charactersIn: "\"")),
               let port = UInt16(portString) {
                print("[Tor] ready! port=\(port)")
                Task { @MainActor in
                    self.socksPort = port
                    self.isReady = true
                }
                return
            }
            print("[Tor] not ready yet (bootstrapped=\(bootstrapped), socksLine=\(socksLine)), polling again in 1s")
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
                self?.pollBootstrap(controller)
            }
        }
    }
    #endif
}
