import Foundation
import Network

/// A minimal Tor control-protocol client over the same Unix-domain control socket
/// `iCepa/Tor.framework`'s own `TORController` talks to — written to replace *only* that class,
/// whose `connect()` was found (real hardware, 2026‑09‑02, confirmed by reading the framework's
/// actual source on GitHub) to reliably fail on any but the very first attempt in a process: it
/// backs every connection with a private, class-level *shared* serial dispatch queue via
/// `dispatch_io_create`, and a second real channel on that queue never succeeds — not a timing
/// issue (proven: 20+ seconds of continuous retrying, zero successes), not fixable by waiting
/// longer or recreating the `TORController` instance (also tried, insufficient on its own).
///
/// Built on Apple's own `Network.framework` (`NWConnection`) instead, specifically to avoid that
/// shared queue entirely — a completely different, independently-implemented connection path,
/// not another consumer of the same broken one. Everything about how Tor *itself* runs
/// (`TorThread`/`TorConfiguration`, `Tor.framework` classes) is untouched by this file and
/// continues to work exactly as already proven on real hardware.
///
/// Implements only the tiny slice of the real Tor control protocol (see Tor's
/// `control-spec.txt`) this app actually needs — `AUTHENTICATE` and `GETINFO` — not a
/// general-purpose control client. Both are simple request/response exchanges over one
/// connection, so a FIFO queue of pending completion handlers is enough; nothing here pipelines
/// multiple in-flight commands.
final class TorControlConnection {
    enum ControlError: Error, CustomStringConvertible {
        case notConnected
        case commandFailed(String)

        var description: String {
            switch self {
            case .notConnected: return "not connected"
            case .commandFailed(let line): return "command failed: \(line)"
            }
        }
    }

    private let socketPath: String
    private var connection: NWConnection?
    private var buffer = Data()
    private var pendingHandlers: [(Result<[String], Error>) -> Void] = []
    private static let lineSeparator = Data("\r\n".utf8)

    init(socketPath: String) {
        self.socketPath = socketPath
    }

    /// Opens the connection. Calls `completion` exactly once, either once the socket is genuinely
    /// ready to send/receive or if it fails/is cancelled before that.
    ///
    /// **Diagnostic note, 2026‑09‑02**: real-hardware testing of the first version of this class
    /// showed `.failed(let error)` firing on effectively every attempt with `error` printing as
    /// the bare word `nilError` via `\(error)` — the same uninformative text this class was
    /// written specifically to get away from (see the top-of-file doc comment). Since this class
    /// has no Objective-C bridging at all, that text can't be the same synthesized-NSError
    /// bridging artifact `Tor.framework` produced; something else is going on. Every state
    /// transition is now logged (not just the three terminal ones) and a failure logs the error's
    /// full `NSError` bridging (domain/code/userInfo) via `String(reflecting:)`, not just its
    /// `CustomStringConvertible` description, so the real underlying reason is visible in the
    /// next real-device log instead of being lost.
    /// **Real bug found on real hardware, 2026‑09‑02, confirmed by the diagnostics added just
    /// above this fix**: on the very first attempt after backgrounding, the control-socket file
    /// doesn't exist yet (Tor is only just starting), so `NWConnection` correctly goes into
    /// `.waiting(POSIXErrorCode.ENOENT)` — but `.waiting` fell into this switch's `default: break`
    /// and never called `completion`, so `TorController.connectAndAuthenticate`'s retry loop, which
    /// is entirely driven by that completion firing, silently deadlocked forever at its very first
    /// attempt. The real device log confirmed this exactly: Tor went on to boot, open its control
    /// listener, and bootstrap to 100% — genuinely ready — while this class sat in `.waiting`
    /// permanently, never re-issuing the connect. Unlike a real network-path change (Wi-Fi drop,
    /// cellular takeover), `NWConnection` apparently does not itself re-poll a Unix-domain socket
    /// path that didn't exist at connect time, even once it starts existing. Fixed by treating
    /// `.waiting` as a failure for this class's purposes too — the caller's own retry loop (a
    /// fresh `TorControlConnection`/`NWConnection` every 0.5s) already exists specifically to work
    /// around one-shot connection limitations (see the thirteenth real-bug note on
    /// `TorController.swift`), so handing it back a fresh attempt is both correct and consistent.
    func connect(completion: @escaping (Result<Void, Error>) -> Void) {
        let endpoint = NWEndpoint.unix(path: socketPath)
        let conn = NWConnection(to: endpoint, using: .tcp)
        connection = conn
        var completed = false
        conn.stateUpdateHandler = { [weak self] state in
            print("[TorControlConnection] state: \(String(reflecting: state))")
            switch state {
            case .ready:
                guard !completed else { return }
                completed = true
                self?.startReceiving()
                completion(.success(()))
            case .failed(let error):
                guard !completed else { return }
                completed = true
                let nsError = error as NSError
                print("[TorControlConnection] failed: \(String(reflecting: error)) — NSError domain=\(nsError.domain) code=\(nsError.code) userInfo=\(nsError.userInfo)")
                completion(.failure(error))
            case .waiting(let error):
                guard !completed else { return }
                completed = true
                let nsError = error as NSError
                print("[TorControlConnection] waiting (treated as failure so the caller retries with a fresh connection): \(String(reflecting: error)) — NSError domain=\(nsError.domain) code=\(nsError.code) userInfo=\(nsError.userInfo)")
                conn.cancel()
                completion(.failure(error))
            case .cancelled:
                guard !completed else { return }
                completed = true
                completion(.failure(ControlError.notConnected))
            default:
                break
            }
        }
        conn.start(queue: .main)
    }

