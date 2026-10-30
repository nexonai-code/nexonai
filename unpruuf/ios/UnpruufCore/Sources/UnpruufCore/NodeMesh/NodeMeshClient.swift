import Foundation

/// A node's HTTP reply, read with the limits of Android's `NodeMeshClient`: a head line is at most
/// 8 KB, at most 64 head lines, a body at most 12 MB. Anything beyond is not a node.
public struct NodeHTTPResponse: Equatable {
    public let status: Int
    public let retryAfterSeconds: Int?
    public let body: Data

    static let maxHeadLineBytes = 8 * 1024
    static let maxHeadLines = 64
    static let maxBodyBytes = 12 * 1024 * 1024
    /// A hostile node should not be able to silence a contact for days with one header.
    static let maxRetryAfterSeconds = 3600

    enum ReadError: Error { case malformed, tooLarge }

    static func read(from connection: NodeConnection) async throws -> NodeHTTPResponse {
        var buffer = Data()
        func fill() async throws -> Bool {
            let chunk = try await connection.receive(atLeast: 1, atMost: 65536)
            buffer.append(chunk)
            return !chunk.isEmpty
        }
        func line() async throws -> String {
            while true {
                if let end = buffer.firstIndex(of: 0x0A) {
                    guard end - buffer.startIndex <= maxHeadLineBytes else { throw ReadError.tooLarge }
                    var bytes = buffer[buffer.startIndex..<end]
                    if bytes.last == 0x0D { bytes = bytes.dropLast() }
                    buffer = Data(buffer[(end + 1)...])
                    return String(decoding: bytes, as: UTF8.self)
                }
                guard buffer.count <= maxHeadLineBytes else { throw ReadError.tooLarge }
                guard try await fill() else { throw ReadError.malformed }
            }
        }

        let parts = try await line().split(separator: " ")
        guard parts.count >= 2, let status = Int(parts[1]) else { throw ReadError.malformed }

        var contentLength = 0
        var retryAfter: Int?
        var headLines = 0
        while true {
            let header = try await line()
            if header.isEmpty { break }
            headLines += 1
            guard headLines <= maxHeadLines else { throw ReadError.tooLarge }
            guard let colon = header.firstIndex(of: ":") else { continue }
            let value = header[header.index(after: colon)...].trimmingCharacters(in: .whitespaces)
            switch header[..<colon].lowercased() {
            case "content-length":
                guard let length = Int(value), length >= 0 else { throw ReadError.malformed }
                guard length <= maxBodyBytes else { throw ReadError.tooLarge }
                contentLength = length
            case "retry-after":
                retryAfter = Int(value).map { min(max($0, 0), maxRetryAfterSeconds) }
            default:
                break
            }
        }

        while buffer.count < contentLength {
            guard try await fill() else { throw ReadError.malformed }
        }
        return NodeHTTPResponse(status: status, retryAfterSeconds: retryAfter, body: Data(buffer.prefix(contentLength)))
    }
}

/// Client for the node server (`node-mesh-server/`), ported from Android's `NodeMeshClient`. Each
/// request is one connection. Every address is checked again right before connecting, so an
/// owner secret or a grant can never leave through a Tor exit to a plain host.
public struct NodeMeshClient: Sendable {
    static let nodePort: UInt16 = 80
    static let connectTimeout: TimeInterval = 40
    static let socketTimeout: TimeInterval = 40
    static let longPollMargin: TimeInterval = 15
    static let healthTimeout: TimeInterval = 15
    static let feedTimeout: TimeInterval = 60
    static let maxFeedBytes = 600_000
    public static let maxTagsPerFetch = 64

    private let transport: NodeTransport

    public init(transport: NodeTransport) {
        self.transport = transport
    }

    // MARK: Deposit

    public enum DepositResult: Equatable {
        case accepted
        /// 429, the queue of this tag is full.
        case tagQueueFull(retryAfterSeconds: Int?)
        /// 507, the server's storage is full: the message stays in memory, try the next node.
        case storageFull
        /// 402
        case licenceExpired
        /// 423
        case serverLocked
        /// 400, 413, anything else, or no answer.
        case failed
    }

    public func deposit(address: String, ownerSecret: String, routingTag: String, ciphertext: Data,
                        ttlMs: Int64? = nil, isolationKey: String? = nil) async -> DepositResult {
        let response = await request(address, "PUT", "/deposit", body: Self.depositBody(routingTag, ciphertext, ttlMs),
                                     authorization: "Bearer \(ownerSecret)", isolationKey: isolationKey)
        guard let response else { return .failed }
        switch response.status {
        case 200...299: return .accepted
        case 429: return .tagQueueFull(retryAfterSeconds: response.retryAfterSeconds)
        case 507: return .storageFull
        case 402: return .licenceExpired
        case 423: return .serverLocked
        default: return .failed
        }
    }

    public enum GuestDepositResult: Equatable {
        case ok, grantRefused, quotaReached, failed
    }

    /// With a grant the owner issued, never an owner secret. No fallback on any result.
    public func depositAsGuest(address: String, grantToken: String, routingTag: String, ciphertext: Data,
                               ttlMs: Int64? = nil, isolationKey: String? = nil) async -> GuestDepositResult {
        let response = await request(address, "PUT", "/deposit", body: Self.depositBody(routingTag, ciphertext, ttlMs),
                                     authorization: GuestGrant.authorizationHeader(grantToken), isolationKey: isolationKey)
        guard let response else { return .failed }
        switch response.status {
        case 200...299: return .ok
        case 401: return .grantRefused
        case 429: return .quotaReached
        default: return .failed
        }
    }

    // MARK: Fetch

