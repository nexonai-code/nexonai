package com.nexonai.unpruuf.domain.group

import com.nexonai.unpruuf.data.db.GroupDao
import com.nexonai.unpruuf.data.model.GroupEntity
import com.nexonai.unpruuf.data.repository.InMemoryMessageStore
import com.nexonai.unpruuf.data.repository.MessageType
import com.nexonai.unpruuf.data.repository.RamMessage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Receiving side of the Groups edition. A group message arrives like any 1:1 message — from one
 * contact, over that contact's own nodes. This class decides where it belongs:
 *
 *  - the group id matches one of my groups AND the sender is one of its members → shown in the group
 *    chat under the name from MY address book (the sender is known from the channel, not claimed);
 *  - the id matches nothing, or the sender is not in my member list → NOT shown in any chat, only
 *    listed as a notice ("Anna wrote to a group you are not part of");
 *  - the sender's member count differs from mine → the chat shows a warning, because then somebody's
 *    list differs and messages may not reach everyone.
 *
 * Everything here is RAM only and wiped with the messages (see InMemoryMessageStore.addWipeListener).
 */
@Singleton
class GroupInbox @Inject constructor(
    private val groupDao: GroupDao,
    private val messageStore: InMemoryMessageStore
) {
    enum class Decision { SHOW, UNKNOWN_GROUP, NOT_A_MEMBER }

    /** A message that was not shown in any chat. Holds no text, only who and why. */
    data class Notice(val contactId: String, val groupId: String, val decision: Decision, val at: Long)

    private val _notices = MutableStateFlow<List<Notice>>(emptyList())
    val notices: StateFlow<List<Notice>> = _notices.asStateFlow()

    /** groupId → (contactId → member count that contact reported) for contacts whose count differs from mine. */
    private val _mismatches = MutableStateFlow<Map<String, Map<String, Int>>>(emptyMap())
    val mismatches: StateFlow<Map<String, Map<String, Int>>> = _mismatches.asStateFlow()

    init {
        messageStore.addWipeListener { clear() }
    }

    fun clear() {
        _notices.value = emptyList()
        _mismatches.value = emptyMap()
    }

    /** Returns true if the message was accepted (shown or noticed); the caller ACKs either way. */
    suspend fun receive(senderContactId: String, groupIdBytes: ByteArray, memberCount: Int, text: String) {
        val gid = GroupCode.hex(groupIdBytes)
        val group = groupDao.getById(gid)
        when (decide(group, senderContactId)) {
            Decision.UNKNOWN_GROUP -> addNotice(Notice(senderContactId, gid, Decision.UNKNOWN_GROUP, System.currentTimeMillis()))
            Decision.NOT_A_MEMBER -> addNotice(Notice(senderContactId, gid, Decision.NOT_A_MEMBER, System.currentTimeMillis()))
            Decision.SHOW -> {
                val g = group!!
                val key = chatKey(g.id)
                messageStore.addMessage(key, RamMessage(
                    id = UUID.randomUUID().toString(),
                    senderId = senderContactId,
                    content = text.toByteArray(Charsets.UTF_8),
                    timestamp = System.currentTimeMillis(),
                    isOutgoing = false,
                    type = MessageType.TEXT
                ))
                messageStore.markUnread(key)
                val own = ownMemberCount(g)
                _mismatches.update { all ->
                    val perGroup = (all[g.id] ?: emptyMap()).toMutableMap()
                    if (memberCount != own) perGroup[senderContactId] = memberCount else perGroup.remove(senderContactId)
                    all.toMutableMap().apply { if (perGroup.isEmpty()) remove(g.id) else put(g.id, perGroup) }
                }
            }
        }
    }

    fun dismissNotices() { _notices.value = emptyList() }

    private fun addNotice(n: Notice) {
        _notices.update { (it.filterNot { o -> o.contactId == n.contactId && o.groupId == n.groupId && o.decision == n.decision } + n).takeLast(MAX_NOTICES) }
    }

    companion object {
        const val MAX_NOTICES = 20

        /** RAM key under which a group's messages live in [InMemoryMessageStore] (contact ids never start with "g:"). */
        fun chatKey(groupId: String) = "g:$groupId"

        /** Members I count, including me. */
        fun ownMemberCount(group: GroupEntity) = group.members().size + 1

        fun decide(group: GroupEntity?, senderContactId: String): Decision = when {
            group == null -> Decision.UNKNOWN_GROUP
            senderContactId !in group.members() -> Decision.NOT_A_MEMBER
            else -> Decision.SHOW
        }
    }
}
