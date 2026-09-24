import Foundation
import Network

/// A deliberately narrow HTTP client for exactly the relay's three endpoints (`POST /v1/relay`,
/// `GET /v1/fetch`, `GET /health`), routed through Tor's local SOCKS5 proxy by hand.
///
/// **Why not `URLSession`:** iOS's `URLSessionConfiguration` has no supported way to point at a
/// SOCKS5 proxy (only HTTP/HTTPS CONNECT proxies). Building a general SOCKS-aware `URLProtocol`
/// would be a much larger, harder-to-verify piece for no benefit here — the relay's entire API
/// surface is three simple JSON endpoints on a server this project also controls, so a small
/// hand-rolled client covering exactly that is lower risk than a general-purpose one.
///
/// Speaks a minimal SOCKS5 (RFC 1928, no-auth, `CONNECT` with a domain-name `ATYP` so Tor itself
/// resolves the target's `.onion` address) followed by raw HTTP/1.1 over the resulting tunnel.
/// Built on `Network.framework`'s `NWConnection` (no third-party dependency).
actor SocksHTTPClient {
    struct HTTPResponse {
        let statusCode: Int
        let body: Data
    }

    enum ClientError: Error {
        case connectionFailed
        case socksHandshakeFailed
        case socksConnectFailed(reason: UInt8)
        case malformedResponse
        case timedOut
    }

    /// Performs one request over a fresh connection (no pooling/keep-alive — matches the relay's
    /// small, infrequent call pattern; simplicity over throughput here).
    func request(
        method: String, socksHost: String = "127.0.0.1", socksPort: UInt16,
        targetHost: String, targetPort: UInt16, path: String,
        headers: [String: String] = [:], body: Data? = nil, timeout: TimeInterval = 30
    ) async throws -> HTTPResponse {
        let connection = NWConnection(
            host: NWEndpoint.Host(socksHost), port: NWEndpoint.Port(rawValue: socksPort)!, using: .tcp
        )
        defer { connection.cancel() }

        return try await withThrowingTaskGroup(of: HTTPResponse.self) { group in
            group.addTask {
                try await self.runRequest(
                    connection: connection, method: method, targetHost: targetHost, targetPort: targetPort,
                    path: path, headers: headers, body: body
                )
            }
            group.addTask {
                try await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                throw ClientError.timedOut
            }
            let result = try await group.next()!
            group.cancelAll()
            return result
        }
    }

    private func runRequest(
        connection: NWConnection, method: String, targetHost: String, targetPort: UInt16,
        path: String, headers: [String: String], body: Data?
    ) async throws -> HTTPResponse {
        try await connect(connection)
        try await socksHandshake(connection, targetHost: targetHost, targetPort: targetPort)
        try await send(connection, httpRequest(method: method, host: targetHost, path: path, headers: headers, body: body))
        return try await readHTTPResponse(connection)
    }

    // MARK: - Connection lifecycle

    private func connect(_ connection: NWConnection) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            connection.stateUpdateHandler = { state in
                switch state {
                case .ready:
                    continuation.resume()
                case .failed, .cancelled:
                    continuation.resume(throwing: ClientError.connectionFailed)
                default:
                    break
                }
            }
            connection.start(queue: .global(qos: .userInitiated))
        }
        connection.stateUpdateHandler = nil
    }

    // MARK: - SOCKS5 (RFC 1928)

    private func socksHandshake(_ connection: NWConnection, targetHost: String, targetPort: UInt16) async throws {
        // Greeting: version 5, 1 auth method, no-auth (0x00).
        try await send(connection, Data([0x05, 0x01, 0x00]))
        let greetingReply = try await receiveExactly(connection, 2)
        guard greetingReply[0] == 0x05, greetingReply[1] == 0x00 else {
            throw ClientError.socksHandshakeFailed
        }

        // CONNECT request, ATYP=0x03 (domain name) so Tor resolves the .onion itself.
        guard let hostBytes = targetHost.data(using: .ascii), hostBytes.count <= 255 else {
            throw ClientError.socksHandshakeFailed
        }
        var connectRequest = Data([0x05, 0x01, 0x00, 0x03, UInt8(hostBytes.count)])
        connectRequest.append(hostBytes)
        connectRequest.append(UInt8(targetPort >> 8))
        connectRequest.append(UInt8(targetPort & 0xFF))
        try await send(connection, connectRequest)

        // Reply header: VER, REP, RSV, ATYP (4 bytes), then a variable-length address + 2-byte port.
        let replyHeader = try await receiveExactly(connection, 4)
        guard replyHeader[0] == 0x05 else { throw ClientError.socksHandshakeFailed }
        guard replyHeader[1] == 0x00 else { throw ClientError.socksConnectFailed(reason: replyHeader[1]) }

        let addrLen: Int
        switch replyHeader[3] {
        case 0x01: addrLen = 4 // IPv4
        case 0x04: addrLen = 16 // IPv6
        case 0x03:
            let lenByte = try await receiveExactly(connection, 1)
            addrLen = Int(lenByte[0])
        default:
            throw ClientError.socksHandshakeFailed
        }
        _ = try await receiveExactly(connection, addrLen + 2) // address + port, unused
    }

    // MARK: - Minimal HTTP/1.1

    private func httpRequest(method: String, host: String, path: String, headers: [String: String], body: Data?) -> Data {
        var lines = ["\(method) \(path) HTTP/1.1", "Host: \(host)", "Connection: close"]
        if let body {
            lines.append("Content-Type: application/json")
            lines.append("Content-Length: \(body.count)")
        }
        headers.forEach { lines.append("\($0.key): \($0.value)") }
        var request = Data((lines.joined(separator: "\r\n") + "\r\n\r\n").utf8)
        if let body { request.append(body) }
        return request
    }

    private func readHTTPResponse(_ connection: NWConnection) async throws -> HTTPResponse {
        var buffer = Data()
        let separator = Data("\r\n\r\n".utf8)
        // Read until the header/body separator shows up.
        while buffer.range(of: separator) == nil {
            let chunk = try await receiveAvailable(connection)
            if chunk.isEmpty { break }
            buffer.append(chunk)
            if buffer.count > 1_000_000 { throw ClientError.malformedResponse } // sanity cap
        }
        guard let separatorRange = buffer.range(of: separator) else {
            throw ClientError.malformedResponse
        }
        let headerData = buffer.subdata(in: buffer.startIndex..<separatorRange.lowerBound)
        guard let headerText = String(data: headerData, encoding: .utf8) else { throw ClientError.malformedResponse }
        let headerLines = headerText.components(separatedBy: "\r\n")
        guard let statusLine = headerLines.first else { throw ClientError.malformedResponse }
        let statusParts = statusLine.split(separator: " ")
        guard statusParts.count >= 2, let statusCode = Int(statusParts[1]) else { throw ClientError.malformedResponse }

        var contentLength = 0
        for line in headerLines.dropFirst() {
            let parts = line.split(separator: ":", maxSplits: 1)
            if parts.count == 2, parts[0].lowercased() == "content-length" {
                contentLength = Int(parts[1].trimmingCharacters(in: .whitespaces)) ?? 0
            }
        }

        var body = buffer.subdata(in: separatorRange.upperBound..<buffer.endIndex)
        while body.count < contentLength {
            let chunk = try await receiveAvailable(connection)
            if chunk.isEmpty { break }
            body.append(chunk)
        }
        return HTTPResponse(statusCode: statusCode, body: body.count > contentLength ? body.prefix(contentLength) : body)
    }

    // MARK: - NWConnection async helpers

    private func send(_ connection: NWConnection, _ data: Data) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            connection.send(content: data, completion: .contentProcessed { error in
                if let error { continuation.resume(throwing: error) } else { continuation.resume() }
            })
        }
    }

    private func receiveExactly(_ connection: NWConnection, _ count: Int) async throws -> Data {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Data, Error>) in
            connection.receive(minimumIncompleteLength: count, maximumLength: count) { data, _, _, error in
                if let error { continuation.resume(throwing: error); return }
                guard let data, data.count == count else { continuation.resume(throwing: ClientError.malformedResponse); return }
                continuation.resume(returning: data)
            }
        }
    }

    private func receiveAvailable(_ connection: NWConnection) async throws -> Data {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Data, Error>) in
            connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { data, _, isComplete, error in
                if let error { continuation.resume(throwing: error); return }
                if isComplete && (data == nil || data!.isEmpty) { continuation.resume(returning: Data()); return }
                continuation.resume(returning: data ?? Data())
            }
        }
    }
}
