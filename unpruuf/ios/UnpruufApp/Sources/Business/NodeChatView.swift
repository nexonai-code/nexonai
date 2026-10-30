import SwiftUI
import UnpruufCore

/// A Node-Mesh chat. Messages stay in RAM like in every other edition.
struct NodeChatView: View {
    let env: AppEnvironment
    let contactId: String
    @ObservedObject private var messageStore: InMemoryMessageStore
    @State private var inputText = ""
    @State private var lifetime = MessageTtl.defaultHours
    @State private var showCamera = false
    @State private var photo: PhotoCover?
    @State private var attachmentError: String?

    private struct PhotoCover: Identifiable {
        let id: String
        let image: UIImage
    }

    init(env: AppEnvironment, contactId: String) {
        self.env = env
        self.contactId = contactId
        self.messageStore = env.messageStore
    }

    private var contact: NodeMeshContact? { env.nodeMeshContacts.contact(id: contactId) }
    private var messages: [RamMessage] { messageStore.messagesByContact[contactId] ?? [] }

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 8) {
                        ForEach(messages) { message in
                            bubble(message).id(message.id)
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
            if let attachmentError {
                Text(attachmentError).font(.footnote).foregroundStyle(.red)
            }
            Divider()
            HStack {
                if CameraPicker.isAvailable {
                    Button { showCamera = true } label: {
                        Image(systemName: "camera.fill").font(.title3)
                    }
                    .accessibilityLabel(L.t("Fă o fotografie", "Take a photo"))
                }
                TextField(L.t("Mesaj…", "Message…"), text: $inputText, axis: .vertical)
                    .noKeyboardLearning()
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(1...4)
                Button(action: send) {
                    Image(systemName: "arrow.up.circle.fill").font(.title2)
                }
                .disabled(inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityLabel(L.t("Trimite", "Send"))
            }
            .padding(8)
        }
        .navigationTitle(contact?.displayName ?? "")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Menu {
                    Picker(L.t("Durata de viață", "Lifetime"), selection: $lifetime) {
                        ForEach(MessageTtl.stepsHours, id: \.self) { Text("\($0) h").tag($0) }
                    }
                } label: {
                    Image(systemName: "clock")
                }
                .accessibilityLabel(L.t("Durata de viață a mesajelor", "Message lifetime"))
                NavigationLink {
                    NodeContactDetailView(store: env.nodeMeshContacts, engine: env.nodeMeshEngine, contactId: contactId)
                } label: {
                    Image(systemName: "info.circle")
                }
                .accessibilityLabel(L.t("Detalii contact", "Contact details"))
            }
        }
        .onAppear {
            lifetime = MessageTtl.normalize(contact?.messageTtlHours)
            messageStore.clearUnread(contactId)
        }
        .onChange(of: messages.count) { _ in messageStore.clearUnread(contactId) }
        .onChange(of: lifetime) { hours in
            env.nodeMeshContacts.update(id: contactId) { $0.messageTtlHours = hours }
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker(onCaptured: { image in
                showCamera = false
                sendImage(image)
            }, onCancelled: { showCamera = false })
            .ignoresSafeArea()
        }
        .fullScreenCover(item: $photo) { cover in
            FullscreenImageView(image: cover.image) { photo = nil }
        }
    }

    private func send() {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        inputText = ""
        let id = UUID().uuidString
        messageStore.addMessage(contactId, RamMessage(id: id, senderId: "self", content: Data(text.utf8),
                                                      timestamp: Date(), isOutgoing: true, type: .text))
        env.nodeMeshEngine.send(contactId: contactId, plaintext: MessagePayload.encodeText(text), messageId: id)
    }

    private func sendImage(_ image: UIImage) {
        guard let jpeg = ImagePreparer.prepareJPEG(from: image),
              let payload = try? MessagePayload.encodeAttachment(name: "Photo.jpg", bytes: jpeg, isImage: true) else {
            attachmentError = L.t("Fotografia nu a putut fi pregătită.", "Couldn't prepare that photo.")
            return
        }
        attachmentError = nil
        let id = UUID().uuidString
        messageStore.addMessage(contactId, RamMessage(id: id, senderId: "self", content: jpeg, timestamp: Date(),
                                                      isOutgoing: true, type: .image, fileName: "Photo.jpg"))
        env.nodeMeshEngine.send(contactId: contactId, plaintext: payload, messageId: id)
    }

    @ViewBuilder
    private func bubble(_ message: RamMessage) -> some View {
        HStack {
            if message.isOutgoing { Spacer(minLength: 40) }
            VStack(alignment: message.isOutgoing ? .trailing : .leading, spacing: 2) {
                if message.type == .image, SafeImage.isDecodable(message.content) {
                    ChatImage(data: message.content) { image in
                        photo = PhotoCover(id: message.id, image: image)
                    }
                } else {
                    Text(text(of: message))
                        .padding(10)
                        .background(message.isOutgoing ? Color.accentColor.opacity(0.85) : Color(.secondarySystemBackground))
                        .foregroundStyle(message.isOutgoing ? .white : .primary)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                if message.isOutgoing {
                    Text(message.failureReason ?? (message.delivered ? L.t("Trimis", "Sent") : L.t("Se trimite…", "Sending…")))
                        .font(.caption2)
                        .foregroundStyle(message.failureReason != nil ? AnyShapeStyle(.orange) : AnyShapeStyle(.secondary))
                }
            }
            if !message.isOutgoing { Spacer(minLength: 40) }
        }
    }

    private func text(of message: RamMessage) -> String {
        switch message.type {
        case .text: return String(data: message.content, encoding: .utf8) ?? ""
        case .file: return "📎 \(message.fileName ?? "") (\(message.content.count / 1024) KB)"
        case .image: return "🖼 \(message.fileName ?? "")"
        }
    }
}
