import Combine
import Foundation
import UnpruufCore

/// Manual composition root — the app is small enough that a DI framework (this project's Android
/// side uses Hilt) would be pure overhead here. Owns every long-lived service and is handed down
/// via `@EnvironmentObject`/explicit init injection into the view models.
@MainActor
final class AppEnvironment: ObservableObject {
    let keychain: KeychainStore
    let identity: Identity
    let contactStore: ContactStore
    let messageStore = InMemoryMessageStore()
    let torController = TorController()
    let relayService: RelayService
    /// unpruuf Compliance only (see `Edition`): the reporter's cases and their relay traffic.
    let caseStore: CaseStore
    let complianceService: ComplianceService
    let pinManager: PinManager
    let appLockManager = AppLockManager()
    let privacyShield = PrivacyShield()
    let relayPoolManager: RelayPoolManager
    let archivedRelayStore: ArchivedRelayStore
    let nodeMeshStore: NodeMeshStore
    let nodeMeshContacts: NodeMeshContactStore
    let nodeMeshClient: NodeMeshClient
    let licenseStore: AppLicenseStore
    lazy var nodeMeshEngine = makeNodeMeshEngine()

    /// The relay I currently advertise to new contacts (and, by default, use when Wechsel-ing an
    /// existing one) — set once in Settings. Contacts can still each end up pointed at a different
    /// relay over time (per-contact `myRelayConnectionString`, see `Contact`), matching
    /// `CROSS_PLATFORM_PLAN.md`'s per-contact node model; this is just the default new pairings start from.
    @Published var defaultRelayConnectionString: String {
        didSet { keychain.setString(Self.defaultRelayKey, defaultRelayConnectionString) }
    }

    /// Backup relay(s) advertised alongside `defaultRelayConnectionString` in new pairing QRs —
    /// either hand-entered in Settings or populated from an imported, signed relay-pool manifest
    /// (see `RelayPoolManager`). Stored as one `;`-joined string, same trick used for a contact's
    /// own relay pool (`Contact.theirRelayConnectionStrings`) and for the wire format itself.
    @Published var extraRelayConnectionStrings: [String] {
        didSet {
            keychain.setString(Self.extraRelaysKey, RelayConnectionString.buildList(extraRelayConnectionStrings))
        }
    }

    /// Purely cosmetic, local-only names for the two "my relay" slots (e.g. "Mac at home",
    /// "Windows VM backup") — never sent anywhere, never part of the wire format. Their only job
    /// is helping the operator tell two of their own relays apart in Settings, so a mix-up doesn't
    /// happen when one of them is later decommissioned. Persisted separately from the connection
    /// strings themselves so relabeling never touches what's actually advertised to contacts.
    @Published var myRelayLabel: String {
        didSet { UserDefaults.standard.set(myRelayLabel, forKey: "my_relay_label") }
    }
    @Published var backupRelayLabel: String {
        didSet { UserDefaults.standard.set(backupRelayLabel, forKey: "backup_relay_label") }
    }

    /// The full pool a new pairing QR advertises: my primary relay first, then backups, deduped
    /// and capped at `RelayConnectionString.maxPoolSize` — never more than the QR format itself
    /// allows, so callers don't have to re-check that invariant.
    var myRelayPool: [String] {
        var seen = Set<String>()
        return ([defaultRelayConnectionString] + extraRelayConnectionStrings)
            .filter { !$0.isEmpty && seen.insert($0).inserted }
            .prefix(RelayConnectionString.maxPoolSize)
            .map { $0 }
    }

    /// Saves one of my own relay slots (0 = primary, 1 = backup) from the Settings "My relays"
    /// list. `index` beyond 1 is a caller bug (`RelayConnectionString.maxPoolSize` is 2) and is
    /// ignored rather than crashing — the list UI never offers a third row in the first place.
    func saveMyRelay(at index: Int, address: String, label: String) {
        switch index {
        case 0:
            defaultRelayConnectionString = address
            myRelayLabel = label
        case 1:
            extraRelayConnectionStrings = address.isEmpty ? [] : [address]
            backupRelayLabel = label
        default:
            break
        }
    }

