import Foundation
import Combine
import AppKit

/// Guards against resuming a `CheckedContinuation` twice — the normal completion path and the
/// timeout path in `runShell` race each other, and only one may win.
private final class ResumeGuard {
    private let lock = NSLock()
    private var didResume = false

    /// Returns `true` exactly once, to whichever caller asks first.
    func markResumed() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        guard !didResume else { return false }
        didResume = true
        return true
    }
}

/// Drives the whole menu-bar app: locates the `server/` folder on disk, shells out to the
/// existing, already-hardened scripts/CLI (`install-service.command`, `uninstall-service.command`,
/// `node dist/mac-start.js --status-json`/`--show-code-json`) instead of re-implementing any of
/// their logic in Swift — the launchd plist generation, Node-path resolution, and Tor supervision
/// all already exist and are tested; this class only orchestrates and displays them.
@MainActor
final class RelayController: ObservableObject {
    @Published private(set) var state: RelayState = .notConfigured
    @Published private(set) var ttlHours: Double?
    @Published private(set) var queue: RelayQueueSnapshot?
    @Published private(set) var connectionString: String?
    @Published private(set) var lastError: String?
    @Published private(set) var isBusy = false
    /// Distinct from `isBusy` (Start/Stop) — drives the spinner next to the manual refresh
    /// button so clicking it visibly does something instead of appearing to do nothing for the
    /// ~1-2s a real `node` invocation takes.
    @Published private(set) var isRefreshing = false

    /// Persisted across launches so the user only has to point this at their `server/` folder
    /// once (see `chooseServerFolder()`).
    @Published private(set) var serverDir: URL? {
        didSet {
            UserDefaults.standard.set(serverDir?.path, forKey: Self.serverDirDefaultsKey)
        }
    }

    private static let serverDirDefaultsKey = "relay_server_dir_path"
    private var refreshTimer: Timer?

    init() {
        if let saved = UserDefaults.standard.string(forKey: Self.serverDirDefaultsKey) {
            serverDir = URL(fileURLWithPath: saved)
        }
        startPolling()
        Task { await refresh() }
    }

