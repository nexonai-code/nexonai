package com.nexonai.unpruuf.data.repository

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

enum class MessageType { TEXT, FILE, IMAGE }

data class RamMessage(
    val id: String,
    val senderId: String,
    var content: ByteArray?,
    val timestamp: Long,
    val isOutgoing: Boolean = false,
    val type: MessageType = MessageType.TEXT,
    /** Original filename for [MessageType.FILE]/[MessageType.IMAGE], else null. */
    val fileName: String? = null
) {
    fun zeroize() {
        content?.indices?.forEach { i -> content!![i] = 0 }
        content = null
    }
}

@Singleton
class InMemoryMessageStore @Inject constructor() {

    companion object {
        // Nachrichten leben höchstens 5 Minuten im RAM, solange die App offen ist.
        const val MESSAGE_TTL_MS = 5 * 60 * 1000L
        private const val SWEEP_INTERVAL_MS = 15 * 1000L
    }

    private val _messages = MutableStateFlow<Map<String, List<RamMessage>>>(emptyMap())
    val messages: StateFlow<Map<String, List<RamMessage>>> = _messages.asStateFlow()

    // Contacts with a message that hasn't been viewed yet (shown as a green dot
    // in the contact list). Cleared when the chat with that contact is opened.
    private val _unreadContactIds = MutableStateFlow<Set<String>>(emptySet())
    val unreadContactIds: StateFlow<Set<String>> = _unreadContactIds.asStateFlow()

    fun markUnread(contactId: String) {
        _unreadContactIds.update { it + contactId }
    }

    fun clearUnread(contactId: String) {
        _unreadContactIds.update { it - contactId }
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    init {
        scope.launch {
            while (isActive) {
                delay(SWEEP_INTERVAL_MS)
                expireOldMessages()
            }
        }
    }

    fun addMessage(contactId: String, message: RamMessage) {
        _messages.update { current ->
            val list = current[contactId]?.toMutableList() ?: mutableListOf()
            list.add(message)
            current.toMutableMap().apply { put(contactId, list) }
        }
    }

    fun getMessagesForContact(contactId: String): List<RamMessage> {
        return _messages.value[contactId] ?: emptyList()
    }

    // Überschreibt abgelaufene Nachrichten (> TTL) mit Nullen und entfernt sie.
    private fun expireOldMessages() {
        val cutoff = System.currentTimeMillis() - MESSAGE_TTL_MS
        var changed = false
        val next = mutableMapOf<String, List<RamMessage>>()
        _messages.value.forEach { (contactId, list) ->
            val (expired, kept) = list.partition { it.timestamp < cutoff }
            if (expired.isNotEmpty()) {
                expired.forEach { it.zeroize() }
                changed = true
            }
            if (kept.isNotEmpty()) next[contactId] = kept
        }
        if (changed) _messages.value = next
    }

    // Wird vom ScreenLockReceiver / Lifecycle aufgerufen
    fun zeroizeAll() {
        _messages.value.values.flatten().forEach { it.zeroize() }
        _messages.value = emptyMap()
        _unreadContactIds.value = emptySet()
    }

    fun zeroizeContact(contactId: String) {
        _messages.value[contactId]?.forEach { it.zeroize() }
        _messages.update { current ->
            current.toMutableMap().apply { remove(contactId) }
        }
        clearUnread(contactId)
    }
}
