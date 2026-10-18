package com.nexonai.unpruuf.screens.qrpair

import androidx.lifecycle.ViewModel
import com.nexonai.unpruuf.domain.AppEdition
import com.nexonai.unpruuf.domain.network.GuestInvite
import com.nexonai.unpruuf.domain.network.IdentityManager
import com.nexonai.unpruuf.domain.network.NodeMeshManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject

/**
 * "Invite a guest" (GUEST_LOCKERS_BUILD_SPEC.md §7.1): the owner (Pro) invites a free Client app
 * user who has no servers of their own. The invitation is the normal Business pairing code plus
 * one signed, expiring guest grant per own node (field `g`), so the guest can deposit on the
 * owner's servers and nowhere else.
 *
 * The invitation exists only in this ViewModel: never written to disk, never logged, gone when
 * the screen is left. Grant ids are new for every invitation.
 */
@HiltViewModel
class GuestInviteViewModel @Inject constructor(
    private val identityManager: IdentityManager,
    private val nodeMeshManager: NodeMeshManager
) : ViewModel() {

    data class Invitation(val json: String, val expiresAtMs: Long, val nodeCount: Int)

    private val _validityDays = MutableStateFlow(GuestInvite.DEFAULT_VALIDITY_DAYS)
    val validityDays = _validityDays.asStateFlow()

    private val _quota = MutableStateFlow(GuestInvite.Quota.NORMAL)
    val quota = _quota.asStateFlow()

    private val _invitation = MutableStateFlow<Invitation?>(null)
    val invitation = _invitation.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error = _error.asStateFlow()

    /** Only the Pro edition invites, and only with at least one own node configured. */
    fun blockedReason(): String? = when {
        !AppEdition.isPro -> "Only unpruuf Pro can invite guests."
        !nodeMeshManager.isUsable() -> "Set up your own node first (Settings → Business Node-Mesh). A guest writes on your servers, so you need at least one."
        else -> null
    }

    fun setValidityDays(days: Int) {
        if (days in GuestInvite.VALIDITY_DAYS_OPTIONS) {
            _validityDays.value = days
            _invitation.value = null // a changed setting never leaves an old code on screen
        }
    }

    fun setQuota(q: GuestInvite.Quota) {
        _quota.value = q
        _invitation.value = null
    }

    fun createInvitation() {
        blockedReason()?.let { _error.value = it; return }
        val pool = nodeMeshManager.getMyNodePool()
        if (pool.isEmpty()) { _error.value = "No own node configured."; return }
        val now = System.currentTimeMillis()
        val grants = runCatching {
            GuestInvite.issueGrants(
                nodes = pool.map { GuestInvite.OwnNode(it.address, it.ownerSecret) },
                nowMs = now,
                validityDays = _validityDays.value,
                quota = _quota.value
            )
        }.getOrElse { _error.value = "Could not create the invitation."; return }
        val payload = NodeMeshPairingPayload(
            userId = identityManager.userId,
            messageKeyBase64 = android.util.Base64.encodeToString(identityManager.myMessageKey, android.util.Base64.NO_WRAP),
            x25519RatchetPublicKeyBase64 = identityManager.myX25519RatchetPublicKeyBase64,
            nodeMeshRoutingSeedBase64 = identityManager.myNodeMeshRoutingSeedBase64,
            // Same order as the pool, so grant i belongs to address i.
            nodeAddresses = pool.map { it.address },
            appEdition = AppEdition.current,
            guestGrants = grants
        )
        _error.value = null
        _invitation.value = Invitation(
            json = nodeMeshPayloadToJson(payload),
            expiresAtMs = GuestInvite.expiryMs(now, _validityDays.value),
            nodeCount = pool.size
        )
    }

    /** Hides the code. Called when the owner taps Done and when the screen is left. */
    fun clearInvitation() { _invitation.value = null }

    override fun onCleared() {
        _invitation.value = null
        super.onCleared()
    }
}
