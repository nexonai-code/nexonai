import UIKit
import UnpruufCore
import XCTest
@testable import UnpruufApp

/// Runs on the Simulator with the app as host: the real Keychain and the real files.
@MainActor
final class LocalProtectionTests: XCTestCase {
    private let relay = "unpruuf-relay:v1:aaaa.onion:token"

    private func contact(_ id: String) -> Contact {
        Contact(
            id: id, displayName: id, messageKeyBase64: Data(count: 32).base64EncodedString(),
            x25519RatchetPublicKeyBase64: Data(count: 32).base64EncodedString(),
            theirRelayConnectionStrings: [relay], myRelayConnectionStrings: [relay]
        )
    }

    private func ratchetState() -> DoubleRatchet.RatchetState {
        DoubleRatchet.RatchetState(
            dhsPrivateKey: Data(count: 32), dhsPublicKey: Data(count: 32), dhr: nil, rootKey: Data(count: 32),
            sendChainKey: nil, recvChainKey: nil, sendCount: 0, recvCount: 0, previousChainLength: 0, skippedKeys: [:]
        )
    }

    private var tempFile: URL {
        FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".enc")
    }

    func test_panicWipeSet_leavesNothingBehind_exceptIdentityAndPins() async {
        let env = AppEnvironment()
        let identityKey = env.identity.myMessageKey
        env.pinManager.setPins(pin: "1234", panicPin: "9999")

        env.contactStore.add(contact("c1"))
        env.keychain.saveRatchetState(contactId: "c1", state: ratchetState())
        env.keychain.saveRatchetState(contactId: "orphan", state: ratchetState())
        env.defaultRelayConnectionString = relay
        env.extraRelayConnectionStrings = [relay]
        env.myRelayLabel = "Mac"
        env.backupRelayLabel = "VM"
        env.archivedRelayStore.archive(label: "old", connectionString: relay)
        XCTAssertTrue(env.nodeMeshStore.addNode(ownerString: "unpruuf-node-owner:v1:p5ncnam7fxml4mfdbz4nfr6pkkys2af73yefvopoxvkke2dtli2ldfad.onion:secret_0123456789"))
        await env.relayService.sendControlSignal(Data("x".utf8), to: "c1")
        XCTAssertEqual(env.relayService.pendingDeliveryCount, 1)
        let contactFile = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("contacts.enc")
        XCTAssertTrue(FileManager.default.fileExists(atPath: contactFile.path))

        env.wipeContactsAndMessages()

        XCTAssertTrue(env.contactStore.contacts.isEmpty)
        XCTAssertFalse(FileManager.default.fileExists(atPath: contactFile.path))
        XCTAssertNil(env.keychain.getData("contacts_file_key"))
        XCTAssertNil(env.keychain.getData("cases_file_key"))
        XCTAssertNil(env.keychain.loadRatchetState(contactId: "c1"))
        XCTAssertNil(env.keychain.loadRatchetState(contactId: "orphan"))
        XCTAssertEqual(env.relayService.pendingDeliveryCount, 0)
        XCTAssertEqual(env.defaultRelayConnectionString, "")
        XCTAssertTrue(env.extraRelayConnectionStrings.isEmpty)
        XCTAssertEqual(env.myRelayLabel, "")
        XCTAssertEqual(env.backupRelayLabel, "")
        XCTAssertNil(env.keychain.getString("default_relay_connection_string"))
        XCTAssertNil(env.keychain.getString("extra_relay_connection_strings"))
        XCTAssertTrue(env.archivedRelayStore.entries.isEmpty)
        XCTAssertNil(env.keychain.getData("archived_relays"))
        XCTAssertTrue(env.nodeMeshStore.nodes.isEmpty)
        XCTAssertNil(KeychainStore.nodeMesh().getString("node_mesh_state"))

        XCTAssertEqual(env.identity.myMessageKey, identityKey)
        XCTAssertEqual(env.pinManager.check("1234"), .normal)

        // A fresh start sees the same emptiness.
        let reloaded = AppEnvironment()
        XCTAssertTrue(reloaded.contactStore.contacts.isEmpty)
        XCTAssertEqual(reloaded.defaultRelayConnectionString, "")
        env.keychain.removeAll()
    }

    func test_contactFile_withoutItsKey_isLeftAlone() {
        let keychain = KeychainStore()
        keychain.removeData("contacts_file_key")
        let file = tempFile
        let oldBytes = Data("old file of an earlier key".utf8)
        try! oldBytes.write(to: file)

        let store = ContactStore(keychain: keychain, fileURL: file)
        XCTAssertTrue(store.isUnreadable)
        store.add(contact("c2"))

        XCTAssertEqual(try? Data(contentsOf: file), oldBytes)
        XCTAssertNil(keychain.getData("contacts_file_key"), "no new key may appear while the old file exists")
        try? FileManager.default.removeItem(at: file)
    }

    func test_contactFile_roundTrips_andIsOutOfBackups() throws {
        let keychain = KeychainStore()
        keychain.removeData("contacts_file_key")
        let file = tempFile
        let store = ContactStore(keychain: keychain, fileURL: file)
        XCTAssertFalse(store.isUnreadable)
        store.add(contact("c3"))

        XCTAssertEqual(ContactStore(keychain: keychain, fileURL: file).contacts.map(\.id), ["c3"])
        XCTAssertEqual(try file.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup, true)
        store.wipeAll()
        XCTAssertNil(keychain.getData("contacts_file_key"))
    }

    func test_backupExclusion_coversLibraryAndPreferences() throws {
        BackupExclusion.apply()
        let library = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0]
        for url in [library, library.appendingPathComponent("Preferences")] {
            XCTAssertEqual(try url.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup, true, url.path)
        }
    }

    func test_relayStrings_moveOutOfUserDefaults() {
        let keychain = KeychainStore()
        keychain.removeData("extra_relay_connection_strings")
        UserDefaults.standard.set(relay, forKey: "extra_relay_connection_strings")

        keychain.migrateFromDefaults("extra_relay_connection_strings")

        XCTAssertNil(UserDefaults.standard.object(forKey: "extra_relay_connection_strings"))
        XCTAssertEqual(keychain.getString("extra_relay_connection_strings"), relay)
        keychain.removeData("extra_relay_connection_strings")
    }

    func test_pinLockout_startsAtTheFifthWrongTry_andSurvivesANewManager() {
        let keychain = KeychainStore()
        let pins = PinManager(keychain: keychain)
        pins.setPins(pin: "1234", panicPin: "9999")
        for _ in 1...4 { XCTAssertEqual(pins.check("0000"), .wrong) }
        XCTAssertEqual(pins.lockRemainingMs(), 0)
        XCTAssertEqual(pins.check("0000"), .wrong)

        let afterRestart = PinManager(keychain: keychain)
        XCTAssertGreaterThan(afterRestart.lockRemainingMs(), 29_000)
        XCTAssertEqual(afterRestart.check("1234"), .locked, "not even the right PIN during a pause")
        XCTAssertEqual(afterRestart.check("9999"), .locked)

        pins.setPins(pin: "1234", panicPin: "9999")
        XCTAssertEqual(pins.lockRemainingMs(), 0)
        XCTAssertEqual(pins.check("1234"), .normal)
        keychain.removeAll()
    }

    func test_nodeStore_holdsAThousandNodes_inTheKeychain() throws {
        let keychain = KeychainStore.nodeMesh()
        keychain.removeData("node_mesh_state")
        let addresses = (0..<1000).compactMap { i -> String? in
            OnionAddress.address(publicKey: Data(repeating: UInt8(i % 256), count: 30) + Data([UInt8(i >> 8), UInt8(i & 0xFF)]))
        }
        let file = try XCTUnwrap(NodeListFile.parse(
            "unpruuf-node-list:v1\nname: Gross\nsecret: Owner_secret_0123456789-AB\ncount: 1000\n\n" + addresses.joined(separator: "\n") + "\n"
        ))
        guard case .ok(_, _, 1000, 1000) = NodeMeshStore(store: keychain).importNodeList(file, name: "Gross", targetListId: nil) else {
            return XCTFail("import")
        }
        let reloaded = NodeMeshStore(store: keychain)
        XCTAssertEqual(reloaded.nodes.count, 1000)
        XCTAssertFalse(reloaded.isUnreadable)
        reloaded.wipe()
        XCTAssertTrue(NodeMeshStore(store: keychain).nodes.isEmpty)
    }

    func test_safeImage_refusesOversizedHeaders() {
        XCTAssertTrue(SafeImage.isAcceptable(width: 7000, height: 7000))
        XCTAssertFalse(SafeImage.isAcceptable(width: 7072, height: 7072))
        XCTAssertFalse(SafeImage.isAcceptable(width: 20_001, height: 1))
        XCTAssertFalse(SafeImage.isAcceptable(width: 0, height: 10))
        XCTAssertNil(SafeImage.decode(Data("not an image".utf8)))
    }

    func test_safeImage_scalesDownToTheLimit() {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let big = UIGraphicsImageRenderer(size: CGSize(width: 3000, height: 1000), format: format).jpegData(withCompressionQuality: 0.5) { ctx in
            UIColor.blue.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: 3000, height: 1000))
        }
        let decoded = SafeImage.decode(big)
        XCTAssertEqual(decoded?.size.width, 2048)
    }

    func test_clipboard_isLocalAndExpires() {
        SensitiveClipboard.copy("secret-value")
        XCTAssertEqual(UIPasteboard.general.string, "secret-value")
        XCTAssertEqual(SensitiveClipboard.lifetime, 60)
        UIPasteboard.general.items = []
    }
}
