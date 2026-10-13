package com.nexonai.unpruuf.screens.groups

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.background
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.nexonai.unpruuf.R
import com.nexonai.unpruuf.domain.group.GroupInbox

private val UnreadDot = Color(0xFF37C871)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GroupsScreen(
    onNavigateBack: () -> Unit,
    onOpenGroup: (String) -> Unit,
    onNewGroup: () -> Unit,
    viewModel: GroupsViewModel = hiltViewModel()
) {
    val groups by viewModel.groups.collectAsState()
    val names by viewModel.contactNames.collectAsState()
    val unread by viewModel.unread.collectAsState()
    val notices by viewModel.notices.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.groups_title)) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) { Icon(Icons.Default.ArrowBack, stringResource(R.string.groups_cd_back)) }
                }
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = onNewGroup,
                shape = RoundedCornerShape(16.dp),
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary
            ) { Icon(Icons.Default.Add, stringResource(R.string.groups_new)) }
        }
    ) { padding ->
        LazyColumn(modifier = Modifier.padding(padding).fillMaxSize(), contentPadding = PaddingValues(vertical = 8.dp)) {
            if (notices.isNotEmpty()) {
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)
                    ) {
                        Column(Modifier.padding(12.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.Warning, null, tint = MaterialTheme.colorScheme.onErrorContainer)
                                Spacer(Modifier.width(8.dp))
                                Text(stringResource(R.string.groups_notices_title), style = MaterialTheme.typography.titleSmall,
                                    color = MaterialTheme.colorScheme.onErrorContainer)
                            }
                            Spacer(Modifier.height(6.dp))
                            notices.forEach { n ->
                                val who = names[n.contactId] ?: stringResource(R.string.groups_unknown_contact)
                                Text(
                                    if (n.decision == GroupInbox.Decision.UNKNOWN_GROUP) stringResource(R.string.groups_notice_unknown, who)
                                    else stringResource(R.string.groups_notice_not_member, who),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onErrorContainer
                                )
                            }
                            TextButton(onClick = viewModel::dismissNotices) { Text(stringResource(R.string.groups_notices_dismiss)) }
                        }
                    }
                }
            }
            if (groups.isEmpty()) {
                item {
                    Column(
                        modifier = Modifier.fillParentMaxWidth().padding(32.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(Icons.Default.Groups, null, modifier = Modifier.size(64.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.height(16.dp))
                        Text(stringResource(R.string.groups_empty_title), style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.height(8.dp))
                        Text(stringResource(R.string.groups_empty_body), style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            items(groups, key = { it.id }) { g ->
                val memberNames = g.members().mapNotNull { names[it] }
                ListItem(
                    modifier = Modifier.clickable { onOpenGroup(g.id) },
                    leadingContent = { Icon(Icons.Default.Groups, null, tint = MaterialTheme.colorScheme.primary) },
                    headlineContent = { Text(g.name) },
                    supportingContent = {
                        Text(
                            if (memberNames.isEmpty()) stringResource(R.string.groups_no_members)
                            else memberNames.joinToString(", "),
                            maxLines = 1
                        )
                    },
                    trailingContent = {
                        if (GroupInbox.chatKey(g.id) in unread) {
                            Box(Modifier.size(10.dp).clip(CircleShape).background(UnreadDot))
                        }
                    }
                )
            }
        }
    }
}