    /// Every 10s — frequent enough that "I just clicked Start" feels responsive (Tor typically
    /// publishes within 10-30s), infrequent enough not to spam the relay's own SQLite reads.
    private func startPolling() {
        refreshTimer?.invalidate()
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in
            Task { @MainActor in await self?.refresh() }
        }
    }

    func chooseServerFolder() {
        let panel = NSOpenPanel()
        panel.title = "Select the unpruuf server folder"
        panel.message = "Pick the \"server\" folder (the one containing start-mac.command)."
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        guard panel.runModal() == .OK, let url = panel.url else { return }
        serverDir = url
        Task { await refresh() }
    }

    // MARK: - Status

    func refresh() async {
        isRefreshing = true
        defer { isRefreshing = false }

        guard let dir = serverDir else {
            state = .notConfigured
            return
        }
        guard FileManager.default.fileExists(atPath: dir.appendingPathComponent("dist/mac-start.js").path) else {
            state = .unknown("This folder doesn't look like the unpruuf server folder (no dist/mac-start.js found).")
            return
        }

        let serviceLoaded = await isServiceLoaded()
        let result = await runNode(dir: dir, args: ["--status-json"])

        switch result {
        case .failure(let error) where error.message.contains("not-set-up"):
            state = .notSetUp
            ttlHours = nil
            queue = nil
            lastError = nil
        case .failure(let error):
            state = .unknown(error.message)
            lastError = error.message
        case .success(let json):
            ttlHours = json.ttlHours
            queue = json.queue
            lastError = nil
            // launchctl decides running-vs-stopped FIRST: the onion hostname file is left in
            // place on disk even after a clean stop (deliberately, so contacts don't need to
            // re-pair — see mac/README.md) and even after the process was killed abnormally, so
            // its mere presence can never be used to tell "running" from "stopped". It only
            // narrows down *which* running sub-state once launchctl already says the service is
            // loaded.
            if !serviceLoaded {
                state = .stopped
            } else if let onion = json.onion {
                state = .running(onion: onion)
            } else {
                state = .starting
            }
        }
    }

    private func isServiceLoaded() async -> Bool {
        let result = await runShell("launchctl list com.nexonai.unpruuf.relay")
        return result.exitCode == 0
    }

    // MARK: - Actions

    func start() async {
        // Without this guard, a second overlapping call (e.g. a double click landing before the
        // first click's `isBusy = true` re-renders the disabled button) runs a second
        // install-service.command concurrently — and that script's own `launchctl bootout` of
        // any existing registration would then kill the FIRST call's freshly-started relay out
        // from under it, which is exactly the "started fine, then a clean [shutdown] moments
        // later" log pattern this was chasing.
        guard !isBusy, let dir = serverDir else { return }
        isBusy = true
        defer { isBusy = false }
        let script = dir.appendingPathComponent("mac/install-service.command").path
        let result = await runShell("bash \"\(script)\" < /dev/null")
        lastError = result.exitCode == 0 ? nil : "install-service.command failed (exit \(result.exitCode)):\n\(result.output)"
        await refresh()
    }

    func stop() async {
        guard !isBusy, let dir = serverDir else { return }
        isBusy = true
        defer { isBusy = false }
        let script = dir.appendingPathComponent("mac/uninstall-service.command").path
        let result = await runShell("bash \"\(script)\" < /dev/null")
        lastError = result.exitCode == 0 ? nil : "uninstall-service.command failed (exit \(result.exitCode)):\n\(result.output)"
        await refresh()
    }

    func loadConnectionString() async {
        guard let dir = serverDir else { return }
        let result = await runNodeShowCode(dir: dir)
        switch result {
        case .success(let value):
            connectionString = value
            lastError = nil
        case .failure(let error):
            connectionString = nil
            lastError = error.message
        }
    }

    func copyConnectionStringToPasteboard() {
        guard let value = connectionString else { return }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(value, forType: .string)
    }

    func revealServerFolderInFinder() {
        guard let dir = serverDir else { return }
        revealInFinder(dir)
    }

    /// Reveals `unpruuf-relay.log`, falling back to the containing Logs folder if the file
    /// doesn't exist yet (e.g. before the background service has been started even once) —
    /// `lastError` is always set on the fallback path so clicking this is never a silent no-op.
    func revealLogInFinder() {
        let logsDir = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs")
        let log = logsDir.appendingPathComponent("unpruuf-relay.log")
        if FileManager.default.fileExists(atPath: log.path) {
            revealInFinder(log)
            lastError = nil
        } else {
            revealInFinder(logsDir)
            lastError = "unpruuf-relay.log doesn't exist yet — opened the Logs folder instead. It's created the first time the relay runs as a background service (Start relay)."
        }
    }

    /// Shells out to `open -R` (the same mechanism Finder's own "Reveal in Finder" uses) instead
    /// of `NSWorkspace.activateFileViewerSelecting` — this app runs as a menu-bar-only agent
    /// (`LSUIElement`), which has been observed to fail silently (no error, Finder never comes to
    /// the front) with that AppKit API for this exact kind of process. `open -R` reliably brings
    /// Finder forward regardless.
    private func revealInFinder(_ url: URL) {
        Task { _ = await runShell("open -R \"\(url.path)\"") }
    }

    // MARK: - Process plumbing

    /// Runs a shell command through a login shell (`zsh -l`) so PATH includes Homebrew/nvm/etc.
    /// the same way a user's own Terminal would — a bare `Process` with no shell would not see
    /// `node` at all on most Homebrew-on-Apple-Silicon setups (see mac/README.md's own note about
    /// launchd needing an explicit PATH for the same reason).
    ///
    /// **Hard timeout, always.** A command run against the wrong folder (or one on a slow/hung
    /// cloud-sync mount — OneDrive/Google Drive placeholder files are a known real case) must
    /// never be allowed to block this app indefinitely: every call here is on the polling path
    /// (`refresh()` runs every 10s) or a direct user action, so a stuck child process would either
    /// freeze the status dot forever or stack up overlapping polls. `terminate()` alone isn't
    /// airtight against every possible hang (a process stuck in uninterruptible disk I/O is a
    /// kernel-level condition no userspace signal can pre-empt), but it does cover the far more
    /// common case — a script that's merely slow or waiting on something that will never
    /// arrive — and costs nothing when everything is healthy.
    private func runShell(_ command: String, timeout: TimeInterval = 15) async -> (output: String, exitCode: Int32) {
        let resumed = ResumeGuard()
        return await withCheckedContinuation { continuation in
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/bin/zsh")
            process.arguments = ["-l", "-c", command]
            process.standardInput = FileHandle.nullDevice
            let pipe = Pipe()
            process.standardOutput = pipe
            process.standardError = pipe
            do {
                try process.run()
            } catch {
                if resumed.markResumed() {
                    continuation.resume(returning: ("\(error)", -1))
                }
                return
            }
            process.terminationHandler = { proc in
                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                let text = String(data: data, encoding: .utf8) ?? ""
                if resumed.markResumed() {
                    continuation.resume(returning: (text, proc.terminationStatus))
                }
            }
            Task {
                try? await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                guard resumed.markResumed() else { return }
                process.terminate()
                continuation.resume(returning: ("timed out after \(Int(timeout))s — is the chosen folder correct and reachable (not a hung network/cloud-sync location)?", -1))
            }
        }
    }

    private func runNode(dir: URL, args: [String]) async -> Result<RelayStatusJSON, RelayError> {
        let joined = args.joined(separator: " ")
        let result = await runShell("cd \"\(dir.path)\" && node dist/mac-start.js \(joined)")
        return Self.decodeLastJSONLine(result.output)
    }

    private func runNodeShowCode(dir: URL) async -> Result<String, RelayError> {
        let result = await runShell("cd \"\(dir.path)\" && node dist/mac-start.js --show-code-json")
        guard let line = Self.lastJSONLine(result.output),
              let data = line.data(using: .utf8),
              let decoded = try? JSONDecoder().decode(ShowCodeJSON.self, from: data) else {
            return .failure(RelayError(result.output.isEmpty ? "No output from the relay." : result.output))
        }
        if let connectionString = decoded.connectionString {
            return .success(connectionString)
        }
        return .failure(RelayError(decoded.error ?? "unknown-error"))
    }

    /// `node` may print unrelated warnings on stdout/stderr before the JSON line (e.g. a
    /// deprecation notice) — only the last non-empty line is ours, since every `--*-json` command
    /// prints exactly one line as its final output.
    private static func lastJSONLine(_ output: String) -> String? {
        output.split(separator: "\n").map(String.init).last { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
    }

    private static func decodeLastJSONLine(_ output: String) -> Result<RelayStatusJSON, RelayError> {
        guard let line = lastJSONLine(output), let data = line.data(using: .utf8),
              let decoded = try? JSONDecoder().decode(RelayStatusJSON.self, from: data) else {
            return .failure(RelayError(output.isEmpty ? "No output from the relay." : output))
        }
        if let error = decoded.error {
            return .failure(RelayError(error))
        }
        return .success(decoded)
    }
}
