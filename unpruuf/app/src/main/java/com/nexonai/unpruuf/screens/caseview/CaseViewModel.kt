package com.nexonai.unpruuf.screens.caseview

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nexonai.unpruuf.data.db.ContactDao
import com.nexonai.unpruuf.data.model.Contact
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

/** "My case" — live view of the case fields the officer's signals keep up to date. */
@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
@HiltViewModel
class CaseViewModel @Inject constructor(
    private val contactDao: ContactDao
) : ViewModel() {
    private val contactId = MutableStateFlow<String?>(null)

    val contact: StateFlow<Contact?> = contactId
        .flatMapLatest { id -> if (id == null) flowOf(null) else contactDao.observeContact(id) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    fun load(id: String) {
        contactId.value = id
    }
}
