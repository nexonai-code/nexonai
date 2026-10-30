import SwiftUI
import UnpruufCore

/// Business needs a licence, as on Android. Debug builds skip the gate, same as Android: a code
/// binds to its first install, so every fresh test device would need its own.
struct BusinessGateView: View {
    let env: AppEnvironment
    @State private var licensed: Bool

    init(env: AppEnvironment) {
        self.env = env
        #if DEBUG
        _licensed = State(initialValue: true)
        #else
        _licensed = State(initialValue: env.licenseStore.isLicensed)
        #endif
    }

    var body: some View {
        if licensed {
            BusinessHomeView(env: env)
        } else {
            NavigationStack {
                LicenseView(store: env.licenseStore) { licensed = env.licenseStore.isLicensed }
            }
        }
    }
}

/// Activation and status. Also reached from the home screen for a renewal.
struct LicenseView: View {
    let store: AppLicenseStore
    var onChange: () -> Void = {}
    @State private var code = ""
    @State private var message: String?
    @State private var state: AppLicense.State = .notConfigured

    var body: some View {
        Form {
            Section {
                Text(status).font(.footnote)
            }
            if let serial {
                Section(String(localized: "License")) { Text(serial).font(.footnote) }
            }
            Section(String(localized: "License code")) {
                TextEditor(text: $code)
                    .frame(minHeight: 90)
                    .font(.system(.footnote, design: .monospaced))
                    .codeInput()
                Button(String(localized: "Activate"), action: activate)
                    .disabled(code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            if let message {
                Text(message).foregroundStyle(.red)
            }
        }
        .navigationTitle(String(localized: "License"))
        .onAppear { state = store.state }
    }

    private func date(_ ms: Int64) -> String {
        Date(timeIntervalSince1970: TimeInterval(ms) / 1000).formatted(date: .abbreviated, time: .omitted)
    }

    private var serial: String? {
        switch state {
        case .valid(let info, _), .expiringSoon(let info, _), .expired(let info):
            return String(localized: "Serial \(info.serial) • \(info.customer)")
        case .notConfigured, .invalid:
            return nil
        }
    }

    private var status: String {
        switch state {
        case .notConfigured:
            return String(localized: "unpruuf Business needs a license code to run. Paste the code you received from your reseller below.")
        case .valid(let info, _):
            return String(localized: "Active — expires \(date(info.expiresAtMs))")
        case .expiringSoon(_, let days):
            return String(localized: "Expires in \(days) days — renew soon")
        case .expired(let info):
            return String(localized: "The license expired on \(date(info.expiresAtMs)). Enter a renewal code to continue.")
        case .invalid:
            return String(localized: "Enter a valid license code to continue.")
        }
    }

    private func activate() {
        switch store.apply(code: code) {
        case .activated:
            code = ""
            message = nil
        case .invalid:
            message = String(localized: "This license code isn't valid.")
        case .otherDevice:
            message = String(localized: "This license is already activated on a different device.")
        }
        state = store.state
        onChange()
    }
}
