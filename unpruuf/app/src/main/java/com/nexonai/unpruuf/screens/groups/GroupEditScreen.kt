package com.nexonai.unpruuf.screens.groups

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.text.KeyboardOptions
import androidx.hilt.navigation.compose.hiltViewModel
import com.nexonai.unpruuf.R
import com.nexonai.unpruuf.domain.group.GroupManager

/**
 * Create a group (groupId == null) or edit one. The code is what makes the groups on different
 * phones the same group: one person generates it, tells the others (read out, or in an existing
 * chat), and everybody creates the group with it and picks the same people from their own contacts.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GroupEditScreen(
    groupId: String?,
    onNavigateBack: () -> Unit,
    onSaved: (String) -> Unit,
    onDeleted: () -> Unit,
    viewModel: GroupEditViewModel = hiltViewModel()
) {
    val contacts by viewModel.contacts.collectAsState()
    val existing by viewModel.existing.collectAsState()
    val error by viewModel.error.collectAsState()
    val done by viewModel.done.collectAsState()
    val deleted by viewModel.deleted.collectAsState()
    val context = LocalContext.current

    LaunchedEffect(groupId) { viewModel.load(groupId) }
    LaunchedEffect(done) { done?.let(onSaved) }
    LaunchedEffect(deleted) { if (deleted) onDeleted() }

    var name by remember(existing) { mutableStateOf(existing?.name ?: "") }
    var code by remember(existing) { mutableStateOf(existing?.code ?: viewModel.suggestedCode) }
    var selected by remember(existing) { mutableStateOf(existing?.members()?.toSet() ?: emptySet()) }
    var confirmDelete by remember { mutableStateOf(false) }
    val editing = existing != null
    val codeOk = viewModel.codeLooksValid(code)
    val max = GroupManager.MAX_GROUP_SIZE - 1

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(if (editing) R.string.group_edit_title else R.string.group_new_title)) },
                navigationIcon = { IconButton(onClick = onNavigateBack) { Icon(Icons.Default.ArrowBack, stringResource(R.string.groups_cd_back)) } }
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier.padding(padding).fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                OutlinedTextField(
                    value = name, onValueChange = { name = it.take(GroupManager.MAX_NAME_LENGTH) },
                    label = { Text(stringResource(R.string.group_name_label)) }, singleLine = true, modifier = Modifier.fillMaxWidth()
                )
            }
            item {
                OutlinedTextField(
                    value = code, onValueChange = { if (!editing) code = it.uppercase().take(24) },
                    readOnly = editing,
                    label = { Text(stringResource(R.string.group_code_label)) },
                    supportingText = {
                        Text(
                            when {
                                editing -> stringResource(R.string.group_code_fixed)
                                codeOk -> stringResource(R.string.group_code_ok)
                                else -> stringResource(R.string.group_code_bad)
                            }
                        )
                    },
                    isError = !editing && !codeOk,
                    singleLine = true,
                    textStyle = MaterialTheme.typography.bodyLarge.copy(fontFamily = FontFamily.Monospace),
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
                    modifier = Modifier.fillMaxWidth()
                )
                Row {
                    TextButton(onClick = {
                        com.nexonai.unpruuf.ui.SensitiveClipboard.copy(context, "code", code)
                    }) { Icon(Icons.Default.ContentCopy, null); Spacer(Modifier.width(6.dp)); Text(stringResource(R.string.group_code_copy)) }
                    if (!editing) {
                        TextButton(onClick = { code = viewModel.suggestedCode }) {
                            Icon(Icons.Default.Refresh, null); Spacer(Modifier.width(6.dp)); Text(stringResource(R.string.group_code_suggest))
                        }
                    }
                }
                Text(stringResource(R.string.group_how_it_works), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            item {
                Text(stringResource(R.string.group_members_label, selected.size, max), style = MaterialTheme.typography.titleSmall)
            }
            if (contacts.isEmpty()) {
                item { Text(stringResource(R.string.group_no_contacts), style = MaterialTheme.typography.bodyMedium) }
            }
            items(contacts, key = { it.id }) { c ->
                val on = c.id in selected
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Checkbox(
                        checked = on,
                        onCheckedChange = { checked ->
                            selected = if (checked && selected.size < max) selected + c.id else selected - c.id
                        }
                    )
                    Text(c.displayName, modifier = Modifier.weight(1f))
                }
            }
            item {
                Text(stringResource(R.string.group_same_people), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            error?.let { msg -> item { Text(msg, color = MaterialTheme.colorScheme.error) } }
            item {
                Button(
                    onClick = { viewModel.save(name, code, contacts.map { it.id }.filter { it in selected }) },
                    enabled = name.isNotBlank() && selected.isNotEmpty() && (editing || codeOk),
                    modifier = Modifier.fillMaxWidth()
                ) { Text(stringResource(if (editing) R.string.group_save else R.string.group_create)) }
            }
            if (editing) {
                item {
                    OutlinedButton(onClick = { confirmDelete = true }, modifier = Modifier.fillMaxWidth()) {
                        Text(stringResource(R.string.group_delete), color = MaterialTheme.colorScheme.error)
                    }
                }
            }
        }
    }

    if (confirmDelete) {
        AlertDialog(
            properties = com.nexonai.unpruuf.ui.SecureDialogProperties,
            onDismissRequest = { confirmDelete = false },
            title = { Text(stringResource(R.string.group_delete_title)) },
            text = { Text(stringResource(R.string.group_delete_body)) },
            confirmButton = {
                TextButton(onClick = { confirmDelete = false; viewModel.delete() }) {
                    Text(stringResource(R.string.group_delete), color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text(stringResource(R.string.groups_cancel)) } }
        )
    }
}
