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
    let pinManager: PinManager
    let appLockManager = AppLockManager()
    let relayPoolManager = RelayPoolManager()
    let archivedRelayStore = ArchivedRelayStore()

    /// The relay I currently advertise to new contacts (and, by default, use when Wechsel-ing an
    /// existing one) — set once in Settings. Contacts can still each end up pointed at a different
    /// relay over time (per-contact `myRelayConnectionString`, see `Contact`), matching
    /// `CROSS_PLATFORM_PLAN.md`'s per-contact node model; this is just the default new pairings start from.
    @Published var defaultRelayConnectionString: String {
        didSet { UserDefaults.standard.set(defaultRelayConnectionString, forKey: "default_relay_connection_string") }
    }

    /// Backup relay(s) advertised alongside `defaultRelayConnectionString` in new pairing QRs —
    /// either hand-entered in Settings or populated from an imported, signed relay-pool manifest
    /// (see `RelayPoolManager`). Stored as one `;`-joined string, same trick used for a contact's
    /// own relay pool (`Contact.theirRelayConnectionStrings`) and for the wire format itself.
    @Published var extraRelayConnectionStrings: [String] {
        didSet {
            UserDefaults.standard.set(
                RelayConnectionString.buildList(extraRelayConnectionStrings),
                forKey: "extra_relay_connection_strings"
            )
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

    init() {
        let keychain = KeychainStore()
        self.keychain = keychain
        self.identity = Identity(store: keychain)
        self.contactStore = ContactStore(keychain: keychain)
        self.pinManager = PinManager(keychain: keychain)
        self.defaultRelayConnectionString = UserDefaults.standard.string(forKey: "default_relay_connection_string") ?? ""
        self.extraRelayConnectionStrings = RelayConnectionString.parseList(
            UserDefaults.standard.string(forKey: "extra_relay_connection_strings") ?? ""
        )
        self.myRelayLabel = UserDefaults.standard.string(forKey: "my_relay_label") ?? ""
        self.backupRelayLabel = UserDefaults.standard.string(forKey: "backup_relay_label") ?? ""
        self.relayService = RelayService(
            identity: identity, contactStore: contactStore, messageStore: messageStore,
            keychain: keychain, torController: torController
        )
    }

    /// Starts Tor + the relay poll loop — call when the app becomes active (foreground-scoped Tor,
    /// per `CROSS_PLATFORM_PLAN.md` §6).
    func start() {
        torController.start()
        relayService.startPolling()
    }

    /// Called when the app leaves the foreground. Stops the network side (Tor, relay polling —
    /// unchanged) AND wipes RAM messages, mirroring the Android app's background/screen-lock wipe
    /// (`ProcessLifecycleOwner` `onStop` / `ScreenLockReceiver`, both calling
    /// `InMemoryMessageStore.zeroizeAll()`). Deliberately calls `messageStore.wipeAll()` here, NOT
    /// this class's own `wipeAll()` below — that one also deletes contacts and identity keys, the
    /// PANIC-PIN-equivalent action, not what a routine background transition should ever do.
    func stop() {
        relayService.stopPolling()
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
        contactStore.wipeAll()
        messageStore.wipeAll()
        keychain.removeAll()
        UserDefaults.standard.removeObject(forKey: "default_relay_connection_string")
    }

    /// What the panic PIN actually triggers — port of Android's `LockViewModel.wipeEverything()`.
    /// Deliberately narrower than `wipeAll()` above: wipes contacts (and their Double Ratchet
    /// session state, via `ContactStore.wipeAll()`) and RAM messages, but leaves this device's own
    /// identity (`userId`/`myMessageKey`/X25519 ratchet keypair) and the PIN/panic-PIN hashes
    /// themselves untouched — same as Android, so a panicked user's device still works and can
    /// still show a QR to re-pair afterward, rather than resetting to a broken, identity-less
    /// state.
    func wipeContactsAndMessages() {
        messageStore.wipeAll()
        contactStore.wipeAll()
    }
}
