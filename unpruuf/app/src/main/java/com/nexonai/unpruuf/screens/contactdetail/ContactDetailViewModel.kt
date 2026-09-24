package com.nexonai.unpruuf.screens.contactdetail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nexonai.unpruuf.data.db.ContactDao
import com.nexonai.unpruuf.data.model.Contact
import com.nexonai.unpruuf.domain.network.IdentityManager
import com.nexonai.unpruuf.domain.network.P2PNetworkManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ContactDetailViewModel @Inject constructor(
    private val contactDao: ContactDao,
    private val identityManager: IdentityManager,
    private val p2pNetworkManager: P2PNetworkManager
) : ViewModel() {

    private val _contact = MutableStateFlow<Contact?>(null)
    val contact = _contact.asStateFlow()

    // This device's own copy of the safety number for the loaded contact — see
    // IdentityManager.safetyNumber's doc comment. Derived from `contact` so it recomputes
    // automatically once `load()` populates it.
    val mySafetyNumber: StateFlow<String?> = contact
        .map { c -> c?.x25519RatchetPublicKey?.takeIf { it.isNotBlank() }?.let { identityManager.safetyNumber(it) } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    // null = no attempt yet, true = last entered code matched, false = it didn't.
    private val _verifyResult = MutableStateFlow<Boolean?>(null)
    val verifyResult = _verifyResult.asStateFlow()

    fun load(contactId: String) {
        viewModelScope.launch {
            _contact.value = contactDao.getContactById(contactId)
        }
    }

    /** Compares [enteredCode] — whatever the user typed after the contact read THEIR copy of
     *  [mySafetyNumber] aloud — against this device's own computed code. Only persists
     *  `isVerified` on a match; a mismatch is surfaced to the caller but never silently saved,
     *  since silently marking a non-matching contact "verified" would defeat the entire point. */
    fun verify(enteredCode: String) {
        val expected = mySafetyNumber.value ?: return
        val matches = normalize(enteredCode) == normalize(expected)
        _verifyResult.value = matches
        if (matches) {
            val contactId = _contact.value?.id ?: return
            viewModelScope.launch {
                contactDao.setVerified(contactId, true)
                _contact.value = contactDao.getContactById(contactId)
            }
            // Moves this contact onto the (rotating) verified onion right away instead of
            // waiting for the next periodic cycle — see P2PNetworkManager.notifyContactVerified.
            p2pNetworkManager.notifyContactVerified(contactId)
        }
    }

    /** Clears any prior match/mismatch banner — called as the user edits the field again, so a
     *  stale "codes don't match" doesn't linger next to a code they haven't re-submitted yet. */
    fun clearVerifyResult() {
        _verifyResult.value = null
    }

    /**
     * Manually pins which side's relay list is used for this contact — see
     * P2PNetworkManager.switchRelayOwner()/IdentityManager.relayOwnerIsMine(). [toMine] = true
     * pins this device's own list; false pins the contact's; null clears the override and
     * returns to the automatic rhythm. Writes the local override here (not only inside
     * [P2PNetworkManager.switchRelayOwner], which does the same write again before sending the
     * mirroring signal — harmless, idempotent) so [contact] can be reloaded in the same
     * coroutine right after, instead of racing that call's own fire-and-forget update.
     */
    fun switchRelayOwner(toMine: Boolean?) {
        val contactId = _contact.value?.id ?: return
        viewModelScope.launch {
            contactDao.updateManualRelayOwner(contactId, if (toMine == null) null else if (toMine) "mine" else "theirs")
            _contact.value = contactDao.getContactById(contactId)
        }
        if (toMine != null) {
            p2pNetworkManager.switchRelayOwner(contactId, toMine)
        }
    }

    private fun normalize(code: String) = code.filter { it.isDigit() }
}
