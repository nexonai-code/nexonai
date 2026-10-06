package com.nexonai.unpruuf.screens.nodelists

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nexonai.unpruuf.data.db.ContactDao
import com.nexonai.unpruuf.domain.network.FeedSource
import com.nexonai.unpruuf.domain.network.NodeListFile
import com.nexonai.unpruuf.domain.network.NodeMeshManager
import com.nexonai.unpruuf.domain.network.P2PNetworkManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** One row of the list management screen. */
data class NodeListRow(
    val id: String,
    val name: String,
    val nodeCount: Int,
    val serverCount: Int,
    /** How many contacts were given nodes from this list. */
    val contactCount: Int,
    /** How many contacts the list can carry with nodes of their own (NodeLists.capacity). */
    val capacity: Int
)

/** A parsed file waiting for the user to confirm name and target. */
data class PendingListImport(val file: NodeListFile.Parsed, val newCount: Int)

@HiltViewModel
class NodeListsViewModel @Inject constructor(
    private val nodeMeshManager: NodeMeshManager,
    private val contactDao: ContactDao,
    private val p2pNetworkManager: P2PNetworkManager
) : ViewModel() {

    private val _lists = MutableStateFlow<List<NodeListRow>>(emptyList())
    val lists = _lists.asStateFlow()

    private val _pending = MutableStateFlow<PendingListImport?>(null)
    val pending = _pending.asStateFlow()

    private val _status = MutableStateFlow<String?>(null)
    val status = _status.asStateFlow()

    /** Nodes still free under the device limit — shown so a too-big import is no surprise. */
    private val _freeSlots = MutableStateFlow(NodeMeshManager.OWN_NODES_MAX)
    val freeSlots = _freeSlots.asStateFlow()

    // ─── Company feeds: lists kept up to date by the company (rotating onion address) ───
    private val _feeds = MutableStateFlow(nodeMeshManager.getFeedSources())
    val feeds = _feeds.asStateFlow()

    private val _feedUpdating = MutableStateFlow(false)
    val feedUpdating = _feedUpdating.asStateFlow()

    fun addFeed(code: String) {
        if (nodeMeshManager.addFeedSource(code) == null) {
            _status.value = "That is not a valid feed code, or this feed is already added."
            return
        }
        _feeds.value = nodeMeshManager.getFeedSources()
        _status.value = "Feed added. Fetching the current lists…"
        updateFeedsNow()
    }

    fun removeFeed(id: String) {
        nodeMeshManager.removeFeedSource(id)
        _feeds.value = nodeMeshManager.getFeedSources()
        refresh()
        _status.value = "Feed removed. The lists it filled stay until you delete them."
    }

    fun updateFeedsNow() {
        _feedUpdating.value = true
        p2pNetworkManager.updateFeedsNow { updated ->
            _feeds.value = updated
            _feedUpdating.value = false
            refresh()
        }
    }

    init { refresh() }

    fun refresh() {
        viewModelScope.launch {
            val contacts = contactDao.getAllContactsOnce().filter { it.nodeMesh }
            val used = contacts.map { c ->
                NodeMeshManager.parseNodeConnectionStringList(c.myNodeAddresses ?: "")
                    .mapNotNull { NodeMeshManager.parseAddressConnectionString(it) }
                    .toSet()
            }
            val lists = nodeMeshManager.getNodeLists()
            _lists.value = lists.map { l ->
                val members = l.addresses.toSet()
                NodeListRow(l.id, l.name, l.addresses.size, nodeMeshManager.serverCount(l), used.count { u -> u.any { it in members } }, nodeMeshManager.listCapacity(l))
            }
            _freeSlots.value = NodeMeshManager.OWN_NODES_MAX - nodeMeshManager.getMyNodePool().size
        }
    }

    /** Reads the text of an exported list (file content or pasted). Shows the confirm step or an error. */
    fun previewImport(text: String) {
        val file = NodeListFile.parse(text.trim())
        if (file == null) {
            _status.value = "That is not a node list. Use the file from the server's setup page (\"Liste als Datei speichern\")."
            return
        }
        val known = nodeMeshManager.getMyNodePool().map { it.address }.toSet()
        _pending.value = PendingListImport(file, file.addresses.count { it !in known })
    }

    fun cancelImport() { _pending.value = null }

    /** [targetListId] null = a new list called [name]. */
    fun confirmImport(name: String, targetListId: String?) {
        val file = _pending.value?.file ?: return
        when (val r = nodeMeshManager.importNodeList(file, name, targetListId)) {
            is NodeMeshManager.ImportResult.Ok -> {
                _status.value = "\"${r.listName}\": ${r.added} new node(s), ${r.total} in the list."
                _pending.value = null
            }
            is NodeMeshManager.ImportResult.NoRoom -> {
                _status.value = "Not imported: needs room for ${r.needed} more nodes, only ${r.free} free " +
                    "(limit ${NodeMeshManager.OWN_NODES_MAX}). Delete a list you no longer use first."
                _pending.value = null
            }
            NodeMeshManager.ImportResult.UnknownList -> {
                _status.value = "That list no longer exists."
                _pending.value = null
            }
        }
        refresh()
    }

    fun rename(listId: String, name: String) {
        nodeMeshManager.renameNodeList(listId, name)
        refresh()
    }

    /** Removes the list and its nodes from this device. */
    fun delete(listId: String) {
        val removed = nodeMeshManager.deleteNodeList(listId)
        _status.value = "List deleted, $removed node(s) removed from this device."
        refresh()
    }

    fun clearStatus() { _status.value = null }
}
