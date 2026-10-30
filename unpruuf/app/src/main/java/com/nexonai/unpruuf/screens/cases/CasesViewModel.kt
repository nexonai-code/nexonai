package com.nexonai.unpruuf.screens.cases

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nexonai.unpruuf.data.db.ContactDao
import com.nexonai.unpruuf.data.repository.InMemoryMessageStore
import com.nexonai.unpruuf.domain.WhistleblowerCases
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Whistleblower home: onboarding scan until an organisation is known, then "My cases". */
@HiltViewModel
class CasesViewModel @Inject constructor(
    contactDao: ContactDao,
    messageStore: InMemoryMessageStore,
    private val whistleblowerCases: WhistleblowerCases
) : ViewModel() {

    val organization = whistleblowerCases.organization

    /** Newest first — a case without a number yet (just opened) sorts by its opening time. */
    val cases = contactDao.getAllContacts()
        .map { list -> list.sortedByDescending { it.caseUpdatedAt ?: it.addedAt } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val unreadIds = messageStore.unreadContactIds
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptySet())

    private val _error = MutableStateFlow<String?>(null)
    /** "unreadable" | "not_officer" | "relay" | "old" — mapped to text by the screen. */
    val error = _error.asStateFlow()

    private val _openCase = Channel<String>(Channel.BUFFERED)
    val openCase = _openCase.receiveAsFlow()

    private val _busy = MutableStateFlow(false)
    val busy = _busy.asStateFlow()

    fun onScanned(raw: String) {
        viewModelScope.launch {
            _busy.value = true
            when (val r = whistleblowerCases.connectOrganization(raw)) {
                is WhistleblowerCases.ScanResult.Ok -> { _error.value = null; _openCase.send(r.contactId) }
                is WhistleblowerCases.ScanResult.Invalid -> _error.value = r.reason
            }
            _busy.value = false
        }
    }

    fun newCase() {
        viewModelScope.launch {
            _busy.value = true
            whistleblowerCases.openNewCase()?.let { _openCase.send(it) }
            _busy.value = false
        }
    }

    fun scanOtherOrganization() = whistleblowerCases.forgetOrganization()

    fun clearError() { _error.value = null }
}
