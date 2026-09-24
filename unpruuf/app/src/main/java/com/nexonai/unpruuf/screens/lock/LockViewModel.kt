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

@HiltViewModel
class LockViewModel @Inject constructor(
    private val pinManager: PinManager,
    private val appLockManager: AppLockManager,
    private val contactDao: ContactDao,
    private val messageStore: InMemoryMessageStore,
    private val identityManager: IdentityManager,
    private val ratchetSessionManager: RatchetSessionManager
) : ViewModel() {

    val isPinSet: Boolean get() = pinManager.isPinSet()
    val isBiometricEnabled: Boolean get() = pinManager.isBiometricEnabled()

    private val _error = MutableStateFlow<String?>(null)
    val error = _error.asStateFlow()

    /** Ersteinrichtung: normale PIN + Panik-PIN festlegen. */
    fun setupPins(pin: String, panicPin: String): Boolean {
        if (pin.length < 4) { _error.value = "PIN must be at least 4 digits."; return false }
        if (pin == panicPin) { _error.value = "Panic PIN must differ from the PIN."; return false }
        pinManager.setPins(pin, panicPin)
        appLockManager.unlock()
        return true
    }

    /** Entsperren. Panik-PIN löscht alle Kontakte und öffnet die App leer. */
    fun submitPin(input: String) {
        when (pinManager.check(input)) {
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
                _error.value = "Wrong PIN."
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
        }
    }
}
