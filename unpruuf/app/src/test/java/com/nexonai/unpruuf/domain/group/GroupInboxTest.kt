package com.nexonai.unpruuf.domain.group

import com.nexonai.unpruuf.data.db.GroupDao
import com.nexonai.unpruuf.data.model.GroupEntity
import com.nexonai.unpruuf.data.repository.InMemoryMessageStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test

private class FakeGroupDao : GroupDao {
    val all = MutableStateFlow<List<GroupEntity>>(emptyList())
    override fun observeAll(): Flow<List<GroupEntity>> = all
    override suspend fun getAllOnce() = all.value
    override suspend fun getById(id: String) = all.value.firstOrNull { it.id == id }
    override fun observeById(id: String): Flow<GroupEntity?> = all.map { l -> l.firstOrNull { it.id == id } }
    override suspend fun upsert(group: GroupEntity) { all.value = all.value.filter { it.id != group.id } + group }
    override suspend fun deleteById(id: String) { all.value = all.value.filter { it.id != id } }
}

class GroupInboxTest {
    private val code = GroupCode.generate()
    private val gid = GroupCode.groupId(code)
    private val gidHex = GroupCode.hex(gid)

    private fun setup(vararg members: String): Triple<GroupInbox, InMemoryMessageStore, FakeGroupDao> {
        val dao = FakeGroupDao()
        runBlocking { dao.upsert(GroupEntity(gidHex, "Team", code, members.joinToString(","))) }
        val store = InMemoryMessageStore()
        return Triple(GroupInbox(dao, store), store, dao)
    }

    private fun texts(store: InMemoryMessageStore) =
        store.getMessagesForContact(GroupInbox.chatKey(gidHex)).map { it.senderId to String(it.content!!, Charsets.UTF_8) }

    @Test fun memberMessageIsShownUnderSenderAndMarkedUnread() = runBlocking {
        val (inbox, store, _) = setup("anna", "bob")
        inbox.receive("anna", gid, 3, "hello team")
        assertEquals(listOf("anna" to "hello team"), texts(store))
        assertTrue(GroupInbox.chatKey(gidHex) in store.unreadContactIds.value)
        assertTrue(inbox.notices.value.isEmpty())
        assertTrue(inbox.mismatches.value.isEmpty())
    }

    @Test fun nonMemberIsNotShownButNoticed() = runBlocking {
        val (inbox, store, _) = setup("anna", "bob")
        inbox.receive("mallory", gid, 3, "psst")
        assertTrue(texts(store).isEmpty())
        val n = inbox.notices.value.single()
        assertEquals("mallory", n.contactId)
        assertEquals(GroupInbox.Decision.NOT_A_MEMBER, n.decision)
    }

    @Test fun unknownGroupIsNotShownButNoticed() = runBlocking {
        val (inbox, store, _) = setup("anna")
        inbox.receive("anna", GroupCode.groupId(GroupCode.generate()), 2, "wrong group")
        assertTrue(texts(store).isEmpty())
        assertEquals(GroupInbox.Decision.UNKNOWN_GROUP, inbox.notices.value.single().decision)
    }

    @Test fun differingMemberCountRaisesAndClearsTheWarning() = runBlocking {
        val (inbox, _, _) = setup("anna", "bob")           // I count 3 with myself
        inbox.receive("anna", gid, 4, "we are four")      // anna's list is longer
        assertEquals(mapOf(gidHex to mapOf("anna" to 4)), inbox.mismatches.value)
        inbox.receive("anna", gid, 3, "fixed it")         // now equal
        assertTrue(inbox.mismatches.value.isEmpty())
    }

    @Test fun repeatedNoticesFromTheSamePersonAreMerged() = runBlocking {
        val (inbox, _, _) = setup("anna")
        repeat(5) { inbox.receive("mallory", gid, 2, "x$it") }
        assertEquals(1, inbox.notices.value.size)
    }

    @Test fun noticesAreCapped() = runBlocking {
        val (inbox, _, _) = setup("anna")
        repeat(GroupInbox.MAX_NOTICES + 10) { inbox.receive("m$it", gid, 2, "x") }
        assertEquals(GroupInbox.MAX_NOTICES, inbox.notices.value.size)
    }

    @Test fun lockingTheAppWipesMessagesAndNotices() = runBlocking {
        val (inbox, store, _) = setup("anna")
        inbox.receive("anna", gid, 2, "secret")
        inbox.receive("mallory", gid, 2, "x")
        store.zeroizeAll()
        assertTrue(texts(store).isEmpty())
        assertTrue(inbox.notices.value.isEmpty())
        assertTrue(inbox.mismatches.value.isEmpty())
    }

    @Test fun deletedMessageContentIsZeroized() = runBlocking {
        val (inbox, store, _) = setup("anna")
        inbox.receive("anna", gid, 2, "secret")
        val msg = store.getMessagesForContact(GroupInbox.chatKey(gidHex)).single()
        store.zeroizeContact(GroupInbox.chatKey(gidHex))
        assertNull(msg.content)
    }
}
