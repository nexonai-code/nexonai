import SwiftUI

/// Compliance home. First start (no organisation yet): straight to scanning the organisation's QR.
/// After that only "My cases" and a "+" for a new case — no contacts, no messenger vocabulary.
struct CasesHomeView: View {
    @ObservedObject var env: AppEnvironment
    @ObservedObject var caseStore: CaseStore
    @ObservedObject var messageStore: InMemoryMessageStore
    @ObservedObject var torController: TorController

    @State private var path: [String] = []
    @State private var showScanner = false
    @State private var pasted = ""
    @State private var errorText: String?
    @State private var showSettings = false

    init(env: AppEnvironment) {
        self.env = env
        self.caseStore = env.caseStore
        self.messageStore = env.messageStore
        self.torController = env.torController
    }

    var body: some View {
        NavigationStack(path: $path) {
            Group {
                if caseStore.organization == nil {
                    onboarding
                } else if caseStore.cases.isEmpty {
                    emptyState
                } else {
                    caseList
                }
            }
            .navigationTitle(caseStore.organization == nil ? "unpruuf" : L.t("Cazurile mele", "My cases"))
            .navigationDestination(for: String.self) { caseId in
                CaseDetailView(env: env, caseId: caseId)
            }
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Menu {
                        Button(L.t("Setări", "Settings")) { showSettings = true }
                        if caseStore.organization != nil {
                            Button(L.t("Scanează altă organizație", "Scan another organisation")) {
                                caseStore.forgetOrganization()
                            }
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
            .safeAreaInset(edge: .bottom) {
                if caseStore.organization != nil { newCaseButton }
            }
            .sheet(isPresented: $showScanner) { scannerSheet }
            .sheet(isPresented: $showSettings) { ComplianceSettingsView(env: env) }
        }
    }

    // MARK: Onboarding

    private var onboarding: some View {
        ScrollView {
            VStack(spacing: 18) {
                Image(systemName: "lock.shield")
                    .font(.system(size: 56))
                    .foregroundStyle(.tint)
                    .padding(.top, 32)
                Text(L.t("Raportează în siguranță", "Report safely"))
                    .font(.title2.bold())
                Text(L.t(
                    "Scanează codul QR al organizației tale. Faci asta o singură dată — fără nume, fără număr de telefon, fără cont.",
                    "Scan your organisation's QR code. You only do this once — no name, no phone number, no account."
                ))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

                if QRScanner.isSupported {
                    Button {
                        errorText = nil
                        showScanner = true
                    } label: {
                        Label(L.t("Scanează codul QR", "Scan QR code"), systemImage: "qrcode.viewfinder")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                }

                if let errorText {
                    Text(errorText).font(.footnote).foregroundStyle(.red).multilineTextAlignment(.center)
                }

                Divider().padding(.vertical, 4)

                TextField(L.t("…sau lipește codul", "…or paste the code"), text: $pasted, axis: .vertical)
                    .lineLimit(2...5)
                    .textFieldStyle(.roundedBorder)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                Button(L.t("Conectează", "Connect")) { connect(pasted); pasted = "" }
                    .buttonStyle(.bordered)
                    .disabled(pasted.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .padding(24)
        }
    }

    private var scannerSheet: some View {
        NavigationStack {
            QRScannerView { value in
                showScanner = false
                connect(value)
            }
            .ignoresSafeArea()
            .navigationTitle(L.t("Scanează codul QR", "Scan QR code"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L.t("Anulează", "Cancel")) { showScanner = false }
                }
            }
        }
    }

    private func connect(_ raw: String) {
        switch env.complianceService.connect(rawQR: raw) {
        case .ok(let caseId):
            errorText = nil
            path = [caseId]
        case .unreadable:
            errorText = L.t("Acesta nu este un cod al unui oficiu de raportare.", "This is not a reporting-office code.")
        case .notAnOffice:
            errorText = L.t(
                "Acest cod aparține altei aplicații, nu unui oficiu de raportare.",
                "This code belongs to another app, not to a reporting office."
            )
        case .noRelay:
            errorText = L.t(
                "Adresa de conectare din cod pare invalidă. Cere oficiului de raportare un cod nou.",
                "The code's connection address looks invalid. Ask the reporting office for a new code."
            )
        }
    }

    // MARK: Cases

    private var emptyState: some View {
        VStack(spacing: 8) {
            Text(L.t("Niciun caz încă.", "No case yet.")).font(.headline)
            Text(L.t(
                "Începe un caz nou cu butonul de mai jos. Fiecare caz este separat: oficiul de raportare nu poate afla că două cazuri vin de pe același telefon.",
                "Start a new case with the button below. Each case is separate: the reporting office cannot tell that two cases come from the same phone."
            ))
            .font(.footnote)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
        }
        .padding(32)
    }

    private var caseList: some View {
        List(caseStore.sortedCases) { reportCase in
            NavigationLink(value: reportCase.id) {
                CaseRow(reportCase: reportCase, unread: messageStore.unreadContactIds.contains(reportCase.id))
            }
        }
        .listStyle(.insetGrouped)
    }

    private var newCaseButton: some View {
        Button {
            if let id = env.complianceService.openNewCase() { path = [id] }
        } label: {
            Label(L.t("Caz nou", "New case"), systemImage: "plus")
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .padding(.horizontal, 24)
        .padding(.vertical, 8)
        .background(.bar)
    }
}

private struct CaseRow: View {
    let reportCase: ReportCase
    let unread: Bool

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                if let number = reportCase.caseNumber {
                    Text(number).font(.system(.headline, design: .monospaced))
                    Text(CaseText.statusLabel(reportCase.caseStatus)).font(.subheadline).foregroundStyle(.tint)
                } else {
                    Text(L.t("Caz nou · numărul urmează", "New case · number follows")).font(.headline)
                }
                Text(L.t("Deschis la ", "Opened ") + CaseText.day(reportCase.caseOpenedAt ?? reportCase.addedAt))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if unread {
                Circle().fill(Color.accentColor).frame(width: 10, height: 10)
            }
        }
        .padding(.vertical, 4)
    }
}

enum CaseText {
    static func statusLabel(_ status: String?) -> String {
        switch status {
        case "in_progress": return L.t("În analiză", "Under review")
        case "closed": return L.t("Închis", "Closed")
        default: return L.t("Primită și confirmată", "Received and confirmed")
        }
    }

    static func day(_ date: Date?) -> String {
        guard let date else { return "—" }
        return date.formatted(date: .abbreviated, time: .omitted)
    }
}
