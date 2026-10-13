package com.nexonai.unpruuf.screens.groups

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.nexonai.unpruuf.R
import com.nexonai.unpruuf.domain.group.GroupManager
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GroupChatScreen(
    groupId: String,
    onNavigateBack: () -> Unit,
    onEdit: () -> Unit,
    viewModel: GroupChatViewModel = hiltViewModel()
) {
    LaunchedEffect(groupId) { viewModel.open(groupId) }
    val group by viewModel.group.collectAsState()
    val messages by viewModel.messages.collectAsState()
    val names by viewModel.contactNames.collectAsState()
    val mismatches by viewModel.mismatches.collectAsState()
    val delivered by viewModel.delivered.collectAsState()
    var draft by remember { mutableStateOf("") }
    val listState = rememberLazyListState()
    val timeFmt = remember { SimpleDateFormat("HH:mm", Locale.getDefault()) }

    LaunchedEffect(messages.size) { if (messages.isNotEmpty()) listState.animateScrollToItem(messages.lastIndex) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(group?.name ?: "")
                        val memberNames = group?.members()?.mapNotNull { names[it] }.orEmpty()
                        Text(
                            stringResource(R.string.group_chat_members, memberNames.size + 1, memberNames.joinToString(", ")),
                            style = MaterialTheme.typography.bodySmall, maxLines = 1,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                },
                navigationIcon = { IconButton(onClick = onNavigateBack) { Icon(Icons.Default.ArrowBack, stringResource(R.string.groups_cd_back)) } },
                actions = { IconButton(onClick = onEdit) { Icon(Icons.Default.Edit, stringResource(R.string.group_cd_edit)) } }
            )
        },
        bottomBar = {
            Row(
                modifier = Modifier.fillMaxWidth().padding(8.dp).navigationBarsPadding().imePadding(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedTextField(
                    value = draft, onValueChange = { draft = it.take(GroupManager.MAX_TEXT_LENGTH) },
                    modifier = Modifier.weight(1f),
                    placeholder = { Text(stringResource(R.string.group_message_hint)) },
                    maxLines = 5
                )
                Spacer(Modifier.width(8.dp))
                FilledIconButton(
                    onClick = { viewModel.send(draft); draft = "" },
                    enabled = draft.isNotBlank()
                ) { Icon(Icons.Default.Send, stringResource(R.string.group_cd_send)) }
            }
        }
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            if (mismatches.isNotEmpty()) {
                val own = (group?.members()?.size ?: 0) + 1
                Card(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)
                ) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.Top) {
                        Icon(Icons.Default.Warning, null, tint = MaterialTheme.colorScheme.onErrorContainer)
                        Spacer(Modifier.width(8.dp))
                        Column {
                            Text(stringResource(R.string.group_mismatch_title), style = MaterialTheme.typography.titleSmall,
                                color = MaterialTheme.colorScheme.onErrorContainer)
                            mismatches.forEach { (contactId, theirs) ->
                                Text(
                                    stringResource(R.string.group_mismatch_line, names[contactId] ?: stringResource(R.string.groups_unknown_contact), theirs, own),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onErrorContainer
                                )
                            }
                        }
                    }
                }
            }
            if (messages.isEmpty()) {
                Box(Modifier.weight(1f).fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                    Text(stringResource(R.string.group_chat_empty), textAlign = TextAlign.Center,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            } else {
                LazyColumn(
                    state = listState, modifier = Modifier.weight(1f).fillMaxWidth(),
                    contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(messages, key = { it.id }) { m ->
                        val mine = m.isOutgoing
                        Column(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalAlignment = if (mine) Alignment.End else Alignment.Start
                        ) {
                            Column(
                                modifier = Modifier
                                    .widthIn(max = 300.dp)
                                    .background(
                                        if (mine) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant,
                                        RoundedCornerShape(14.dp)
                                    )
                                    .padding(horizontal = 12.dp, vertical = 8.dp)
                            ) {
                                if (!mine) {
                                    Text(
                                        names[m.senderId] ?: stringResource(R.string.groups_unknown_contact),
                                        style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary
                                    )
                                }
                                Text(m.content?.let { String(it, Charsets.UTF_8) } ?: "")
                            }
                            val status = if (mine) {
                                val (ok, total) = viewModel.progress(m.id, delivered)
                                " · " + stringResource(R.string.group_delivery, ok, total)
                            } else ""
                            Text(timeFmt.format(Date(m.timestamp)) + status, style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
    }
}
