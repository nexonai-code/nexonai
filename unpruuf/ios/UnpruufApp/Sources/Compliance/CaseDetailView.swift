import SwiftUI
import UIKit

/// One case = one screen with two tabs: "Status" (number, progress, deadlines) and "Messages".
/// A brand-new case opens on Messages — the report still has to be written; an existing one on Status.
struct CaseDetailView: View {
    @ObservedObject var env: AppEnvironment
    @ObservedObject var caseStore: CaseStore
    @ObservedObject var messageStore: InMemoryMessageStore
    let caseId: String

    @Environment(\.dismiss) private var dismiss
    @State private var tab: Tab?
    @State private var inputText = ""
    @State private var showRemoveConfirm = false

    enum Tab: Hashable { case status, messages }

    init(env: AppEnvironment, caseId: String) {
        self.env = env
        self.caseStore = env.caseStore
        self.messageStore = env.messageStore
        self.caseId = caseId
    }

    private var reportCase: ReportCase? { caseStore.get(id: caseId) }
    private var messages: [RamMessage] { messageStore.messagesByContact[caseId] ?? [] }
    private var selectedTab: Tab { tab ?? (reportCase?.caseNumber == nil ? .messages : .status) }

    var body: some View {
        VStack(spacing: 0) {
            Picker("", selection: Binding(get: { selectedTab }, set: { tab = $0 })) {
                Text(L.t("Stare", "Status")).tag(Tab.status)
                Text(L.t("Mesaje", "Messages")).tag(Tab.messages)
            }
            .pickerStyle(.segmented)
            .padding([.horizontal, .top])
            .padding(.bottom, 8)

            if selectedTab == .status {
                statusTab
            } else {
                messagesTab
            }
        }
        .navigationTitle(reportCase?.caseNumber ?? L.t("Caz nou", "New case"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(role: .destructive) { showRemoveConfirm = true } label: {
                    Image(systemName: "trash")
                }
            }
        }
        .onAppear { messageStore.clearUnread(caseId) }
        .confirmationDialog(
            L.t("Elimini cazul de pe acest telefon?", "Remove case from this phone?"),
            isPresented: $showRemoveConfirm, titleVisibility: .visible
        ) {
            Button(L.t("Elimină", "Remove"), role: .destructive) {
                env.complianceService.removeCaseFromDevice(id: caseId)
                dismiss()
            }
            Button(L.t("Anulează", "Cancel"), role: .cancel) {}
        } message: {
            Text(L.t(
                "Toate mesajele și cheile acestui caz sunt șterse de pe acest telefon. Oficiul de raportare păstrează cazul. Nu vei mai putea citi răspunsurile la el pe acest telefon.",
                "All messages and keys of this case are deleted from this phone. The reporting office keeps the case. You will no longer be able to read replies to it on this phone."
            ))
        }
    }

    // MARK: Status