    /// Deletes one of my own relay slots. Deleting the primary while a backup exists promotes the
    /// backup into the primary slot (label included) instead of leaving an empty primary next to
    /// a filled backup — the list should behave like an ordered list, not develop a gap.
    func deleteMyRelay(at index: Int) {
        switch index {
        case 0:
            if let promoted = extraRelayConnectionStrings.first {
                defaultRelayConnectionString = promoted
                myRelayLabel = backupRelayLabel
                extraRelayConnectionStrings = []
                backupRelayLabel = ""
            } else {
                defaultRelayConnectionString = ""
                myRelayLabel = ""
            }
        case 1:
            extraRelayConnectionStrings = []
            backupRelayLabel = ""
        default:
            break
        }
    }

    // A relay string carries its token, so these live in the Keychain, not in `UserDefaults`.
    private static let defaultRelayKey = "default_relay_connection_string"
    private static let extraRelaysKey = "extra_relay_connection_strings"

    init() {
        BackupExclusion.apply()
        let keychain = KeychainStore()
        self.keychain = keychain
        keychain.migrateFromDefaults(Self.defaultRelayKey)
        keychain.migrateFromDefaults(Self.extraRelaysKey)
        self.identity = Identity(store: keychain)
        self.contactStore = ContactStore(keychain: keychain)
        self.pinManager = PinManager(keychain: keychain)
        self.relayPoolManager = RelayPoolManager(keychain: keychain)
        self.archivedRelayStore = ArchivedRelayStore(keychain: keychain)
        self.nodeMeshStore = NodeMeshStore(store: KeychainStore.nodeMesh())
        self.nodeMeshContacts = NodeMeshContactStore(store: KeychainStore.nodeMesh())
        self.licenseStore = AppLicenseStore(store: keychain, edition: NodeMeshEdition.pro)
        let torController = self.torController
        self.nodeMeshClient = NodeMeshClient(transport: TorNodeTransport(socksPort: { await torController.socksPort }))
        self.defaultRelayConnectionString = keychain.getString(Self.defaultRelayKey) ?? ""
        self.extraRelayConnectionStrings = RelayConnectionString.parseList(
            keychain.getString(Self.extraRelaysKey) ?? ""
        )
        self.myRelayLabel = UserDefaults.standard.string(forKey: "my_relay_label") ?? ""
        self.backupRelayLabel = UserDefaults.standard.string(forKey: "backup_relay_label") ?? ""
        self.relayService = RelayService(
            identity: identity, contactStore: contactStore, messageStore: messageStore,
            keychain: keychain, torController: torController
        )
        let caseStore = CaseStore(keychain: keychain)
        self.caseStore = caseStore
        self.complianceService = ComplianceService(
            caseStore: caseStore, messageStore: messageStore, keychain: keychain, torController: torController
        )
    }

    private func makeNodeMeshEngine() -> NodeMeshEngine {
        let keychain = self.keychain
        let torController = self.torController
        let messages = self.messageStore
        let secrets = KeychainStore.nodeMesh()
        let engine = NodeMeshEngine(
            contacts: nodeMeshContacts, nodes: nodeMeshStore, client: nodeMeshClient,
            ratchets: .init(load: { keychain.loadRatchetState(contactId: $0) },
                            save: { keychain.saveRatchetState(contactId: $0, state: $1) },
                            delete: { keychain.deleteRatchetState(contactId: $0) }),
            deviceSecret: Self.torIsolationSecret(in: secrets),
            isReady: { torController.isReady }
        )
        engine.events.onMessage = { contactId, content in
            let message: RamMessage
            switch content {
            case .text(let text):
                message = RamMessage(id: UUID().uuidString, senderId: contactId, content: Data(text.utf8),
                                     timestamp: Date(), isOutgoing: false, type: .text)
            case .attachment(let name, let bytes, let isImage):
                message = RamMessage(id: UUID().uuidString, senderId: contactId, content: bytes, timestamp: Date(),
                                     isOutgoing: false, type: isImage ? .image : .file, fileName: name)
            }
            messages.addMessage(contactId, message)
            messages.markUnread(contactId)
        }
        engine.events.onDelivered = { messages.markDelivered(contactId: $0, messageId: $1) }
        engine.events.onSendFailed = { contactId, messageId in
            guard let messageId else { return }
            messages.markFailed(contactId: contactId, messageId: messageId,
                                reason: L.t("Așteaptă mai întâi un mesaj de la acest contact.", "Wait for a first message from this contact."))
        }
        engine.events.onRevoke = { messages.zeroizeContact($0) }
        engine.events.onContactRemoved = { messages.zeroizeContact($0) }
        return engine
    }