    public struct FetchResult: Equatable {
        public let blobs: [String: [Data]]
        /// `nil` from a node without cursors: the caller then fetches everything again.
        public let cursor: Int64?
        /// The node cut the answer at 256 packets: ask again from `cursor`.
        public let more: Bool
    }

    public enum FetchOutcome: Equatable {
        case ok(FetchResult)
        case rateLimited(retryAfterSeconds: Int?)
        case failed
    }

    public func fetchMany(address: String, tags: [String], waitMs: Int64, since: Int64,
                          isolationKey: String? = nil) async -> FetchOutcome {
        guard !tags.isEmpty else { return .ok(FetchResult(blobs: [:], cursor: since, more: false)) }
        guard let body = try? JSONSerialization.data(withJSONObject: ["tags": tags, "waitMs": waitMs, "since": since]) else {
            return .failed
        }
        let timeout = max(Self.socketTimeout, TimeInterval(waitMs) / 1000 + Self.longPollMargin)
        guard let response = await request(address, "POST", "/fetchMany", body: body, timeout: timeout, isolationKey: isolationKey) else {
            return .failed
        }
        if response.status == 429 { return .rateLimited(retryAfterSeconds: response.retryAfterSeconds) }
        guard (200...299).contains(response.status), let result = Self.parseFetchMany(response.body) else { return .failed }
        return .ok(result)
    }

    static func parseFetchMany(_ body: Data) -> FetchResult? {
        guard let object = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
              let rawBlobs = object["blobs"] as? [String: [String]] else { return nil }
        return FetchResult(
            blobs: rawBlobs.mapValues { $0.compactMap { Data(base64Encoded: $0) } },
            cursor: (object["cursor"] as? NSNumber)?.int64Value,
            more: object["more"] as? Bool ?? false
        )
    }

    // MARK: Pool, sealed servers, health, feed

    public struct PoolInfo: Equatable {
        public let addresses: [String]
        public let controlAddress: String?
    }

    public func listPool(address: String, ownerSecret: String) async -> PoolInfo? {
        guard let response = await request(address, "GET", "/pool", authorization: "Bearer \(ownerSecret)"),
              (200...299).contains(response.status) else { return nil }
        return Self.parsePool(response.body)
    }

    /// Anything that is not a v3 onion is dropped.
    static func parsePool(_ body: Data) -> PoolInfo? {
        guard let object = try? JSONSerialization.jsonObject(with: body) as? [String: Any] else { return nil }
        var seen = Set<String>()
        let addresses = (object["addresses"] as? [String] ?? []).filter { OnionAddress.isValid($0) && seen.insert($0).inserted }
        let control = (object["control"] as? String).flatMap { OnionAddress.isValid($0) ? $0 : nil }
        return PoolInfo(addresses: addresses, controlAddress: control)
    }

    /// True: restarted and waiting for its owner. Sends nothing secret.
    public func lockStatus(controlAddress: String) async -> Bool? {
        guard let response = await request(controlAddress, "GET", "/lock-status", timeout: Self.healthTimeout),
              (200...299).contains(response.status),
              let object = try? JSONSerialization.jsonObject(with: response.body) as? [String: Any] else { return nil }
        return object["locked"] as? Bool ?? false
    }

    /// Sends the owner secret, so only ever after the user confirmed it.
    public func unlock(controlAddress: String, ownerSecret: String) async -> [String]? {
        guard let response = await request(controlAddress, "POST", "/unlock", authorization: "Bearer \(ownerSecret)"),
              (200...299).contains(response.status) else { return nil }
        return Self.parsePool(response.body)?.addresses
    }

    public func healthCheck(address: String) async -> Bool {
        guard let response = await request(address, "GET", "/health", timeout: Self.healthTimeout) else { return false }
        return (200...299).contains(response.status)
    }

    public func fetchFeedList(address: String) async -> String? {
        guard let response = await request(address, "GET", "/list", timeout: Self.feedTimeout),
              (200...299).contains(response.status), response.body.count <= Self.maxFeedBytes else { return nil }
        return String(data: response.body, encoding: .utf8)
    }

    // MARK: HTTP

    private static func depositBody(_ tag: String, _ ciphertext: Data, _ ttlMs: Int64?) -> Data? {
        var fields: [String: Any] = ["routing_tag": tag, "ciphertext": ciphertext.base64EncodedString()]
        if let ttlMs { fields["ttl"] = ttlMs }
        return try? JSONSerialization.data(withJSONObject: fields)
    }

    static func requestHead(address: String, method: String, path: String, bodyLength: Int?, authorization: String?) -> Data {
        var head = "\(method) \(path) HTTP/1.1\r\nHost: \(address)\r\n"
        if let authorization { head += "Authorization: \(authorization)\r\n" }
        head += "Connection: close\r\n"
        if let bodyLength { head += "Content-Type: application/json\r\nContent-Length: \(bodyLength)\r\n" }
        return Data((head + "\r\n").utf8)
    }

    private func request(_ address: String, _ method: String, _ path: String, body: Data? = nil, authorization: String? = nil,
                         timeout: TimeInterval = NodeMeshClient.socketTimeout, isolationKey: String? = nil) async -> NodeHTTPResponse? {
        guard OnionAddress.isValid(address) else { return nil }
        guard let connection = try? await transport.connect(address: address, port: Self.nodePort, isolationKey: isolationKey,
                                                            timeout: Self.connectTimeout) else { return nil }
        defer { connection.close() }
        connection.setDeadline(timeout)
        var bytes = Self.requestHead(address: address, method: method, path: path, bodyLength: body?.count, authorization: authorization)
        if let body { bytes.append(body) }
        guard (try? await connection.send(bytes)) != nil else { return nil }
        return try? await NodeHTTPResponse.read(from: connection)
    }
}