    @ViewBuilder
    private var statusTab: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let c = reportCase, let number = c.caseNumber {
                    VStack(alignment: .leading, spacing: 12) {
                        Text(L.t("NUMĂR CAZ", "CASE NUMBER")).font(.caption2).foregroundStyle(.secondary).kerning(1.5)
                        HStack {
                            Text(number).font(.system(size: 28, weight: .bold, design: .monospaced))
                            Spacer()
                            Button {
                                UIPasteboard.general.string = number
                            } label: {
                                Image(systemName: "doc.on.doc")
                            }
                            .accessibilityLabel(L.t("Copiază numărul cazului", "Copy case number"))
                        }
                        Text(CaseText.statusLabel(c.caseStatus))
                            .font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 12).padding(.vertical, 6)
                            .background(Color.accentColor.opacity(0.15), in: Capsule())
                        steps(current: step(for: c.caseStatus))
                        Divider()
                        Text(L.t("Primită la ", "Received on ") + CaseText.day(c.caseOpenedAt))
                        if c.caseStatus != "closed" {
                            Text(L.t("Răspuns până la ", "Feedback due by ") + CaseText.day(c.caseFeedbackDueAt))
                        }
                        if let updated = c.caseUpdatedAt {
                            Text(L.t("Ultima actualizare: ", "Last update: ") + updated.formatted(date: .abbreviated, time: .shortened))
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                    .padding()
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14))
                } else {
                    VStack(alignment: .leading, spacing: 10) {
                        Label(L.t("Sesizarea este în curs de transmitere", "Report on its way"), systemImage: "clock")
                            .font(.headline)
                        Text(L.t(
                            "Sesizarea ta a fost predată. Imediat ce oficiul de raportare confirmă primirea, numărul cazului apare aici. Nu trebuie să faci nimic.",
                            "Your report has been handed over. As soon as the reporting office confirms receipt, your case number appears here. You don't need to do anything."
                        ))
                        ProgressView()
                    }
                    .padding()
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14))
                }
                Text(L.t(
                    "Modificările făcute de oficiul de raportare apar aici automat. Numărul cazului este doar pentru tine: te ajută să te referi la sesizare, nu este necesar pentru autentificare.",
                    "Changes from the reporting office appear here automatically. Your case number is only for you: it helps you refer to your report, it is not needed to log in."
                ))
                .font(.footnote)
                .foregroundStyle(.secondary)
            }
            .padding()
        }
    }

    private func step(for status: String?) -> Int {
        switch status {
        case "in_progress": return 1
        case "closed": return 2
        default: return 0
        }
    }

    private func steps(current: Int) -> some View {
        let labels = [L.t("Primită", "Received"), L.t("Analiză", "Review"), L.t("Închis", "Closed")]
        return HStack(alignment: .top) {
            ForEach(0..<labels.count, id: \.self) { i in
                VStack(spacing: 6) {
                    ZStack {
                        Circle().fill(i <= current ? Color.accentColor : Color(.tertiarySystemFill)).frame(width: 28, height: 28)
                        if i <= current {
                            Image(systemName: "checkmark").font(.caption.bold()).foregroundStyle(.white)
                        }
                    }
                    Text(labels[i]).font(.caption2).foregroundStyle(i <= current ? .primary : .secondary)
                }
                .frame(maxWidth: .infinity)
            }
        }
    }

    // MARK: Messages

    private var messagesTab: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    if messages.isEmpty {
                        Text(L.t(
                            "Scrie sesizarea ta mai jos. Nu include nimic care te-ar putea identifica, dacă nu este necesar.",
                            "Write your report below. Leave out anything that could identify you unless it is needed."
                        ))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(32)
                    }
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
            Divider()
            HStack(alignment: .bottom) {
                TextField(L.t("Mesaj", "Message"), text: $inputText, axis: .vertical)
                    .lineLimit(1...5)
                    .textFieldStyle(.roundedBorder)
                Button {
                    env.complianceService.sendMessage(caseId: caseId, text: inputText)
                    inputText = ""
                } label: {
                    Image(systemName: "arrow.up.circle.fill").font(.system(size: 30))
                }
                .disabled(inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .padding(8)
        }
    }

    @ViewBuilder
    private func bubble(_ message: RamMessage) -> some View {
        let text = message.type == .text
            ? (String(data: message.content, encoding: .utf8) ?? "")
            : "📎 \(message.fileName ?? L.t("fișier", "file"))"
        VStack(alignment: message.isOutgoing ? .trailing : .leading, spacing: 2) {
            Text(text)
                .padding(10)
                .background(
                    message.isOutgoing ? Color.accentColor.opacity(0.2) : Color(.secondarySystemBackground),
                    in: RoundedRectangle(cornerRadius: 14)
                )
            if let reason = message.failureReason {
                Text(reason).font(.caption2).foregroundStyle(.red)
            } else if message.isOutgoing {
                Text(message.delivered ? L.t("trimis", "sent") : L.t("se trimite…", "sending…"))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: message.isOutgoing ? .trailing : .leading)
    }
}
