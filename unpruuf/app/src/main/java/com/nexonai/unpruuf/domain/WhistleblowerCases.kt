package com.nexonai.unpruuf.domain

import android.content.Context
import com.google.crypto.tink.subtle.X25519
import com.nexonai.unpruuf.data.db.ContactDao
import com.nexonai.unpruuf.data.model.Contact
import com.nexonai.unpruuf.data.repository.InMemoryMessageStore
import com.nexonai.unpruuf.domain.network.IdentityManager
import com.nexonai.unpruuf.domain.network.P2PNetworkManager
import com.nexonai.unpruuf.domain.network.RelayManager
import com.nexonai.unpruuf.domain.network.ratchet.RatchetSessionManager
import com.nexonai.unpruuf.screens.qrpair.CrossPlatformPairingPayload
import com.nexonai.unpruuf.screens.qrpair.crossPlatformPayloadToJson
import com.nexonai.unpruuf.screens.qrpair.jsonToCrossPlatformPayload
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.security.SecureRandom
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Whistleblower edition: the organisation (its one QR, scanned once) and the reporter's cases.
 *
 * Every case is its own contact with its OWN message key, ratchet key pair and identity — never
 * the device's global ones. So two reports from the same phone look like two unrelated people,
 * to the relay and to the reporting office alike. (With the global values the officer-app even
 * merged a second report into the first case, because it recognised the same reporter id.)
 */
@Singleton
class WhistleblowerCases @Inject constructor(
    @ApplicationContext context: Context,
    private val contactDao: ContactDao,
    private val identityManager: IdentityManager,
    private val relayManager: RelayManager,
    private val ratchetSessionManager: RatchetSessionManager,
    private val p2pNetworkManager: P2PNetworkManager,
    private val messageStore: InMemoryMessageStore
) {
    private val prefs = context.getSharedPreferences("wb_org", Context.MODE_PRIVATE)

    private val _organization = MutableStateFlow(loadOrganization())
    /** The scanned organisation QR, null until the first scan. */
    val organization: StateFlow<CrossPlatformPairingPayload?> = _organization.asStateFlow()

    private fun loadOrganization(): CrossPlatformPairingPayload? =
        prefs.getString("officer_qr", null)?.let { jsonToCrossPlatformPayload(it) }

    sealed class ScanResult {
        data class Ok(val contactId: String) : ScanResult()
        data class Invalid(val reason: String) : ScanResult()
    }

    /** Validates a scanned/pasted organisation QR, remembers it and opens the first case. */
    suspend fun connectOrganization(raw: String): ScanResult {
        val payload = jsonToCrossPlatformPayload(raw.trim()) ?: return ScanResult.Invalid("unreadable")
        if (payload.appEdition != AppEdition.OFFICER) return ScanResult.Invalid("not_officer")
        if (payload.relayConnectionStrings.none { RelayManager.parseConnectionString(it) != null }) return ScanResult.Invalid("relay")
        if (payload.x25519RatchetPublicKeyBase64.isBlank()) return ScanResult.Invalid("old")
        prefs.edit().putString("officer_qr", crossPlatformPayloadToJson(payload)).apply()
        _organization.value = payload
        return openNewCase()?.let { ScanResult.Ok(it) } ?: ScanResult.Invalid("unreadable")
    }

    /** A new, independent case with the remembered organisation — no new scan needed. */
    suspend fun openNewCase(): String? {
        val org = _organization.value ?: return null
        val random = SecureRandom()
        val messageKey = ByteArray(32).also { random.nextBytes(it) }
        val ratchetPriv = X25519.generatePrivateKey()
        val ratchetPub = X25519.publicFromPrivate(ratchetPriv)
        val myRelays = relayManager.getMyRelayPool()
            .ifEmpty { org.relayConnectionStrings.take(RelayManager.RELAY_POOL_MAX_SIZE) }
        val contact = Contact(
            id = identityManager.newWireIdentity(),
            onionAddress = "",
            publicKey = org.messageKeyBase64,
            rotationFactor = "",
            displayName = "",
            x25519RatchetPublicKey = org.x25519RatchetPublicKeyBase64,
            crossPlatform = true,
            myRelayConnectionString = RelayManager.buildConnectionStringList(myRelays),
            theirRelayConnectionString = RelayManager.buildConnectionStringList(org.relayConnectionStrings),
            remoteUserId = org.userId,
            // One fresh id per case: it is both the "userId" the officer sees and our wire identity.
            myWireIdentity = identityManager.newWireIdentity(),
            myPairMessageKey = b64(messageKey),
            myPairRatchetPrivateKey = b64(ratchetPriv),
            myPairRatchetPublicKey = b64(ratchetPub)
        )
        contactDao.insert(contact)
        ratchetSessionManager.createSession(contact)
        p2pNetworkManager.startOfficerCase(contact.id)
        return contact.id
    }

    /** Removes every trace of the case from this phone. The reporting office keeps its record
     *  (Art. 9 retention) — nothing is sent to it. */
    suspend fun removeCaseFromDevice(contactId: String) {
        messageStore.zeroizeContact(contactId)
        ratchetSessionManager.deleteSession(contactId)
        contactDao.deleteById(contactId)
        p2pNetworkManager.forgetContactLocally(contactId)
    }

    /** "Scan another organisation": new cases use the new QR; existing cases keep theirs. */
    fun forgetOrganization() {
        prefs.edit().clear().apply()
        _organization.value = null
    }

    private fun b64(bytes: ByteArray): String = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
}
