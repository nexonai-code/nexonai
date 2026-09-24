package com.nexonai.unpruuf.screens.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nexonai.unpruuf.domain.license.LicenseManager
import com.nexonai.unpruuf.domain.network.BridgeManager
import com.nexonai.unpruuf.domain.network.IdentityManager
import com.nexonai.unpruuf.domain.network.NodeMeshManager
import com.nexonai.unpruuf.domain.network.P2PNetworkManager
import com.nexonai.unpruuf.domain.network.RelayManager
import com.nexonai.unpruuf.domain.network.TorManager
import com.nexonai.unpruuf.domain.relay.RelayPoolManager
import com.nexonai.unpruuf.domain.security.PinManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val bridgeManager: BridgeManager,
    private val torManager: TorManager,
    private val relayManager: RelayManager,
    private val pinManager: PinManager,
    val licenseManager: LicenseManager,
    private val relayPoolManager: RelayPoolManager,
    private val identityManager: IdentityManager,
    private val nodeMeshManager: NodeMeshManager,
    private val p2pNetworkManager: P2PNetworkManager
) : ViewModel() {

    private val _biometricEnabled = MutableStateFlow(pinManager.isBiometricEnabled())
    val biometricEnabled = _biometricEnabled.asStateFlow()

    fun onBiometricEnabledChange(enabled: Boolean) {
        _biometricEnabled.value = enabled
        pinManager.setBiometricEnabled(enabled)
    }

    private val _bridgesEnabled = MutableStateFlow(bridgeManager.isEnabled())
    val bridgesEnabled = _bridgesEnabled.asStateFlow()

    private val _bridgeText = MutableStateFlow(bridgeManager.getBridgeText())
    val bridgeText = _bridgeText.asStateFlow()

    private val _status = MutableStateFlow<String?>(null)
    val status = _status.asStateFlow()

    private val _relayMode = MutableStateFlow(relayManager.getMode())
    val relayMode = _relayMode.asStateFlow()

    // What's currently configured (read-only display) vs. what the user is pasting/scanning
    // right now (only applied once they tap Save, so a half-typed paste can't half-overwrite it).
    private val _relayConfiguredOnion = MutableStateFlow(relayManager.getRelayOnion())
    val relayConfiguredOnion = _relayConfiguredOnion.asStateFlow()

    private val _relayInput = MutableStateFlow("")
    val relayInput = _relayInput.asStateFlow()

    private val _relayStatus = MutableStateFlow<String?>(null)
    val relayStatus = _relayStatus.asStateFlow()

    // Optional backup relay(s) beyond the primary above — see RelayManager.getMyRelayPool()/
    // getExtraConnectionStrings(). Single-field editor for v1 (RELAY_POOL_MAX_SIZE is 2, and the
    // primary already fills slot 1), same pattern as the primary field: free-typed until Save.
    private val _backupRelayInput = MutableStateFlow(
        relayManager.getExtraConnectionStrings().firstOrNull() ?: ""
    )
    val backupRelayInput = _backupRelayInput.asStateFlow()

    // Second fallback — RELAY_POOL_MAX_SIZE is 3 since v5 (primary + two backups).
    private val _backupRelay2Input = MutableStateFlow(
        relayManager.getExtraConnectionStrings().getOrNull(1) ?: ""
    )
    val backupRelay2Input = _backupRelay2Input.asStateFlow()

    private val _backupRelayStatus = MutableStateFlow<String?>(null)
    val backupRelayStatus = _backupRelayStatus.asStateFlow()

    fun onBridgesEnabledChange(enabled: Boolean) { _bridgesEnabled.value = enabled }
    fun onBridgeTextChange(text: String) { _bridgeText.value = text }

    fun save() {
        bridgeManager.setEnabled(_bridgesEnabled.value)
        bridgeManager.setBridgeText(_bridgeText.value)

        _status.value = when {
            !_bridgesEnabled.value -> "Bridges disabled."
            bridgeManager.needsPluggableTransport() ->
                "Note: your bridges (obfs4/snowflake) need the upcoming " +
                "Snowflake update. Vanilla bridges (IP:Port Fingerprint) work immediately."
            bridgeManager.usableVanillaLines().isEmpty() ->
                "No valid bridge lines detected."
            else -> "Bridges active. Reconnecting Tor…"
        }

        viewModelScope.launch { torManager.reapplyBridges() }
    }

    fun clearStatus() { _status.value = null }

    fun onRelayModeChange(mode: RelayManager.RelayMode) { _relayMode.value = mode }
    fun onRelayInputChange(text: String) { _relayInput.value = text }

    /** Called with the raw scanned QR contents — applies immediately, same as pasting + Save. */
    fun onRelayQrScanned(raw: String) {
        _relayInput.value = raw
        saveRelay()
    }

    fun saveRelay() {
        relayManager.setMode(_relayMode.value)

        val pasted = _relayInput.value.trim()
        if (pasted.isNotEmpty()) {
            if (relayManager.applyConnectionString(pasted)) {
                _relayConfiguredOnion.value = relayManager.getRelayOnion()
                _relayInput.value = ""
            } else {
                _relayStatus.value = "Unreadable connection string — check the QR/text and try again."
                return
            }
        }

        _relayStatus.value = when {
            _relayMode.value == RelayManager.RelayMode.OFF -> "Relay disabled."
            !relayManager.isUsable() -> "Scan or paste a relay connection string to activate the relay."
            _relayMode.value == RelayManager.RelayMode.MANDATORY ->
                "Relay mandatory — every contact routes through the relay, LAN/Tor-direct skipped."
            else -> "Relay active — used when a contact can't be reached directly, or for transfers over 2 MB."
        }
    }

    fun clearRelayStatus() { _relayStatus.value = null }

    fun onBackupRelayInputChange(text: String) { _backupRelayInput.value = text }
    fun onBackupRelay2InputChange(text: String) { _backupRelay2Input.value = text }

    fun saveBackupRelay() {
        val entered = listOf(_backupRelayInput.value.trim(), _backupRelay2Input.value.trim())
            .filter { it.isNotEmpty() }
        if (entered.isEmpty()) {
            relayManager.setExtraConnectionStrings(emptyList())
            _backupRelayStatus.value = "Backup relays cleared."
            return
        }
        if (entered.any { RelayManager.parseConnectionString(it) == null }) {
            _backupRelayStatus.value = "Unreadable connection string — check the QR/text and try again."
            return
        }
        relayManager.setExtraConnectionStrings(entered)
        _backupRelayStatus.value = if (entered.size == 1) {
            "Backup relay saved — used if the primary is unreachable."
        } else {
            "Both backup relays saved — tried in order if the primary is unreachable."
        }
    }

    fun clearBackupRelayStatus() { _backupRelayStatus.value = null }

    val licenseState = licenseManager.state

    private val _licenseInput = MutableStateFlow("")
    val licenseInput = _licenseInput.asStateFlow()

    private val _licenseStatus = MutableStateFlow<String?>(null)
    val licenseStatus = _licenseStatus.asStateFlow()

    fun onLicenseInputChange(text: String) { _licenseInput.value = text }

    fun saveLicense() {
        val pasted = _licenseInput.value.trim()
        if (pasted.isEmpty()) return
        val error = licenseManager.applyLicenseCode(pasted)
        if (error == null) {
            _licenseInput.value = ""
            _licenseStatus.value = "License activated."
        } else {
            _licenseStatus.value = error
        }
    }

    fun clearLicenseStatus() { _licenseStatus.value = null }

    // ─── Company relay-pool manifest import — see relaypool-tool/ ──────────────────────────
    val relayPoolLastImported = relayPoolManager.lastImported

    private val _relayPoolInput = MutableStateFlow("")
    val relayPoolInput = _relayPoolInput.asStateFlow()

    private val _relayPoolStatus = MutableStateFlow<String?>(null)
    val relayPoolStatus = _relayPoolStatus.asStateFlow()

    fun onRelayPoolInputChange(text: String) { _relayPoolInput.value = text }

    fun importRelayPool() {
        val pasted = _relayPoolInput.value.trim()
        if (pasted.isEmpty()) return
        val error = relayPoolManager.importManifest(pasted)
        if (error == null) {
            _relayPoolInput.value = ""
            _relayPoolStatus.value = "Relay list imported."
            // Keep the backup-relay field's displayed value in sync — importManifest just
            // replaced RelayManager's extra-connection-strings wholesale.
            _backupRelayInput.value = relayManager.getExtraConnectionStrings().firstOrNull() ?: ""
        } else {
            _relayPoolStatus.value = error
        }
    }

    fun clearRelayPoolStatus() { _relayPoolStatus.value = null }

    // ─── Pairing identity (see IdentityManager.regenerateUserId) ───────────────────────────
    private val _identityStatus = MutableStateFlow<String?>(null)
    val identityStatus = _identityStatus.asStateFlow()

    /** Regenerates the identity shown in this device's own QR code from now on. Existing
     *  contacts are unaffected — see regenerateUserId()'s doc comment. */
    fun regeneratePairingIdentity() {
        identityManager.regenerateUserId()
        _identityStatus.value = "Pairing identity renewed. Existing contacts are unaffected " +
            "— this only changes your own QR code going forward."
    }

    fun clearIdentityStatus() { _identityStatus.value = null }

    // ─── unpruuf Business / Node-Mesh — this device's own nodes (NODE_MESH_SPEC.md) ────────
    // Deliberately shows only ADDRESSES, never an owner secret — see NodeMeshManager's doc
    // comment for why that split exists at all. Once a secret is pasted in here it's stored and
    // never displayed again in plaintext; there's no "show secret" affordance by design.
    private val _myNodeAddresses = MutableStateFlow(nodeMeshManager.getMyAdvertisedAddresses())
    val myNodeAddresses = _myNodeAddresses.asStateFlow()

    private val _nodeMeshInput = MutableStateFlow("")
    val nodeMeshInput = _nodeMeshInput.asStateFlow()

    private val _nodeMeshStatus = MutableStateFlow<String?>(null)
    val nodeMeshStatus = _nodeMeshStatus.asStateFlow()

    fun onNodeMeshInputChange(text: String) { _nodeMeshInput.value = text }

    /** Called with the raw scanned QR contents (a node-mesh-server's own
     *  `unpruuf-node-owner:v1:...` startup string) — applies immediately, same as pasting + Add. */
    fun onNodeMeshQrScanned(raw: String) {
        _nodeMeshInput.value = raw
        addMyNode()
    }

    fun addMyNode() {
        val pasted = _nodeMeshInput.value.trim()
        if (pasted.isEmpty()) return
        if (nodeMeshManager.addMyNode(pasted)) {
            _nodeMeshInput.value = ""
            _myNodeAddresses.value = nodeMeshManager.getMyAdvertisedAddresses()
            _nodeMeshStatus.value = "Node added."
        } else {
            _nodeMeshStatus.value = "Unreadable node string, or already at the ${NodeMeshManager.NODE_POOL_MAX_SIZE}-node limit — check the QR/text and try again."
        }
    }

    fun removeMyNode(address: String) {
        nodeMeshManager.removeMyNode(address)
        _myNodeAddresses.value = nodeMeshManager.getMyAdvertisedAddresses()
        _nodeMeshStatus.value = "Node removed."
    }

    fun clearNodeMeshStatus() { _nodeMeshStatus.value = null }

    // ─── Node address migration (NODE_MESH_SPEC.md §6) ─────────────────────────────────────
    // Which of this device's own nodes (by its current address) is being migrated right now, if
    // any — drives an inline "enter the new address" affordance per row in Settings, rather than
    // a separate screen for what's meant to be a rare, occasional action.
    private val _migratingAddress = MutableStateFlow<String?>(null)
    val migratingAddress = _migratingAddress.asStateFlow()

    private val _migrateInput = MutableStateFlow("")
    val migrateInput = _migrateInput.asStateFlow()

    fun startMigrateNode(address: String) {
        _migratingAddress.value = address
        _migrateInput.value = ""
    }

    fun cancelMigrateNode() {
        _migratingAddress.value = null
        _migrateInput.value = ""
    }

    fun onMigrateInputChange(text: String) { _migrateInput.value = text }

    /** Updates the local config, then notifies every current Node-Mesh contact — see
     *  NodeMeshManager.migrateMyNode's doc comment for why that ordering alone is enough to
     *  satisfy "never announce over the node that's changing", with no extra logic needed here. */
    fun confirmMigrateNode() {
        val oldAddress = _migratingAddress.value ?: return
        val newAddress = _migrateInput.value.trim()
        if (newAddress.isEmpty()) return
        if (nodeMeshManager.migrateMyNode(oldAddress, newAddress)) {
            p2pNetworkManager.sendNodeMigrationSignalToAll(oldAddress, newAddress)
            _myNodeAddresses.value = nodeMeshManager.getMyAdvertisedAddresses()
            _nodeMeshStatus.value = "Node migrated — contacts notified."
            _migratingAddress.value = null
            _migrateInput.value = ""
        } else {
            _nodeMeshStatus.value = "Migration failed — that address isn't currently configured."
        }
    }
}
