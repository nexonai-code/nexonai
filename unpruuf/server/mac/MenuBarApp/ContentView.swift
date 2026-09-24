import SwiftUI

struct ContentView: View {
    @ObservedObject var controller: RelayController
    @State private var showQR = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header

            switch controller.state {
            case .notConfigured:
                notConfiguredBody
            case .notSetUp:
                notSetUpBody
            case .unknown(let message):
                Text(message).font(.callout).foregroundStyle(.secondary)
                folderRow
            case .stopped, .starting, .running:
                runningBody
                folderRow
            }

            if let error = controller.lastError, controller.state != .notSetUp {
                Text(error).font(.caption).foregroundStyle(.red)
            }
        }
        .padding(16)
        .frame(width: 320)
    }

    private var header: some View {
        HStack {
            Circle()
                .fill(dotColor)
                .frame(width: 10, height: 10)
            Text("unpruuf relay").font(.headline)
            Spacer()
            if controller.isRefreshing {
                ProgressView()
                    .controlSize(.small)
                    .frame(width: 16, height: 16)
            } else {
                Button {
                    Task { await controller.refresh() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .buttonStyle(.plain)
                .help("Refresh now")
            }
        }
    }

    private var dotColor: Color {
        switch controller.state.dotColorName {
        case "green": return .green
        case "yellow": return .yellow
        default: return .red
        }
    }

    private var notConfiguredBody: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Not set up yet. Choose the \"server\" folder from your unpruuf project (the one containing start-mac.command).")
                .font(.callout)
            Button("Choose server folder…") { controller.chooseServerFolder() }
        }
    }

    private var notSetUpBody: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("This relay has never been set up. Open Terminal, go to your server folder, and run ./start-mac.command once — it asks how long to keep undelivered messages and creates your relay's identity.")
                .font(.callout)
            Button("Reveal folder in Finder") { controller.revealServerFolderInFinder() }
        }
    }

    @ViewBuilder
    private var runningBody: some View {
        VStack(alignment: .leading, spacing: 6) {
            statusLine
            if let ttl = controller.ttlHours {
                Text("Message TTL: \(Int(ttl))h").font(.caption).foregroundStyle(.secondary)
            }
            if let queue = controller.queue {
                Text(Self.queueSummary(queue)).font(.caption).foregroundStyle(.secondary)
            }
        }

        Divider()

        HStack {
            if case .stopped = controller.state {
                Button("Start relay") { Task { await controller.start() } }
                    .disabled(controller.isBusy)
            } else {
                Button("Stop relay") { Task { await controller.stop() } }
                    .disabled(controller.isBusy)
            }
            if controller.isBusy {
                ProgressView().controlSize(.small)
            }
            Spacer()
            Button("Show QR / code") {
                Task { await controller.loadConnectionString() }
                showQR = true
            }
        }
        .popover(isPresented: $showQR) {
            qrPopoverContent
        }
    }

    @ViewBuilder
    private var qrPopoverContent: some View {
        VStack(spacing: 10) {
            if let connectionString = controller.connectionString {
                QRCodeView(text: connectionString)
                    .frame(width: 200, height: 200)
                Text(connectionString)
                    .font(.system(.caption, design: .monospaced))
                    .textSelection(.enabled)
                    .frame(width: 260)
                Button("Copy connection string") { controller.copyConnectionStringToPasteboard() }
            } else if let error = controller.lastError {
                Text(error).font(.callout).foregroundStyle(.secondary).frame(width: 240)
            } else {
                ProgressView().frame(width: 200, height: 200)
            }
        }
        .padding(16)
    }

    private var statusLine: some View {
        Group {
            switch controller.state {
            case .running(let onion):
                Text(onion).font(.system(.caption, design: .monospaced)).textSelection(.enabled)
            case .starting:
                Text("Starting — waiting for Tor to publish (usually 10-30s)…").font(.caption)
            case .stopped:
                Text("Stopped").font(.caption)
            default:
                EmptyView()
            }
        }
    }

    private var folderRow: some View {
        HStack {
            Button("Change folder…") { controller.chooseServerFolder() }
                .buttonStyle(.plain)
                .font(.caption)
            Spacer()
            Button("Open log") { controller.revealLogInFinder() }
                .buttonStyle(.plain)
                .font(.caption)
        }
    }

    private static func queueSummary(_ queue: RelayQueueSnapshot) -> String {
        if queue.queued == 0 { return "Queue empty — everything sent has been collected" }
        let messages = queue.queued == 1 ? "1 message" : "\(queue.queued) messages"
        let conversations = queue.tags == 1 ? "1 conversation" : "\(queue.tags) conversations"
        let oldest = queue.oldestAgeMs.map { ", oldest waiting \(Self.formatDuration($0))" } ?? ""
        return "\(messages) waiting across \(conversations)\(oldest)"
    }

    /// Mirrors `relayEventLog.ts`'s `formatDuration` (hours/minutes/seconds, largest unit only
    /// down to the next) closely enough for this display purpose.
    private static func formatDuration(_ ms: Double) -> String {
        let totalSeconds = Int(ms / 1000)
        if totalSeconds < 60 { return "\(totalSeconds)s" }
        let minutes = totalSeconds / 60
        if minutes < 60 { return "\(minutes)m \(totalSeconds % 60)s" }
        let hours = minutes / 60
        return "\(hours)h \(minutes % 60)m"
    }
}
