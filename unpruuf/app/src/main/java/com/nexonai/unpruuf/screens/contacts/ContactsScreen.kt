package com.nexonai.unpruuf.screens.contacts

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.VerifiedUser
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.nexonai.unpruuf.data.model.Contact
import kotlinx.coroutines.launch

// Fixed "new message" green, independent of the per-edition accent color
// (Standard's accent is already teal/green, so a distinct hue avoids confusion).
private val UnreadDotColor = Color(0xFF37C871)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ContactsScreen(
    onContactClick: (Contact) -> Unit,
    onAddContact: () -> Unit,
    onNavigateToSettings: () -> Unit,
    onVerifyContact: (Contact) -> Unit,
    viewModel: ContactsViewModel = hiltViewModel()
) {
    val contacts by viewModel.contacts.collectAsState()
    val unreadContactIds by viewModel.unreadContactIds.collectAsState()
    val legacyContactIds by viewModel.legacyContactIds.collectAsState()
    val torActive by viewModel.torActive.collectAsState()
    val selfReachable by viewModel.selfReachable.collectAsState()
    var contactToRevoke by remember { mutableStateOf<Contact?>(null) }
    var contactToRename by remember { mutableStateOf<Contact?>(null) }
    var renameText by remember { mutableStateOf("") }
    var legacyBannerDismissed by remember { mutableStateOf(false) }
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = {
                    // Wordmark instead of a screen label — this list IS the app's home.
                    Text(
                        buildAnnotatedString {
                            withStyle(SpanStyle(color = MaterialTheme.colorScheme.primary)) { append("un") }
                            append("pruuf")
                        },
                        fontWeight = FontWeight.Bold
                    )
                },
                actions = {
                    // Tor state, promoted from a buried notification to a live pill.
                    TorStatusPill(active = torActive, selfReachable = selfReachable)
                    Spacer(Modifier.width(6.dp))
                    IconButton(onClick = onNavigateToSettings) {
                        Icon(Icons.Default.Settings, "Settings")
                    }
                }
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = onAddContact,
                shape = RoundedCornerShape(16.dp),
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary
            ) {
                Icon(Icons.Default.QrCodeScanner, "Add contact")
            }
        }
    ) { padding ->
        Column(modifier = Modifier.padding(padding)) {
        if (legacyContactIds.isNotEmpty() && !legacyBannerDismissed) {
            LegacyOnionBanner(
                count = legacyContactIds.size,
                onMigrate = {
                    viewModel.migrateLegacyContacts(legacyContactIds)
                    legacyBannerDismissed = true
                    scope.launch {
                        snackbarHostState.showSnackbar("Updated connection info sent.")
                    }
                },
                onDismiss = { legacyBannerDismissed = true }
            )
        }
        if (contacts.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .weight(1f),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        Icons.Default.People,
                        null,
                        modifier = Modifier.size(64.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(16.dp))
                    Text(
                        "No contacts yet",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Scan a QR code to add a contact",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(24.dp))
                    Button(onClick = onAddContact) {
                        Icon(Icons.Default.QrCodeScanner, null)
                        Spacer(Modifier.width(8.dp))
                        Text("Scan QR code")
                    }
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .weight(1f),
                contentPadding = PaddingValues(vertical = 8.dp)
            ) {
                items(contacts, key = { it.id }) { contact ->
                    ContactListItem(
                        contact = contact,
                        hasUnread = contact.id in unreadContactIds,
                        lanConnected = viewModel.isLanPeer(contact.id),
                        onClick = { onContactClick(contact) },
                        onRename = {
                            renameText = contact.displayName
                            contactToRename = contact
                        },
                        onRevoke = { contactToRevoke = contact },
                        onVerify = { onVerifyContact(contact) }
                    )
                }
            }
        }
        }
    }

    contactToRename?.let { contact ->
        AlertDialog(
            onDismissRequest = { contactToRename = null },
            title = { Text("Rename contact") },
            text = {
                OutlinedTextField(
                    value = renameText,
                    onValueChange = { renameText = it },
                    label = { Text("Name") },
                    singleLine = true
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        if (renameText.isNotBlank()) {
                            viewModel.renameContact(contact.id, renameText.trim())
                        }
                        contactToRename = null
                    }
                ) { Text("Save") }
            },
            dismissButton = {
                TextButton(onClick = { contactToRename = null }) { Text("Cancel") }
            }
        )
    }

    contactToRevoke?.let { contact ->
        AlertDialog(
            onDismissRequest = { contactToRevoke = null },
            title = { Text("Delete contact") },
            text = {
                Text("Do you really want to delete ${contact.displayName}? The contact and all messages will be permanently deleted on both devices immediately.")
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.revokeContact(contact)
                        contactToRevoke = null
                    }
                ) {
                    Text("Delete", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { contactToRevoke = null }) {
                    Text("Cancel")
                }
            }
        )
    }
}

