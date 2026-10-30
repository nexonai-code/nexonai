package com.nexonai.unpruuf.screens.groups

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nexonai.unpruuf.data.db.ContactDao
import com.nexonai.unpruuf.data.model.Contact
import com.nexonai.unpruuf.data.model.GroupEntity
import com.nexonai.unpruuf.data.repository.InMemoryMessageStore
import com.nexonai.unpruuf.data.repository.RamMessage
import com.nexonai.unpruuf.domain.group.GroupCode
import com.nexonai.unpruuf.domain.group.GroupInbox
import com.nexonai.unpruuf.domain.group.GroupManager
import com.nexonai.unpruuf.domain.network.P2PNetworkManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class GroupsViewModel @Inject constructor(
    private val groupManager: GroupManager,
    private val inbox: GroupInbox,
    contactDao: ContactDao,
    messageStore: InMemoryMessageStore
) : ViewModel() {
    val groups = groupManager.groups.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val contactNames = contactDao.getAllContacts()
        .map { list -> list.associate { it.id to it.displayName } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyMap())
    val unread = messageStore.unreadContactIds.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptySet())
    val notices = inbox.notices.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    fun dismissNotices() = inbox.dismissNotices()
}

@HiltViewModel
class GroupEditViewModel @Inject constructor(
    private val groupManager: GroupManager,
    private val groupDao: com.nexonai.unpruuf.data.db.GroupDao,
    private val inbox: GroupInbox
) : ViewModel() {
    private val _contacts = MutableStateFlow<List<Contact>>(emptyList())
    val contacts: StateFlow<List<Contact>> = _contacts.asStateFlow()
    private val _existing = MutableStateFlow<GroupEntity?>(null)
    val existing: StateFlow<GroupEntity?> = _existing.asStateFlow()
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()
    private val _done = MutableStateFlow<String?>(null)
    /** Set to the group id once saved/created, to navigate onward. */
    val done: StateFlow<String?> = _done.asStateFlow()
    private val _deleted = MutableStateFlow(false)
    val deleted: StateFlow<Boolean> = _deleted.asStateFlow()
    val suggestedCode: String = groupManager.newCode()

    fun load(groupId: String?) {
        viewModelScope.launch {
            _contacts.value = groupManager.eligibleContacts()
            _existing.value = groupId?.let { groupDao.getById(it) }
        }
    }

    fun save(name: String, code: String, members: List<String>) {
        viewModelScope.launch {
            val g = _existing.value
            val r = if (g == null) groupManager.create(name, code, members) else groupManager.update(g.id, name, members)
            when (r) {
                is GroupManager.Result.Ok -> { _error.value = null; _done.value = r.groupId }
                is GroupManager.Result.Error -> _error.value = r.message
            }
        }
    }

    fun delete() {
        val g = _existing.value ?: return
        viewModelScope.launch { groupManager.delete(g.id); _deleted.value = true }
    }

    fun codeLooksValid(code: String) = GroupCode.isValid(code)
}

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class GroupChatViewModel @Inject constructor(
    private val groupManager: GroupManager,
    private val inbox: GroupInbox,
    private val messageStore: InMemoryMessageStore,
    p2p: P2PNetworkManager,
    contactDao: ContactDao
) : ViewModel() {
    private val groupId = MutableStateFlow<String?>(null)

    val group = groupId.flatMapLatest { id -> if (id == null) flowOf(null) else groupManager.observe(id) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val messages = groupId.flatMapLatest { id ->
        if (id == null) flowOf(emptyList<RamMessage>())
        else messageStore.messages.map { it[GroupInbox.chatKey(id)] ?: emptyList() }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val contactNames = contactDao.getAllContacts()
        .map { list -> list.associate { it.id to it.displayName } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyMap())

    /** contactId → member count that contact reported, for contacts whose group differs from mine. */
    val mismatches = combine(groupId, inbox.mismatches) { id, all -> if (id == null) emptyMap() else all[id] ?: emptyMap() }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyMap())

    val delivered = p2p.deliveredIds

    fun open(id: String) {
        groupId.value = id
        messageStore.clearUnread(GroupInbox.chatKey(id))
    }

    fun send(text: String) {
        val id = groupId.value ?: return
        viewModelScope.launch { groupManager.send(id, text) }
    }

    fun progress(messageId: String, delivered: Set<String>) = groupManager.progress(messageId, delivered)
}
