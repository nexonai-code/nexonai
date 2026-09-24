package com.nexonai.unpruuf.screens.contacts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nexonai.unpruuf.data.db.ContactDao
import com.nexonai.unpruuf.data.model.Contact
import com.nexonai.unpruuf.data.repository.InMemoryMessageStore
import com.nexonai.unpruuf.domain.network.P2PNetworkManager
import com.nexonai.unpruuf.domain.network.TorManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ContactsViewModel @Inject constructor(
    private val contactDao: ContactDao,
    private val messageStore: InMemoryMessageStore,
    private val p2pNetworkManager: P2PNetworkManager,
    private val torManager: TorManager
) : ViewModel() {

    val contacts = contactDao.getAllContacts()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    // Live Tor state for the app bar's status pill — already a StateFlow on TorManager.
    val torActive = torManager.isReady

    // Last self-reachability verdict (null = unknown, false = the device believes its own
    // hidden service is currently unreachable and is self-healing) — the pill's third state.
    val selfReachable = p2pNetworkManager.selfReachable

    /** Transport line under a contact's name — LAN fast path vs. Tor. UI-only. */
    fun isLanPeer(contactId: String) = p2pNetworkManager.isLanPeer(contactId)

    // Contacts with an unread message → shown as a green dot in the list.
    val unreadContactIds = messageStore.unreadContactIds
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptySet())

    // Contacts paired before this device had a single main onion (see
    // TorManager.legacyPairedContactIds) — this device still separately republishes an old
    // per-contact onion for them, so THEIR copy of THIS device's address may be stale.
    // Intersected with the live contact list so an entry lingering for an already-deleted
    // contact never shows up. Surfaced as a dismissible banner in ContactsScreen rather than
    // migrated silently, and only ever sends this device's OWN current address to the
    // contact (sendMainOnionUpdate) — never touches how this device reaches them.
    val legacyContactIds = combine(contacts, torManager.legacyPairedContactIds) { list, legacy ->
        list.map { it.id }.filter { it in legacy }.toSet()
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptySet())

    fun migrateLegacyContacts(contactIds: Set<String>) {
        contactIds.forEach { p2pNetworkManager.sendMainOnionUpdate(it) }
    }

    // GRAL Säule 5: Kontakt beidseitig löschen (auch auf dem anderen Telefon)
    fun revokeContact(contact: Contact) {
        // Sendet das Löschsignal an den Peer und entfernt den Kontakt lokal.
        p2pNetworkManager.sendDeleteContact(contact.id)
    }

    fun renameContact(contactId: String, newName: String) {
        viewModelScope.launch {
            contactDao.updateDisplayName(contactId, newName.trim())
        }
    }
}
