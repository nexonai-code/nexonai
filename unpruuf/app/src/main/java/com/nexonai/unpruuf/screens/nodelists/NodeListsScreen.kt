package com.nexonai.unpruuf.screens.nodelists

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.nexonai.unpruuf.R

/**
 * Node lists: named groups of this device's own nodes. A list comes from the file a Business Node
 * server exports (setup page → "Liste als Datei speichern"), or is built from nodes added by QR.
 * When a contact is added, one list is chosen and the contact gets three nodes from it.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NodeListsScreen(
    onNavigateBack: () -> Unit,
    viewModel: NodeListsViewModel = hiltViewModel()
) {
    val lists by viewModel.lists.collectAsState()
    val pending by viewModel.pending.collectAsState()
    val status by viewModel.status.collectAsState()
    val freeSlots by viewModel.freeSlots.collectAsState()
    val feeds by viewModel.feeds.collectAsState()
    val feedUpdating by viewModel.feedUpdating.collectAsState()
    var feedCode by remember { mutableStateOf("") }
    var removingFeed by remember { mutableStateOf<com.nexonai.unpruuf.domain.network.FeedSource?>(null) }
    val context = LocalContext.current

    var pastedText by remember { mutableStateOf("") }
    var renaming by remember { mutableStateOf<NodeListRow?>(null) }
    var deleting by remember { mutableStateOf<NodeListRow?>(null) }

    val pickFile = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri != null) {
            val text = runCatching {
                context.contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText().take(500_000) }
            }.getOrNull()
            if (text != null) viewModel.previewImport(text) else viewModel.previewImport("")
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.node_lists_title)) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) { Icon(Icons.Default.ArrowBack, contentDescription = null) }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(stringResource(R.string.node_lists_intro), style = MaterialTheme.typography.bodyMedium)

            if (lists.isEmpty()) {
                Text(
                    stringResource(R.string.node_lists_empty),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            lists.forEach { row ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp)) {
                        Text(row.name, style = MaterialTheme.typography.titleMedium)
                        Spacer(Modifier.height(4.dp))
                        Text(
                            stringResource(R.string.node_lists_row_detail, row.nodeCount, row.serverCount, row.contactCount),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            stringResource(R.string.node_lists_row_capacity, row.capacity, row.contactCount),
                            style = MaterialTheme.typography.bodyMedium,
                            color = if (row.contactCount > row.capacity) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface
                        )
                        if (row.contactCount > row.capacity) {
                            Text(
                                stringResource(R.string.node_lists_row_over),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error
                            )
                        }
                        Spacer(Modifier.height(8.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(onClick = { renaming = row }) { Text(stringResource(R.string.node_lists_rename)) }
                            OutlinedButton(onClick = { deleting = row }) {
                                Text(stringResource(R.string.node_lists_delete), color = MaterialTheme.colorScheme.error)
                            }
                        }
                    }
                }
            }

            HorizontalDivider()
            Text(stringResource(R.string.node_lists_import_title), style = MaterialTheme.typography.titleSmall)
            Text(
                stringResource(R.string.node_lists_import_hint, freeSlots),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Button(onClick = { pickFile.launch(arrayOf("*/*")) }, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.node_lists_import_file))
            }
            OutlinedTextField(
                value = pastedText,
                onValueChange = { pastedText = it },
                label = { Text(stringResource(R.string.node_lists_paste_field)) },
                minLines = 3,
                maxLines = 6,
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedButton(
                onClick = { viewModel.previewImport(pastedText) },
                enabled = pastedText.isNotBlank(),
                modifier = Modifier.fillMaxWidth()
            ) { Text(stringResource(R.string.node_lists_import_pasted)) }
            Text(
                stringResource(R.string.node_lists_secret_warning),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error
            )

            HorizontalDivider()
            Text(stringResource(R.string.node_feeds_title), style = MaterialTheme.typography.titleSmall)
            Text(
                stringResource(R.string.node_feeds_hint),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            feeds.forEach { f ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp)) {
                        Text(f.name, style = MaterialTheme.typography.titleMedium)
                        Spacer(Modifier.height(4.dp))
                        Text(
                            if (f.lastUpdatedMs == 0L) stringResource(R.string.node_feeds_never)
                            else stringResource(R.string.node_feeds_last, java.text.DateFormat.getDateTimeInstance().format(java.util.Date(f.lastUpdatedMs))),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        if (f.lastResult.isNotEmpty()) {
                            Text(f.lastResult, style = MaterialTheme.typography.bodyMedium)
                        }
                        Spacer(Modifier.height(8.dp))
                        OutlinedButton(onClick = { removingFeed = f }) {
                            Text(stringResource(R.string.node_lists_delete), color = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }
            if (feeds.isNotEmpty()) {
                Button(onClick = { viewModel.updateFeedsNow() }, enabled = !feedUpdating, modifier = Modifier.fillMaxWidth()) {
                    Text(stringResource(if (feedUpdating) R.string.node_feeds_updating else R.string.node_feeds_update_now))
                }
            }
            OutlinedTextField(
                value = feedCode,
                onValueChange = { feedCode = it },
                label = { Text(stringResource(R.string.node_feeds_code_field)) },
                placeholder = { Text("unpruuf-feed:v1:...") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedButton(
                onClick = { viewModel.addFeed(feedCode); feedCode = "" },
                enabled = feedCode.isNotBlank(),
                modifier = Modifier.fillMaxWidth()
            ) { Text(stringResource(R.string.node_feeds_add)) }
            Text(
                stringResource(R.string.node_feeds_secret_warning),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error
            )

            status?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
                LaunchedEffect(it) {
                    kotlinx.coroutines.delay(8000)
                    viewModel.clearStatus()
                }
            }
        }
    }

    pending?.let { p ->
        var name by remember(p) { mutableStateOf(p.file.name) }
        var targetId by remember(p) { mutableStateOf<String?>(null) }
        AlertDialog(
            onDismissRequest = { viewModel.cancelImport() },
            title = { Text(stringResource(R.string.node_lists_confirm_title)) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(stringResource(R.string.node_lists_confirm_body, p.file.addresses.size, p.newCount))
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it },
                        label = { Text(stringResource(R.string.node_lists_name_field)) },
                        singleLine = true,
                        enabled = targetId == null,
                        modifier = Modifier.fillMaxWidth()
                    )
                    if (lists.isNotEmpty()) {
                        Text(stringResource(R.string.node_lists_target_label), style = MaterialTheme.typography.labelMedium)
                        FilterChip(selected = targetId == null, onClick = { targetId = null }, label = { Text(stringResource(R.string.node_lists_target_new)) })
                        lists.forEach { row ->
                            FilterChip(
                                selected = targetId == row.id,
                                onClick = { targetId = row.id },
                                label = { Text(row.name) }
                            )
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { viewModel.confirmImport(name, targetId) }, enabled = targetId != null || name.isNotBlank()) {
                    Text(stringResource(R.string.node_lists_import_confirm))
                }
            },
            dismissButton = { TextButton(onClick = { viewModel.cancelImport() }) { Text(stringResource(R.string.settings_cancel)) } }
        )
    }

    renaming?.let { row ->
        var newName by remember(row) { mutableStateOf(row.name) }
        AlertDialog(
            onDismissRequest = { renaming = null },
            title = { Text(stringResource(R.string.node_lists_rename)) },
            text = {
                OutlinedTextField(
                    value = newName,
                    onValueChange = { newName = it },
                    label = { Text(stringResource(R.string.node_lists_name_field)) },
                    singleLine = true
                )
            },
            confirmButton = {
                TextButton(onClick = { viewModel.rename(row.id, newName); renaming = null }, enabled = newName.isNotBlank()) {
                    Text(stringResource(R.string.node_lists_save))
                }
            },
            dismissButton = { TextButton(onClick = { renaming = null }) { Text(stringResource(R.string.settings_cancel)) } }
        )
    }

    removingFeed?.let { f ->
        AlertDialog(
            onDismissRequest = { removingFeed = null },
            title = { Text(stringResource(R.string.node_feeds_remove_title, f.name)) },
            text = { Text(stringResource(R.string.node_feeds_remove_body)) },
            confirmButton = {
                TextButton(onClick = { viewModel.removeFeed(f.id); removingFeed = null }) {
                    Text(stringResource(R.string.node_lists_delete), color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = { TextButton(onClick = { removingFeed = null }) { Text(stringResource(R.string.settings_cancel)) } }
        )
    }

    deleting?.let { row ->
        AlertDialog(
            onDismissRequest = { deleting = null },
            title = { Text(stringResource(R.string.node_lists_delete_title, row.name)) },
            text = {
                Text(
                    if (row.contactCount > 0) stringResource(R.string.node_lists_delete_body_contacts, row.nodeCount, row.contactCount)
                    else stringResource(R.string.node_lists_delete_body, row.nodeCount)
                )
            },
            confirmButton = {
                TextButton(onClick = { viewModel.delete(row.id); deleting = null }) {
                    Text(stringResource(R.string.node_lists_delete), color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = { TextButton(onClick = { deleting = null }) { Text(stringResource(R.string.settings_cancel)) } }
        )
    }
}
