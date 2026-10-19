package com.nexonai.unpruuf.screens.lock

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nexonai.unpruuf.data.db.ContactDao
import com.nexonai.unpruuf.data.repository.InMemoryMessageStore
import com.nexonai.unpruuf.domain.network.IdentityManager
import com.nexonai.unpruuf.domain.network.ratchet.RatchetSessionManager
import com.nexonai.unpruuf.domain.security.AppLockManager
import com.nexonai.unpruuf.domain.security.PinManager
import com.nexonai.unpruuf.domain.security.PinResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

/** Kept as a code, not a string — the message shown lives in the UI layer (stringResource), so
 *  each build flavor (e.g. whistleblower) can localize it without this ViewModel knowing about
 *  Android resources. */
enum class LockError { PIN_TOO_SHORT, PANIC_SAME_AS_PIN, WRONG_PIN, PIN_LOCKED }

@HiltViewModel
class LockViewModel @Inject constructor(
    private val pinManager: PinManager,
    private val appLockManager: AppLockManager,
    private val contactDao: ContactDao,
    private val messageStore: InMemoryMessageStore,
    private val identityManager: IdentityManager,
    private val ratchetSessionManager: RatchetSessionManager,
    private val whistleblowerCases: com.nexonai.unpruuf.domain.WhistleblowerCases,
    private val groupDao: com.nexonai.unpruuf.data.db.GroupDao,
    private val nodeMeshManager: com.nexonai.unpruuf.domain.network.NodeMeshManager,
    private val relayManager: com.nexonai.unpruuf.domain.network.RelayManager
) : ViewModel() {

    val isPinSet: Boolean get() = pinManager.isPinSet()
    val isBiometricEnabled: Boolean get() = pinManager.isBiometricEnabled()

    private val _error = MutableStateFlow<LockError?>(null)
    val error = _error.asStateFlow()

    /** Seconds the PIN pad is locked for after too many wrong tries; 0 when it is free. The UI shows it with [LockError.PIN_LOCKED]. */
    private val _lockSeconds = MutableStateFlow(0)
    val lockSeconds = _lockSeconds.asStateFlow()

    /** Ersteinrichtung: normale PIN + Panik-PIN festlegen. */
    fun setupPins(pin: String, panicPin: String): Boolean {
        if (pin.length < 4) { _error.value = LockError.PIN_TOO_SHORT; return false }
        if (pin == panicPin) { _error.value = LockError.PANIC_SAME_AS_PIN; return false }
        pinManager.setPins(pin, panicPin)
        appLockManager.unlock()
        return true
    }

    /** Entsperren. Panik-PIN löscht alle Kontakte und öffnet die App leer. */
    fun submitPin(input: String) {
        val result = pinManager.check(input)
        _lockSeconds.value = ((pinManager.lockRemainingMs() + 999) / 1000).toInt()
        when (result) {
            PinResult.LOCKED -> _error.value = LockError.PIN_LOCKED
            PinResult.NORMAL -> {
                _error.value = null
                appLockManager.unlock()
            }
            PinResult.PANIC -> {
                viewModelScope.launch {
                    wipeEverything()
                    _error.value = null
                    appLockManager.unlock()
                }
            }
            PinResult.WRONG -> {
                // The try that just tripped the lock: say so straight away instead of "wrong PIN".
                _error.value = if (_lockSeconds.value > 0) LockError.PIN_LOCKED else LockError.WRONG_PIN
            }
        }
    }

    /** Called after a successful [androidx.biometric.BiometricPrompt] authentication — same
     *  success path as [PinResult.NORMAL], without checking any PIN, since the biometric check
     *  itself is the proof. Never usable for the panic path: there is no biometric equivalent
     *  of the panic PIN, so a fingerprint can never wipe/open the app empty. */
    fun biometricUnlock() {
        _error.value = null
        appLockManager.unlock()
    }

    fun clearError() { _error.value = null }

    /**
     * Panic PIN: afterwards the app opens as if it had just been set up. Gone are the contacts and
     * their ratchet sessions and onion keys, the Pro Groups (codes and members), the own nodes with
     * their owner secrets, node lists, feed sources and pool sources, the relay setup, and the
     * remembered organisation QR (whistleblower). Kept: the PINs themselves, the licence and the
     * app's own identity keys (they say nothing about whom the user talks to).
     */
    private suspend fun wipeEverything() {
        messageStore.zeroizeAll()
        withContext(Dispatchers.IO) {
            contactDao.getAllContactsOnce().forEach {
                contactDao.deleteById(it.id)
                ratchetSessionManager.deleteSession(it.id)
            }
            identityManager.getAllContactOnionKeys().keys.forEach {
                identityManager.removeContactOnionPrivKey(it)
            }
            groupDao.deleteAll()
            nodeMeshManager.wipeAll()
            relayManager.wipeAll()
            // Whistleblower: the remembered organisation QR goes too — no trace of where to report.
            whistleblowerCases.forgetOrganization()
        }
    }
}
