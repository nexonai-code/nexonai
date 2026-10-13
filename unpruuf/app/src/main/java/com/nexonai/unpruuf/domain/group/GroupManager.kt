package com.nexonai.unpruuf.domain.group

import com.nexonai.unpruuf.data.db.ContactDao
import com.nexonai.unpruuf.data.db.GroupDao
import com.nexonai.unpruuf.data.model.GroupEntity
import com.nexonai.unpruuf.data.repository.InMemoryMessageStore
import com.nexonai.unpruuf.data.repository.MessageType
import com.nexonai.unpruuf.data.repository.RamMessage
import com.nexonai.unpruuf.domain.network.MessagePayload
import com.nexonai.unpruuf.domain.network.P2PNetworkManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.security.SecureRandom
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Local groups for the Pro Groups edition. A group is nothing but a list on this phone plus a
 * shared code; sending to it is one ordinary 1:1 message per member, each over that member's own
 * nodes and keys. No server learns that a group exists.
 *
 * Deliberate rules:
 *  - at most [MAX_GROUP_SIZE] people including me (every message costs one packet per member);
 *  - members are picked from my contacts only; contacts are only ever paired with other Groups
 *    installs (AppEdition.canAdd), so each of them understands a group message;
 *  - the per-member sends are spread over a few seconds in random order, so a watcher of my nodes
 *    does not see "N packets at the same instant" and conclude "group message";
 *  - text only. Photos/files in groups would multiply the transfer by the group size.
 */
@Singleton
class GroupManager @Inject constructor(
    private val groupDao: GroupDao,
    private val contactDao: ContactDao,
    private val p2p: P2PNetworkManager,
    private val messageStore: InMemoryMessageStore
) {
    companion object {
        const val MAX_GROUP_SIZE = 10
        const val MAX_NAME_LENGTH = 40
        const val MAX_TEXT_LENGTH = 2000
        /** Upper bound of the random pause before each member's send. */
        const val SEND_JITTER_MAX_MS = 3500L
    }

    sealed class Result {
        data class Ok(val groupId: String) : Result()
        data class Error(val message: String) : Result()
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val random = SecureRandom()

    /** message id → the per-member send ids, to turn the delivery acknowledgements into "2/4". */
    private val subIds = java.util.concurrent.ConcurrentHashMap<String, List<String>>()

    val groups = groupDao.observeAll()
    fun observe(groupId: String) = groupDao.observeById(groupId)

    fun newCode(): String = GroupCode.generate()

    suspend fun create(name: String, rawCode: String, memberIds: List<String>): Result {
        val cleanName = name.trim()
        if (cleanName.isEmpty()) return Result.Error("Give the group a name.")
        if (cleanName.length > MAX_NAME_LENGTH) return Result.Error("The name is too long (max $MAX_NAME_LENGTH characters).")
        val code = GroupCode.canonical(rawCode) ?: return Result.Error("This code is not valid. Check it for typing mistakes.")
        val members = validMembers(memberIds) ?: return Result.Error("Choose between 1 and ${MAX_GROUP_SIZE - 1} members from your contacts.")
        val id = GroupCode.groupIdHex(code)
        if (groupDao.getById(id) != null) return Result.Error("You already have a group with this code.")
        groupDao.upsert(GroupEntity(id = id, name = cleanName, code = code, memberIds = members.joinToString(",")))
        return Result.Ok(id)
    }

    suspend fun update(groupId: String, name: String, memberIds: List<String>): Result {
        val g = groupDao.getById(groupId) ?: return Result.Error("This group no longer exists.")
        val cleanName = name.trim()
        if (cleanName.isEmpty() || cleanName.length > MAX_NAME_LENGTH) return Result.Error("Give the group a name (max $MAX_NAME_LENGTH characters).")
        val members = validMembers(memberIds) ?: return Result.Error("Choose between 1 and ${MAX_GROUP_SIZE - 1} members from your contacts.")
        groupDao.upsert(g.copy(name = cleanName, memberIds = members.joinToString(",")))
        return Result.Ok(groupId)
    }

    /** Removes the group from this phone only. The others keep theirs until they remove it too. */
    suspend fun delete(groupId: String) {
        groupDao.deleteById(groupId)
        messageStore.zeroizeContact(GroupInbox.chatKey(groupId))
    }

    /**
     * Sends [text] to every member. Returns the id of the local copy (shown in the chat at once),
     * or null if there is nothing to send or nobody to send to.
     */
    suspend fun send(groupId: String, text: String): String? {
        val body = text.trim().take(MAX_TEXT_LENGTH)
        if (body.isEmpty()) return null
        val group = groupDao.getById(groupId) ?: return null
        val existing = contactDao.getAllContactsOnce().filter { it.nodeMesh }.map { it.id }.toSet()
        val targets = group.members().filter { it in existing }
        if (targets.isEmpty()) return null

        val messageId = UUID.randomUUID().toString()
        val perMember = targets.shuffled(random).associateWith { UUID.randomUUID().toString() }
        subIds[messageId] = perMember.values.toList()
        messageStore.addMessage(GroupInbox.chatKey(groupId), RamMessage(
            id = messageId,
            senderId = "self",
            content = body.toByteArray(Charsets.UTF_8),
            timestamp = System.currentTimeMillis(),
            isOutgoing = true,
            type = MessageType.TEXT
        ))

        // The count is the stored list's size + me, the same number every receiver computes for its own list.
        val payload = MessagePayload.encodeGroupText(GroupCode.groupId(group.code), GroupInbox.ownMemberCount(group), body)
        scope.launch {
            for ((contactId, subId) in perMember) {
                delay((random.nextDouble() * SEND_JITTER_MAX_MS).toLong())
                p2p.sendMessage(contactId, payload, subId)
            }
        }
        return messageId
    }

    /** (delivered, total) for one of my outgoing group messages, given the set of acknowledged send ids. */
    fun progress(messageId: String, delivered: Set<String>): Pair<Int, Int> {
        val subs = subIds[messageId] ?: return 0 to 0
        return subs.count { it in delivered } to subs.size
    }

    /** Contacts that may become members: Node-Mesh contacts only (the Groups edition pairs nothing else). */
    suspend fun eligibleContacts() = contactDao.getAllContactsOnce().filter { it.nodeMesh }.sortedBy { it.displayName.lowercase() }

    private suspend fun validMembers(ids: List<String>): List<String>? {
        val eligible = contactDao.getAllContactsOnce().filter { it.nodeMesh }.map { it.id }.toSet()
        val members = ids.distinct().filter { it in eligible }
        return members.takeIf { it.size in 1..(MAX_GROUP_SIZE - 1) }
    }
}
