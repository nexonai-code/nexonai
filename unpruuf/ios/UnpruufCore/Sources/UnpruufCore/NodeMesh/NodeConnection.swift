import Foundation
import Network

/// One TCP stream to a node, however it got there.
public protocol NodeConnection: AnyObject, Sendable {
    func send(_ data: Data) async throws
    /// Between `atLeast` and `atMost` bytes. Fewer than `atLeast` only at the end of the stream.
    func receive(atLeast: Int, atMost: Int) async throws -> Data
    /// Everything on this connection must be finished within `seconds` from now.
    func setDeadline(_ seconds: TimeInterval)
    func close()
}

/// How the client reaches a node. `TorNodeTransport` is the only one in shipped code.
public protocol NodeTransport: Sendable {
    func connect(address: String, port: UInt16, isolationKey: String?, timeout: TimeInterval) async throws -> NodeConnection
}

public enum NodeConnectionError: Error, Equatable {
    case connectionFailed
    case torNotReady
    case socks(String)
}

/// Tor's SOCKS port on this device. Nothing else: when Tor is not ready nothing is sent, there is
/// no fallback to a default port and no direct connection. With an isolation key the request gets
/// Tor circuits of its own (see `Socks5`).
public struct TorNodeTransport: NodeTransport {
    private let socksPort: @Sendable () async -> UInt16

    public init(socksPort: @escaping @Sendable () async -> UInt16) {
        self.socksPort = socksPort
    }

    public func connect(address: String, port: UInt16, isolationKey: String?, timeout: TimeInterval) async throws -> NodeConnection {
        let proxyPort = await socksPort()
        guard proxyPort != 0 else { throw NodeConnectionError.torNotReady }
        let connection = try await NWNodeConnection.open(host: "127.0.0.1", port: proxyPort, timeout: timeout)
        do {
            try await Socks5.connect(over: connection, host: address, port: port, username: isolationKey)
            return connection
        } catch {
            connection.close()
            throw error
        }
    }
}

/// `NodeConnection` over `Network.framework`. A deadline cancels the connection, which ends any
/// send or receive still waiting on it.
public final class NWNodeConnection: NodeConnection, @unchecked Sendable {
    private let connection: NWConnection
    private let queue = DispatchQueue(label: "unpruuf.node-connection")
    private var deadline: DispatchWorkItem?

    private init(connection: NWConnection) {
        self.connection = connection
    }

    public static func open(host: String, port: UInt16, timeout: TimeInterval) async throws -> NWNodeConnection {
        guard let endpointPort = NWEndpoint.Port(rawValue: port) else { throw NodeConnectionError.connectionFailed }
        let wrapped = NWNodeConnection(connection: NWConnection(host: NWEndpoint.Host(host), port: endpointPort, using: .tcp))
        wrapped.setDeadline(timeout)
        try await wrapped.start()
        return wrapped
    }

    private func start() async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            var resumed = false
            connection.stateUpdateHandler = { [connection] state in
                guard !resumed else { return }
                switch state {
                case .ready:
                    resumed = true
                    continuation.resume()
                case .waiting, .failed, .cancelled:
                    resumed = true
                    connection.cancel()
                    continuation.resume(throwing: NodeConnectionError.connectionFailed)
                default:
                    break
                }
            }
            connection.start(queue: queue)
        }
    }

    public func send(_ data: Data) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            connection.send(content: data, completion: .contentProcessed { error in
                if let error { continuation.resume(throwing: error) } else { continuation.resume() }
            })
        }
    }

    public func receive(atLeast: Int, atMost: Int) async throws -> Data {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Data, Error>) in
            connection.receive(minimumIncompleteLength: atLeast, maximumLength: atMost) { data, _, _, error in
                if let error, data?.isEmpty ?? true {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: data ?? Data())
                }
            }
        }
    }

    public func setDeadline(_ seconds: TimeInterval) {
        queue.async { [self] in
            deadline?.cancel()
            let item = DispatchWorkItem { [connection] in connection.cancel() }
            deadline = item
            queue.asyncAfter(deadline: .now() + seconds, execute: item)
        }
    }

    public func close() {
        queue.async { [self] in
            deadline?.cancel()
            deadline = nil
            connection.cancel()
        }
    }
}

/// SOCKS5 client for Tor's SocksPort with optional user name (RFC 1929), ported from Android's
/// `Socks5`. Tor keeps streams with different credentials on different circuits. Fails closed: with
/// a user name only that method is offered, so a proxy answering "no authentication" is refused
/// instead of carrying the request without isolation. The host goes to Tor as a name, never
/// resolved here.
public enum Socks5 {
    private static let version: UInt8 = 5
    private static let methodNone: UInt8 = 0
    private static let methodUserPass: UInt8 = 2

    public static func connect(over connection: NodeConnection, host: String, port: UInt16, username: String?) async throws {
        let name = Array(host.utf8)
        let user = username.map { Array($0.utf8) }
        guard (1...255).contains(name.count), port != 0, user.map({ (1...255).contains($0.count) }) ?? true else {
            throw NodeConnectionError.socks("bad target")
        }

        try await connection.send(Data([version, 1, user != nil ? methodUserPass : methodNone]))
        let greeting = try await read(connection, 2)
        guard greeting[0] == version else { throw NodeConnectionError.socks("not a SOCKS5 proxy") }
        guard greeting[1] == (user != nil ? methodUserPass : methodNone) else {
            throw NodeConnectionError.socks("proxy did not accept the offered method")
        }

        if let user {
            // The password is the user name again: Tor looks only at the pair as a whole.
            try await connection.send(Data([1, UInt8(user.count)] + user + [UInt8(user.count)] + user))
            let reply = try await read(connection, 2)
            guard reply == [1, 0] else { throw NodeConnectionError.socks("proxy rejected the credentials") }
        }

        try await connection.send(Data([version, 1, 0, 3, UInt8(name.count)] + name + [UInt8(port >> 8), UInt8(port & 0xFF)]))
        let head = try await read(connection, 4)
        guard head[0] == version else { throw NodeConnectionError.socks("malformed reply") }
        // The bound address that follows is dropped, so the caller's data starts clean.
        switch head[3] {
        case 1: _ = try await read(connection, 4 + 2)
        case 4: _ = try await read(connection, 16 + 2)
        case 3: _ = try await read(connection, Int(try await read(connection, 1)[0]) + 2)
        default: throw NodeConnectionError.socks("malformed reply")
        }
        guard head[1] == 0 else { throw NodeConnectionError.socks("connect refused by the proxy") }
    }

    private static func read(_ connection: NodeConnection, _ count: Int) async throws -> [UInt8] {
        let data = try await connection.receive(atLeast: count, atMost: count)
        guard data.count == count else { throw NodeConnectionError.socks("connection closed") }
        return [UInt8](data)
    }
}