    /// Keeps the SOCKS user names of this device apart from any other's. It never leaves the phone.
    private static func torIsolationSecret(in store: KeychainStore) -> Data {
        if let existing = store.getData("tor_isolation_secret") { return existing }
        var secret = Data(count: 32)
        _ = secret.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, 32, $0.baseAddress!) }
        store.setData("tor_isolation_secret", secret)
        return secret
    }

    /// Starts Tor + the relay poll loop — call when the app becomes active (foreground-scoped Tor,
    /// per `CROSS_PLATFORM_PLAN.md` §6).
    func start() {
        torController.start()
        if Edition.isCompliance {
            complianceService.startPolling()
        } else if Edition.isBusiness {
            nodeMeshEngine.start()
        } else {
            relayService.startPolling()
        }
    }

    /// Called when the app leaves the foreground. Stops the network side (Tor, relay polling —
    /// unchanged) AND wipes RAM messages, mirroring the Android app's background/screen-lock wipe
    /// (`ProcessLifecycleOwner` `onStop` / `ScreenLockReceiver`, both calling
    /// `InMemoryMessageStore.zeroizeAll()`). Deliberately calls `messageStore.wipeAll()` here, NOT
    /// this class's own `wipeAll()` below — that one also deletes contacts and identity keys, the
    /// PANIC-PIN-equivalent action, not what a routine background transition should ever do.
    func stop() {
        relayService.stopPolling()
        complianceService.stopPolling()
        if Edition.isBusiness { nodeMeshEngine.stop() }
        torController.stop()
        messageStore.wipeAll()
    }

    /// Nuclear local wipe — everything including this device's own identity keys and the PIN
    /// itself (`keychain.removeAll()` clears the whole Keychain service bucket, not just
    /// contacts/ratchet state). NOT what the panic PIN uses — see `wipeContactsAndMessages()`
    /// below for that. Not currently wired to any UI; kept for a possible future "reset this
    /// device entirely" action, distinct from the panic-PIN's "erase relationships, keep the
    /// device usable" behavior.
    func wipeAll() {
        wipeContactsAndMessages()
        keychain.removeAll()
    }

    /// What the panic PIN actually triggers — port of Android's `LockViewModel.wipeEverything()`,
    /// and the one place that defines the panic wipe set. Deliberately narrower than `wipeAll()`
    /// above: wipes contacts (and their Double Ratchet session state), RAM messages, the send
    /// queue and half-received chunks, this device's relay setup, the imported relay pool, kept
    /// relay addresses, own nodes with their owner secrets, Node-Mesh contacts with an open pairing code, and the Compliance cases, but leaves this device's own
    /// identity (`userId`/`myMessageKey`/X25519 ratchet keypair) and the PIN/panic-PIN hashes
    /// themselves untouched — same as Android, so a panicked user's device still works and can
    /// still show a QR to re-pair afterward, rather than resetting to a broken, identity-less
    /// state.
    func wipeContactsAndMessages() {
        relayService.wipeRuntimeState()
        nodeMeshEngine.wipe()
        messageStore.wipeAll()
        contactStore.wipeAll()
        // Compliance: the cases, their keys and the remembered organisation QR go too.
        complianceService.wipeEverything()
        keychain.removeAllRatchetStates()
        defaultRelayConnectionString = ""
        extraRelayConnectionStrings = []
        myRelayLabel = ""
        backupRelayLabel = ""
        keychain.removeData(Self.defaultRelayKey)
        keychain.removeData(Self.extraRelaysKey)
        UserDefaults.standard.removeObject(forKey: "my_relay_label")
        UserDefaults.standard.removeObject(forKey: "backup_relay_label")
        relayPoolManager.wipe()
        archivedRelayStore.wipeAll()
        nodeMeshStore.wipe()
        nodeMeshContacts.wipe()
    }
}
