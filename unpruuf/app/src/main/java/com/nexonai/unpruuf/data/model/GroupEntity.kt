package com.nexonai.unpruuf.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * A group that exists only on this phone (Pro Groups edition). No server, no group key: sending to
 * a group means one ordinary end-to-end encrypted 1:1 message per member.
 *
 * [id] is the hex of [com.nexonai.unpruuf.domain.group.GroupCode.groupId] — the same value on every
 * member's phone, because it is derived from the shared [code]. [memberIds] are THIS phone's
 * contact ids (comma-separated); who they are is each member's own mapping, nothing is shared.
 * The table lives in the encrypted database, like the contacts.
 */
@Entity(tableName = "chat_groups")
data class GroupEntity(
    @PrimaryKey val id: String,
    val name: String,
    val code: String,
    val memberIds: String,
    val createdAt: Long = System.currentTimeMillis()
) {
    fun members(): List<String> = memberIds.split(',').filter { it.isNotBlank() }
}
