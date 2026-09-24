package com.nexonai.unpruuf.screens.chat

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nexonai.unpruuf.data.db.ContactDao
import com.nexonai.unpruuf.data.model.Contact
import com.nexonai.unpruuf.data.repository.InMemoryMessageStore
import com.nexonai.unpruuf.data.repository.MessageType
import com.nexonai.unpruuf.data.repository.RamMessage
import com.nexonai.unpruuf.domain.network.MessagePayload
import com.nexonai.unpruuf.domain.network.NodeMeshManager
import com.nexonai.unpruuf.domain.network.P2PNetworkManager
import com.nexonai.unpruuf.domain.network.RelayManager
import com.nexonai.unpruuf.domain.security.AppLockManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class ChatViewModel @Inject constructor(
    private val messageStore: InMemoryMessageStore,
    private val contactDao: ContactDao,
    private val p2pNetworkManager: P2PNetworkManager,
    private val appLockManager: AppLockManager,
    private val relayManager: RelayManager
) : ViewModel() {

    // Read fresh each time (cheap SharedPreferences check) rather than cached — the whole point
    // is that StillConnectingHint reflects whatever the user just changed in Settings, without
    // needing a restart or a dedicated observable wired through just for this.
    fun isRelayConfigured(): Boolean = relayManager.isUsable()

    /**
     * Must be called immediately before launching the camera or the file picker: both are
     * EXTERNAL activities, so the whole app goes to the background — which the process
     * lifecycle observer would otherwise answer with wipe RAM + lock (PIN screen on return,
     * picked photo/file silently dropped — reported for real). See
     * [AppLockManager.beginExternalIntentGrace] for the bounded exception this opens.
     */
    fun beginExternalPickerGrace() = appLockManager.beginExternalIntentGrace()

    private val _contact = MutableStateFlow<Contact?>(null)
    val contact = _contact.asStateFlow()

    private val _sendError = MutableStateFlow<String?>(null)
    val sendError = _sendError.asStateFlow()

    // true after revokeContact() completes → triggers navigation back
    private val _revoked = MutableStateFlow(false)
    val revoked = _revoked.asStateFlow()

    // IDs ausgehender Nachrichten, die der Empfänger per ACK bestätigt hat
    val deliveredIds = p2pNetworkManager.deliveredIds

    val messages = _contact
        .flatMapLatest { contact ->
            if (contact == null) flowOf(emptyList())
            else messageStore.messages.map { it[contact.id] ?: emptyList() }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    fun loadContact(contactId: String) {
        _revoked.value = false
        viewModelScope.launch {
            _contact.value = contactDao.getContactById(contactId)
        }
        // Tor-Pfad zum Kontakt vorwärmen + aktiv warm halten, solange der Chat
        // offen ist → erste und folgende Nachrichten ohne Kaltstart (~10–20 s),
        // besonders im Mobilfunk.
        p2pNetworkManager.warmUpContact(contactId)
        p2pNetworkManager.setActiveChat(contactId)
        // Opening the chat is the read receipt for the local unread dot.
        messageStore.clearUnread(contactId)
    }

    override fun onCleared() {
        super.onCleared()
        p2pNetworkManager.setActiveChat(null)
    }

    fun sendMessage(text: String) {
        val contact = _contact.value ?: return
        val contactId = contact.id
        viewModelScope.launch {
            val messageId = UUID.randomUUID().toString()
            p2pNetworkManager.sendMessage(contactId, MessagePayload.encodeText(text), messageId)
            _sendError.value = null

            messageStore.addMessage(contactId, RamMessage(
                id = messageId,
                senderId = "self",
                content = text.toByteArray(Charsets.UTF_8),
                timestamp = System.currentTimeMillis(),
                isOutgoing = true,
                type = MessageType.TEXT
            ))
        }
    }

    /** [isImage] controls both the message type tag and the [MAX_IMAGE_BYTES]/[MAX_FILE_BYTES] cap. */
    fun sendFile(name: String, bytes: ByteArray, isImage: Boolean) {
        val contact = _contact.value ?: return
        val contactId = contact.id
        // Default dispatcher: prepareImage decodes/re-encodes bitmaps — too heavy for Main.
        viewModelScope.launch(Dispatchers.Default) {
            val payload = if (isImage) prepareImage(bytes) else bytes
            val limit = if (isImage) MAX_IMAGE_BYTES else MAX_FILE_BYTES
            if (payload.size > limit) {
                _sendError.value = if (isImage) "Photo too large (max ${MAX_IMAGE_BYTES / 1024 / 1024} MB)."
                else "File too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB)."
                return@launch
            }
            val messageId = UUID.randomUUID().toString()
            p2pNetworkManager.sendMessage(contactId, MessagePayload.encodeAttachment(name, payload, isImage), messageId)
            _sendError.value = null

            messageStore.addMessage(contactId, RamMessage(
                id = messageId,
                senderId = "self",
                content = payload,
                timestamp = System.currentTimeMillis(),
                isOutgoing = true,
                type = if (isImage) MessageType.IMAGE else MessageType.FILE,
                fileName = name
            ))
        }
    }

    /**
     * Re-encodes an outgoing image: downscaled to at most [MAX_IMAGE_DIMENSION] px on the
     * long edge and recompressed as JPEG, lowering quality stepwise until it fits
     * [MAX_IMAGE_BYTES]. Two deliberate effects, both wanted:
     *
     * 1. PRIVACY — going through a Bitmap drops every metadata block the source file had:
     *    EXIF (GPS position!, capture time, camera model), XMP, thumbnails. Gallery images
     *    are the risk here; that's why this ALWAYS re-encodes, even images already small
     *    enough, instead of only shrinking oversized ones. EXIF orientation is applied to
     *    the pixels first so the stripped copy doesn't come out rotated.
     * 2. SPEED — a chat image doesn't need 12 MP. Fewer bytes = fewer 4096-byte chunks =
     *    directly proportionally faster transfer over Tor.
     *
     * Known trade-offs (accepted, privacy-first): animated GIFs are flattened to their
     * first frame, PNG transparency becomes white/black JPEG background. Anything that
     * can't be decoded as an image at all is returned unchanged and left to the normal
     * size check. Attachments sent via the FILE path are untouched by design — file
     * transfer means byte-exact delivery.
     */
    private fun prepareImage(original: ByteArray): ByteArray = runCatching {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(original, 0, original.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return original

        // Power-of-two subsampling gets close to the target cheaply; no exact resize
        // afterwards — a chat image between 1024 and 2048 px is fine either way.
        var sampleSize = 1
        while (bounds.outWidth / (sampleSize * 2) >= MAX_IMAGE_DIMENSION ||
            bounds.outHeight / (sampleSize * 2) >= MAX_IMAGE_DIMENSION
        ) sampleSize *= 2
        val opts = BitmapFactory.Options().apply { inSampleSize = sampleSize }
        var bitmap = BitmapFactory.decodeByteArray(original, 0, original.size, opts) ?: return original

        val orientation = runCatching {
            ExifInterface(original.inputStream())
                .getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
        }.getOrDefault(ExifInterface.ORIENTATION_NORMAL)
        val matrix = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
            ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
            ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.postScale(-1f, 1f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.postScale(1f, -1f)
        }
        if (!matrix.isIdentity) {
            bitmap = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
        }

        var quality = 85
        var out: ByteArray
        do {
            val stream = java.io.ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.JPEG, quality, stream)
            out = stream.toByteArray()
            quality -= 15
        } while (out.size > MAX_IMAGE_BYTES && quality >= 40)
        out
    }.getOrDefault(original)

    /** Camera capture: same as [sendFile] but the bytes never touched disk (see ChatScreen). */
    fun sendImage(bytes: ByteArray) = sendFile("Photo.jpg", bytes, isImage = true)

    // GRAL Säule 5: Revoke — löscht Chat auf beiden Seiten, Kontakt bleibt erhalten
    fun revokeContact() {
        val contact = _contact.value ?: return
        viewModelScope.launch {
            p2pNetworkManager.sendRevokeSignal(contact.id)
            messageStore.zeroizeContact(contact.id)
            _revoked.value = true
        }
    }

    // Closes the address-isolation gap for pairings made before this device had a main onion
    // (SECURITY_CLAIMS.md §8): tells this contact to switch to the current main onion instead of
    // requiring delete+re-pair. Non-destructive — reuses _sendError as a generic status channel
    // (ChatScreen already shows it as a snackbar), same as the delivery-error path.
    fun sendConnectionInfoUpdate() {
        val contact = _contact.value ?: return
        viewModelScope.launch {
            p2pNetworkManager.sendMainOnionUpdate(contact.id)
            _sendError.value = "Updated connection info sent."
        }
    }

    // Cross-platform (iOS-interop) contacts only — see CROSS_PLATFORM_PLAN.md. Manual wire-tag
    // rotation (there's no automatic hourly clock for these contacts, unlike normal ones).
    fun wechsel() {
        val contact = _contact.value ?: return
        if (!contact.crossPlatform) return
        viewModelScope.launch {
            p2pNetworkManager.wechsel(contact.id)
            _sendError.value = "Wechsel sent."
        }
    }

    // ─── Temp Node (NODE_MESH_SPEC.md §7, Node-Mesh contacts only) ────────────────────────────

    private val _tempNodeError = MutableStateFlow<String?>(null)
    val tempNodeError = _tempNodeError.asStateFlow()

    /**
     * Registers [raw] — the exact `unpruuf-node-owner:v1:<address>:<secret>` string a Temp Node
     * instance prints at startup (`node-mesh-server`'s `EPHEMERAL=1` mode, see
     * node-mesh-server/README.md), same format a standard node's setup already uses — as this
     * one chat's Temp Node override, then announces it to the contact. Returns false (and sets
     * [tempNodeError]) if [raw] doesn't parse; the caller's dialog stays open on false so the
     * user can fix a mistyped paste without losing their place.
     */
    fun activateTempNode(raw: String): Boolean {
        val contact = _contact.value ?: return false
        val parsed = NodeMeshManager.parseOwnerConnectionString(raw.trim())
        if (parsed == null) {
            _tempNodeError.value = "That doesn't look like a node connection string."
            return false
        }
        viewModelScope.launch {
            contactDao.updateTempNode(contact.id, parsed.address, parsed.ownerSecret)
            _contact.value = contactDao.getContactById(contact.id)
            p2pNetworkManager.sendTempNodeAnnouncement(contact.id, parsed.address)
        }
        _tempNodeError.value = null
        return true
    }

    /** §7 step 8's explicit clean shutdown — drops the registration and tells the contact. */
    fun deactivateTempNode() {
        val contact = _contact.value ?: return
        viewModelScope.launch {
            contactDao.clearTempNode(contact.id)
            _contact.value = contactDao.getContactById(contact.id)
            p2pNetworkManager.sendTempNodeDeactivate(contact.id)
        }
    }

    fun renameContact(newName: String) {
        val contact = _contact.value ?: return
        viewModelScope.launch {
            contactDao.updateDisplayName(contact.id, newName.trim())
            _contact.value = contactDao.getContactById(contact.id)
        }
    }

    fun getDisplayText(message: RamMessage): String {
        val content = message.content ?: return "[deleted]"
        return when (message.type) {
            MessageType.TEXT -> runCatching { String(content, Charsets.UTF_8) }.getOrDefault("[error]")
            MessageType.FILE -> "📎 ${message.fileName ?: "File"} (${content.size / 1024} KB)"
            MessageType.IMAGE -> "" // rendered as an inline thumbnail instead — see ChatScreen
        }
    }

    companion object {
        const val MAX_FILE_BYTES = 5 * 1024 * 1024
        const val MAX_IMAGE_BYTES = 2 * 1024 * 1024
        // Long-edge cap for outgoing images (see prepareImage) — plenty for a phone
        // screen, and each halving of dimensions quarters the bytes to transfer.
        const val MAX_IMAGE_DIMENSION = 2048
    }
}