// Nudges the user to migrate contacts whose copy of this device's address may be stale
// (see ContactsViewModel.legacyContactIds) instead of leaving that to be noticed by accident.
// Deliberately a one-tap suggestion, not a silent automatic migration — the user decides when.
@Composable
private fun LegacyOnionBanner(
    count: Int,
    onMigrate: () -> Unit,
    onDismiss: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                Icons.Default.Sync,
                null,
                tint = MaterialTheme.colorScheme.onSecondaryContainer
            )
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    if (count == 1) "1 contact may have an outdated address for this device"
                    else "$count contacts may have an outdated address for this device",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSecondaryContainer
                )
                Text(
                    "Send your current connection info so they keep reaching you reliably.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSecondaryContainer
                )
                Spacer(Modifier.height(8.dp))
                Row {
                    TextButton(onClick = onMigrate) { Text("Update now") }
                    TextButton(onClick = onDismiss) { Text("Not now") }
                }
            }
        }
    }
}

// Three honest states, not two: CONNECTING (Tor not bootstrapped), TOR ACTIVE
// (bootstrapped, and the last self-reachability check didn't fail), RECONNECTING
// (Tor runs, but the device's own hidden service failed its last self-check and the
// self-heal loop is working on it). "Tor active" alone said nothing about whether
// anyone could actually REACH this device — which is the state that matters.
@Composable
private fun TorStatusPill(active: Boolean, selfReachable: Boolean?) {
    val reconnecting = active && selfReachable == false
    val fg = when {
        !active || reconnecting -> MaterialTheme.colorScheme.tertiary
        else -> MaterialTheme.colorScheme.primary
    }
    val bg = if (active && !reconnecting) MaterialTheme.colorScheme.primaryContainer
    else MaterialTheme.colorScheme.surfaceVariant
    Surface(
        color = bg,
        shape = RoundedCornerShape(50),
        border = BorderStroke(1.dp, fg.copy(alpha = 0.25f))
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp)
        ) {
            Box(
                Modifier
                    .size(6.dp)
                    .clip(CircleShape)
                    .background(fg)
            )
            Spacer(Modifier.width(6.dp))
            Text(
                when {
                    !active -> "CONNECTING"
                    reconnecting -> "RECONNECTING"
                    else -> "TOR ACTIVE"
                },
                style = MaterialTheme.typography.labelSmall,
                color = fg
            )
        }
    }
}

@Composable
private fun ContactListItem(
    contact: Contact,
    hasUnread: Boolean,
    lanConnected: Boolean,
    onClick: () -> Unit,
    onRename: () -> Unit,
    onRevoke: () -> Unit,
    onVerify: () -> Unit
) {
    ListItem(
        headlineContent = {
            Text(contact.displayName, fontWeight = FontWeight.Medium)
        },
        supportingContent = {
            // Transport in use instead of a raw onion address — the technical identity
            // stays out of sight; the monospace label voice says how this contact is
            // reachable right now.
            Text(
                if (lanConnected) "same wi-fi · lan" else "direct · via tor",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        },
        leadingContent = {
            Box {
                Box(
                    modifier = Modifier
                        .size(42.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.surfaceVariant),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        contact.displayName.trim().take(1).uppercase().ifEmpty { "•" },
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                if (hasUnread) {
                    Box(
                        modifier = Modifier
                            .size(13.dp)
                            .align(Alignment.TopEnd)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.background)
                            .padding(2.dp)
                            .clip(CircleShape)
                            .background(UnreadDotColor)
                    )
                }
            }
        },
        trailingContent = {
            Row {
                // Safety-number verification (see ContactDetailScreen) — filled/tinted primary
                // once verified, an outline in the muted "unverified" color otherwise, same
                // "icon color carries the state" idea as the rename/delete icons' own colors.
                IconButton(onClick = onVerify) {
                    Icon(
                        if (contact.isVerified) Icons.Default.VerifiedUser else Icons.Outlined.VerifiedUser,
                        if (contact.isVerified) "Verified" else "Verify contact",
                        tint = if (contact.isVerified) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                IconButton(onClick = onRename) {
                    Icon(
                        Icons.Default.Edit,
                        "Rename",
                        tint = MaterialTheme.colorScheme.primary
                    )
                }
                IconButton(onClick = onRevoke) {
                    Icon(
                        Icons.Default.RemoveCircleOutline,
                        "Delete",
                        tint = MaterialTheme.colorScheme.error
                    )
                }
            }
        },
        modifier = Modifier.clickable(onClick = onClick)
    )
    HorizontalDivider()
}
