import SwiftUI
import UIKit

struct ChatView: View {
    let viewModel: ChatViewModel
    @ObservedObject var messageStore: InMemoryMessageStore
    /// Only used to drive `TorStatusLight` — passed in rather than read off `AppEnvironment`
    /// because the light has to observe it directly to update; see that view's doc comment.
    @ObservedObject var torController: TorController
    @Environment(\.dismiss) private var dismiss

    @State private var inputText = ""
    @State private var showRevokeConfirm = false
    @State private var showWechselSheet = false
    @State private var wechselRelayText = ""
    @State private var attachmentError: String?
    @State private var activeCover: ActiveCover?

    /// Both full-screen presentations go through ONE `fullScreenCover`, driven by this. Stacking
    /// two `.fullScreenCover` modifiers on the same view is a well-known SwiftUI trap — only one
    /// of them reliably takes effect — so the camera and the photo viewer share a single slot,
    /// which also makes "these two can never be open at once" true by construction.
    private enum ActiveCover: Identifiable {
        case camera
        case photo(messageId: String, image: UIImage)

        var id: String {
            switch self {
            case .camera: return "camera"
            // Keyed by message id, so tapping a different photo is a different presentation.
            case .photo(let messageId, _): return "photo-\(messageId)"
            }
        }
    }

    private var messages: [RamMessage] { messageStore.messagesByContact[viewModel.contact.id] ?? [] }

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 8) {
                        ForEach(messages) { message in
                            messageBubble(message)
                                .id(message.id)
                        }
                    }
                    .padding()
                }
                .onChange(of: messages.count) { _ in
                    if let last = messages.last {
                        withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                    }
                }
            }

            Divider()

            HStack {
                // Hidden rather than disabled where there's no camera at all (Simulator): a
                // permanently greyed-out button just raises a question it can't answer.
                if CameraPicker.isAvailable {
                    Button {
                        activeCover = .camera
                    } label: {
                        Image(systemName: "camera.fill").font(.title3)
                    }
                    .accessibilityLabel("Take a photo")
                }
                TextField("Message…", text: $inputText, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(1...4)
                Button {
                    viewModel.send(text: inputText)
                    inputText = ""
                } label: {
                    Image(systemName: "arrow.up.circle.fill").font(.title2)
                }
                .disabled(inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .padding(8)
        }
        .fullScreenCover(item: $activeCover) { cover in
            switch cover {
            case .camera:
                CameraPicker(
                    onCaptured: { image in
                        activeCover = nil
                        // Re-encoding (EXIF strip + downscale) happens inside sendImage; any
                        // problem comes back as a message to show rather than failing silently.
                        attachmentError = viewModel.sendImage(image)
                    },
                    onCancelled: { activeCover = nil }
                )
                .ignoresSafeArea()
            case .photo(_, let image):
                FullscreenImageView(image: image) { activeCover = nil }
            }
        }
        .alert("Couldn't send photo", isPresented: Binding(get: { attachmentError != nil }, set: { if !$0 { attachmentError = nil } })) {
            Button("OK") { attachmentError = nil }
        } message: {
            Text(attachmentError ?? "")
        }
        .navigationTitle(viewModel.contact.displayName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            // Trailing, same corner as every other screen — see TorStatusLight's doc comment.
            // It stays visible exactly where "my message is stuck" gets noticed, which is the
            // whole reason for having it.
            ToolbarItem(placement: .navigationBarTrailing) {
                TorStatusLight(torController: torController)
            }
            ToolbarItem(placement: .navigationBarTrailing) {
                Menu {
                    Button {
                        wechselRelayText = viewModel.contact.myRelayConnectionStrings.first ?? ""
                        showWechselSheet = true
                    } label: {
                        Label("Rotate my identity (Wechsel)", systemImage: "arrow.triangle.2.circlepath")
                    }
                    Button(role: .destructive) {
                        showRevokeConfirm = true
                    } label: {
                        Label("Delete chat", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .confirmationDialog("Delete this chat?", isPresented: $showRevokeConfirm, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                viewModel.revoke()
                dismiss()
            }
        }
        .sheet(isPresented: $showWechselSheet) {
            wechselSheet
        }
    }

    private var wechselSheet: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Rotates your wire tag towards \(viewModel.contact.displayName), so a passive observer correlating old traffic can't follow the conversation forward. Optionally point them at a different relay at the same time.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                Section("Relay (optional — leave as-is to keep the current one)") {
                    TextField("unpruuf-relay:v1:...", text: $wechselRelayText, axis: .vertical)
                        .font(.system(.footnote, design: .monospaced))
                }
            }
            .navigationTitle("Wechsel")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Rotate") {
                        let changed = wechselRelayText != (viewModel.contact.myRelayConnectionStrings.first ?? "")
                        viewModel.wechsel(newRelayConnectionString: changed ? wechselRelayText : nil)
                        showWechselSheet = false
                    }
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { showWechselSheet = false }
                }
            }
        }
    }

    @ViewBuilder
    private func messageBubble(_ message: RamMessage) -> some View {
        HStack {
            if message.isOutgoing { Spacer(minLength: 40) }
            VStack(alignment: message.isOutgoing ? .trailing : .leading, spacing: 2) {
                // Images render as the actual picture. Before this, a received photo showed only
                // "🖼 Photo.jpg" — the bytes arrived and were decrypted correctly, but there was
                // no way to look at them.
                if message.type == .image, let uiImage = UIImage(data: message.content) {
                    Image(uiImage: uiImage)
                        .resizable()
                        .scaledToFit()
                        .frame(maxWidth: 220, maxHeight: 280)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                        .onTapGesture {
                            activeCover = .photo(messageId: message.id, image: uiImage)
                        }
                        .accessibilityLabel(message.isOutgoing ? "Photo you sent" : "Photo you received")
                } else {
                    Text(viewModel.displayText(for: message))
                        .padding(10)
                        .background(message.isOutgoing ? Color.accentColor.opacity(0.85) : Color(.secondarySystemBackground))
                        .foregroundStyle(message.isOutgoing ? .white : .primary)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                if message.isOutgoing {
                    // A message that never even reached the delivery queue shows why instead of
                    // an indefinite "Sending…" — see `RelayService.sendMessage`'s catch and
                    // `RamMessage.failureReason`.
                    Text(message.failureReason ?? (message.delivered ? "Delivered" : "Sending…"))
                        .font(.caption2)
                        .foregroundStyle(message.failureReason != nil ? AnyShapeStyle(.orange) : AnyShapeStyle(.secondary))
                }
            }
            if !message.isOutgoing { Spacer(minLength: 40) }
        }
    }
}