    /// Closes the socket without sending any control-protocol command — in particular, never
    /// `SIGNAL SHUTDOWN` (the ninth real-bug note on `TorController.swift` explains why that one
    /// specifically must never be sent: it kills the actual Tor daemon, not just this connection).
    /// An ordinary socket close is exactly what a normal client disconnect looks like to Tor.
    func close() {
        connection?.cancel()
        connection = nil
        failAllPending(ControlError.notConnected)
    }

    func authenticate(cookie: Data, completion: @escaping (Bool, Error?) -> Void) {
        let hex = cookie.map { String(format: "%02x", $0) }.joined()
        sendCommand("AUTHENTICATE \(hex)") { result in
            switch result {
            case .success: completion(true, nil)
            case .failure(let error): completion(false, error)
            }
        }
    }

    /// Mirrors `Tor.TorController.getInfoForKeys`'s shape exactly (an ordered array of values,
    /// empty on failure) so the calling code in `TorController.swift` didn't need to change.
    func getInfoForKeys(_ keys: [String], completion: @escaping ([String]) -> Void) {
        sendCommand("GETINFO " + keys.joined(separator: " ")) { result in
            switch result {
            case .success(let values): completion(values)
            case .failure: completion([])
            }
        }
    }

    // MARK: - Wire protocol

    private func sendCommand(_ command: String, completion: @escaping (Result<[String], Error>) -> Void) {
        guard let connection else {
            completion(.failure(ControlError.notConnected))
            return
        }
        pendingHandlers.append(completion)
        let data = (command + "\r\n").data(using: .utf8)!
        connection.send(content: data, completion: .contentProcessed { [weak self] error in
            guard let error else { return }
            // The send itself failed — this command will never get a reply, so its handler must
            // be resolved here rather than left hanging forever.
            self?.failAllPending(error)
        })
    }

    private func startReceiving() {
        connection?.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, isComplete, error in
            guard let self else { return }
            if let data, !data.isEmpty {
                self.buffer.append(data)
                self.processBuffer()
            }
            if let error {
                self.failAllPending(error)
                return
            }
            if isComplete {
                self.failAllPending(ControlError.notConnected)
                return
            }
            self.startReceiving()
        }
    }

    private func failAllPending(_ error: Error) {
        guard !pendingHandlers.isEmpty else { return }
        let handlers = pendingHandlers
        pendingHandlers.removeAll()
        handlers.forEach { $0(.failure(error)) }
    }

    /// Parses complete `\r\n`-terminated lines out of `buffer`, accumulating one response — which
    /// can span multiple lines, e.g. a multi-key `GETINFO` reply (`250-key=value` per key) — until
    /// a *final* line completes it. Per Tor's control-spec, a final line has a space as the 4th
    /// character (`250 OK`); a continuation line has a dash (`250-key=value`).
    private func processBuffer() {
        var values: [String] = []
        while let range = buffer.range(of: Self.lineSeparator) {
            let lineData = buffer.subdata(in: buffer.startIndex..<range.lowerBound)
            buffer.removeSubrange(buffer.startIndex..<range.upperBound)
            guard let line = String(data: lineData, encoding: .utf8), line.count >= 4 else { continue }
            let code = line.prefix(3)
            let separatorIndex = line.index(line.startIndex, offsetBy: 3)
            let isFinal = line[separatorIndex] == " "
            let rest = String(line[line.index(after: separatorIndex)...])

            guard code.first == "2" else {
                // Any non-2xx reply is a failure for our purposes — AUTHENTICATE/GETINFO are the
                // only commands this client ever sends, and neither has a legitimate multi-line
                // error case worth handling more precisely than "the pending command failed".
                if !pendingHandlers.isEmpty {
                    pendingHandlers.removeFirst()(.failure(ControlError.commandFailed(line)))
                }
                values = []
                continue
            }

            // `key=value` for GETINFO/AUTHENTICATE-shaped lines; a bare final `250 OK` has no
            // `=` at all and contributes nothing to `values`. Only the first `=` is the key/value
            // separator — the value itself may contain more (e.g. bootstrap-phase's own
            // `PROGRESS=100 TAG=done` — preserved here verbatim, exactly as the framework's own
            // `getInfoForKeys` returned it, since the existing `pollBootstrap` parsing already
            // expects and handles that shape).
            if let eq = rest.firstIndex(of: "=") {
                values.append(String(rest[rest.index(after: eq)...]))
            }

            if isFinal {
                if !pendingHandlers.isEmpty {
                    pendingHandlers.removeFirst()(.success(values))
                }
                values = []
            }
        }
    }
}
