package com.nexonai.unpruuf.screens.chat

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Autorenew
import androidx.compose.material.icons.filled.DeleteForever
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.Router
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import com.nexonai.unpruuf.data.model.Contact
import com.nexonai.unpruuf.data.repository.MessageType
import com.nexonai.unpruuf.data.repository.RamMessage
import com.nexonai.unpruuf.screens.qrpair.PortraitCaptureActivity
import androidx.compose.ui.res.stringResource
import com.nexonai.unpruuf.R
import com.nexonai.unpruuf.domain.AppEdition
import com.nexonai.unpruuf.domain.network.MessageTtl
import kotlinx.coroutines.delay
import java.io.ByteArrayOutputStream
import java.text.SimpleDateFormat
import java.util.*

// How long an outgoing message sits undelivered before ChatScreen admits a cold rendezvous
// might just be slow rather than broken (see the banner this drives, below). Deliberately well
// under P2PNetworkManager's own TOR_CONNECT_TIMEOUT_MS (90s) — the point is to say something
// honest WHILE that first connect is still in flight, not to wait for it to already have failed
// once. 25s is comfortably past a warm/Wi‑Fi send (which delivers in a couple of seconds) but
// well before a cold mobile rendezvous would otherwise look indistinguishable from stuck.
private const val STILL_CONNECTING_HINT_MS = 25_000

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    contactId: String,
    onNavigateBack: () -> Unit,
    onNavigateToSettings: () -> Unit = {},
    viewModel: ChatViewModel = hiltViewModel()
) {
    // Whistleblower: a chat IS a case — two tabs, "Status" and "Messages". A brand-new case
    // opens on Messages (the report still has to be written), an existing one on Status.
    val caseMode = AppEdition.isWhistleblower
    var caseTab by rememberSaveable { mutableStateOf(-1) }
    var showRemoveCaseDialog by remember { mutableStateOf(false) }
    val contact by viewModel.contact.collectAsState()
    LaunchedEffect(contact != null) {
        if (caseMode && caseTab == -1 && contact != null) caseTab = if (contact?.caseNumber == null) 1 else 0
    }
    val messages by viewModel.messages.collectAsState()
    val sendError by viewModel.sendError.collectAsState()
    val revoked by viewModel.revoked.collectAsState()
    val deliveredIds by viewModel.deliveredIds.collectAsState()
    var inputText by remember { mutableStateOf("") }
    var showRevokeDialog by remember { mutableStateOf(false) }
    var showRenameDialog by remember { mutableStateOf(false) }
    var showTtlDialog by remember { mutableStateOf(false) }
    var renameText by remember { mutableStateOf("") }
    var cameraPermissionDenied by remember { mutableStateOf(false) }
    var fullscreenImage by remember { mutableStateOf<RamMessage?>(null) }
    var showTempNodeDialog by remember { mutableStateOf(false) }
    val tempNodeError by viewModel.tempNodeError.collectAsState()
    val tempNodeScanPrompt = stringResource(R.string.chat_temp_node_scan_prompt)
    val listState = rememberLazyListState()
    val snackbarHostState = remember { SnackbarHostState() }
    val context = LocalContext.current

    val filePicker = rememberLauncherForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        uri ?: return@rememberLauncherForActivityResult
        // Read fully into RAM; it's never copied to app storage — matches this app's
        // RAM-only design for message content (see InMemoryMessageStore).
        val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
            ?: return@rememberLauncherForActivityResult
        val name = uri.lastPathSegment ?: "file"
        val isImage = context.contentResolver.getType(uri)?.startsWith("image/") == true
        viewModel.sendFile(name, bytes, isImage)
    }

    // TakePicturePreview hands back a downscaled Bitmap directly in memory — never a file on
    // disk — matching the same RAM-only principle.
    val cameraLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.TakePicturePreview()
    ) { bitmap: Bitmap? ->
        bitmap ?: return@rememberLauncherForActivityResult
        val out = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, 85, out)
        viewModel.sendImage(out.toByteArray())
    }
    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted -> if (granted) cameraLauncher.launch(null) else cameraPermissionDenied = true }

    // Temp Node (NODE_MESH_SPEC.md §7) — scans the exact same unpruuf-node-owner:v1:... string
    // a standard node's setup already uses (see NodeMeshManager.parseOwnerConnectionString),
    // just handed to activateTempNode() instead of the global Settings pool. A Temp Node
    // instance (node-mesh-server started with EPHEMERAL=1) prints this string on startup for
    // the user to display as a QR or paste manually — no separate QR format needed.
    val tempNodeScanLauncher = rememberLauncherForActivityResult(ScanContract()) { result ->
        result.contents?.let { viewModel.activateTempNode(it) }
    }
    val tempNodeCameraPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            tempNodeScanLauncher.launch(
                ScanOptions().apply {
                    setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                    setPrompt(tempNodeScanPrompt)
                    setBeepEnabled(false)
                    setBarcodeImageEnabled(false)
                    setOrientationLocked(true)
                    setCaptureActivity(PortraitCaptureActivity::class.java)
                }
            )
        } else {
            cameraPermissionDenied = true
        }
    }

    LaunchedEffect(contactId) {
        viewModel.loadContact(contactId)
    }

    LaunchedEffect(messages.size) {
        // Index messages.size, not size-1: the list has one extra leading item (the
        // "wiped from RAM" ghost marker), so the last message sits at exactly size.
        if (messages.isNotEmpty()) listState.animateScrollToItem(messages.size)
    }

    LaunchedEffect(sendError) {
        if (sendError != null) snackbarHostState.showSnackbar(sendError!!)
    }

    LaunchedEffect(revoked) {
        if (revoked) onNavigateBack()
    }

    if (showRevokeDialog) {
        AlertDialog(
            onDismissRequest = { showRevokeDialog = false },
            icon = {
                Icon(
                    Icons.Default.DeleteForever,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.error
                )
            },
            title = { Text(stringResource(R.string.chat_delete_chat_title)) },
            text = {
                Text(
                    stringResource(
                        R.string.chat_delete_chat_body,
                        contact?.displayName ?: stringResource(R.string.chat_this_contact)
                    ),
                    style = MaterialTheme.typography.bodyMedium
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        showRevokeDialog = false
                        viewModel.revokeContact()
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.error
                    )
                ) {
                    Text(stringResource(R.string.chat_delete_chat_button), fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showRevokeDialog = false }) {
                    Text(stringResource(R.string.chat_cancel))
                }
            }
        )
    }

    if (showTtlDialog) {
        val current = MessageTtl.normalize(contact?.messageTtlHours)
        AlertDialog(
            onDismissRequest = { showTtlDialog = false },
            title = { Text(stringResource(R.string.chat_ttl_title)) },
            text = {
                Column {
                    Text(stringResource(R.string.chat_ttl_body), style = MaterialTheme.typography.bodyMedium)
                    Spacer(Modifier.height(8.dp))
                    MessageTtl.STEPS_HOURS.forEach { hours ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    viewModel.setMessageTtl(hours)
                                    showTtlDialog = false
                                }
                                .padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(selected = hours == current, onClick = {
                                viewModel.setMessageTtl(hours)
                                showTtlDialog = false
                            })
                            Text(stringResource(R.string.chat_ttl_option, hours))
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showTtlDialog = false }) { Text(stringResource(R.string.chat_cancel)) }
            }
        )
    }

    if (showRenameDialog) {
        AlertDialog(
            onDismissRequest = { showRenameDialog = false },
            title = { Text(stringResource(R.string.chat_rename_contact_title)) },
            text = {
                OutlinedTextField(
                    value = renameText,
                    onValueChange = { renameText = it },
                    label = { Text(stringResource(R.string.chat_name_field)) },
                    singleLine = true
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        if (renameText.isNotBlank()) {
                            viewModel.renameContact(renameText.trim())
                        }
                        showRenameDialog = false
                    }
                ) { Text(stringResource(R.string.chat_save)) }
            },
            dismissButton = {
                TextButton(onClick = { showRenameDialog = false }) { Text(stringResource(R.string.chat_cancel)) }
            }
        )
    }

    if (cameraPermissionDenied) {
        AlertDialog(
            onDismissRequest = { cameraPermissionDenied = false },
            title = { Text(stringResource(R.string.chat_camera_permission_title)) },
            text = { Text(stringResource(R.string.chat_camera_permission_body)) },
            confirmButton = {
                TextButton(onClick = { cameraPermissionDenied = false }) { Text(stringResource(R.string.chat_ok)) }
            }
        )
    }

    if (showTempNodeDialog && contact != null) {
        TempNodeDialog(
            contact = contact!!,
            error = tempNodeError,
            onScan = {
                val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                    PackageManager.PERMISSION_GRANTED
                if (granted) {
                    tempNodeScanLauncher.launch(
                        ScanOptions().apply {
                            setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                            setPrompt(tempNodeScanPrompt)
                            setBeepEnabled(false)
                            setBarcodeImageEnabled(false)
                            setOrientationLocked(true)
                            setCaptureActivity(PortraitCaptureActivity::class.java)
                        }
                    )
                } else {
                    tempNodeCameraPermission.launch(Manifest.permission.CAMERA)
                }
            },
            onPaste = { raw -> viewModel.activateTempNode(raw) },
            onDeactivate = {
                viewModel.deactivateTempNode()
                showTempNodeDialog = false
            },
            onDismiss = { showTempNodeDialog = false }
        )
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = {
                    if (caseMode) {
                        Text(
                            contact?.caseNumber ?: stringResource(R.string.case_new_title),
                            fontFamily = if (contact?.caseNumber != null) androidx.compose.ui.text.font.FontFamily.Monospace else null
                        )
                    } else Column(
                        modifier = Modifier.clickable {
                            renameText = contact?.displayName ?: ""
                            showRenameDialog = true
                        }
                    ) {
                        Text(contact?.displayName ?: "...")
                        Text(
                            stringResource(R.string.chat_e2e_encrypted_tap_to_rename),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, stringResource(R.string.chat_cd_back))
                    }
                },
                actions = {
                    if (caseMode) {
                        IconButton(onClick = { showRemoveCaseDialog = true }) {
                            Icon(
                                Icons.Default.DeleteForever,
                                contentDescription = stringResource(R.string.case_remove),
                                tint = MaterialTheme.colorScheme.error
                            )
                        }
                    } else {
                        IconButton(onClick = {
                            renameText = contact?.displayName ?: ""
                            showRenameDialog = true
                        }) {
                            Icon(
                                Icons.Default.Edit,
                                contentDescription = stringResource(R.string.chat_cd_rename),
                                tint = MaterialTheme.colorScheme.primary
                            )
                        }
                        IconButton(onClick = { viewModel.sendConnectionInfoUpdate() }) {
                            Icon(
                                Icons.Default.Sync,
                                contentDescription = stringResource(R.string.chat_cd_send_connection_update),
                                tint = MaterialTheme.colorScheme.primary
                            )
                        }
                        // Cross-platform (iOS-interop) contacts only — see CROSS_PLATFORM_PLAN.md.
                        // Manual wire-tag rotation; these contacts have no automatic hourly clock.
                        if (contact?.crossPlatform == true) {
                            IconButton(onClick = { viewModel.wechsel() }) {
                                Icon(
                                    Icons.Default.Autorenew,
                                    contentDescription = stringResource(R.string.chat_cd_wechsel),
                                    tint = MaterialTheme.colorScheme.primary
                                )
                            }
                        }
                        // How long my packets for this chat wait on the nodes — Node-Mesh contacts only.
                        if (contact?.nodeMesh == true) {
                            IconButton(onClick = { showTtlDialog = true }) {
                                Icon(
                                    Icons.Default.Timer,
                                    contentDescription = stringResource(R.string.chat_cd_ttl),
                                    tint = MaterialTheme.colorScheme.primary
                                )
                            }
                        }
                        // Temp Node (NODE_MESH_SPEC.md §7) — Node-Mesh contacts only.
                        if (contact?.nodeMesh == true) {
                            IconButton(onClick = { showTempNodeDialog = true }) {
                                Icon(
                                    Icons.Default.Router,
                                    contentDescription = stringResource(R.string.chat_cd_temp_node),
                                    tint = if (contact?.tempNodeAddress != null) MaterialTheme.colorScheme.primary
                                        else MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                        IconButton(onClick = { showRevokeDialog = true }) {
                            Icon(
                                Icons.Default.DeleteForever,
                                contentDescription = stringResource(R.string.chat_delete_chat_button),
                                tint = MaterialTheme.colorScheme.error
                            )
                        }
                    }
                }
            )
        },
        bottomBar = {
            if (!caseMode || caseTab == 1) Surface(shadowElevation = 8.dp) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(8.dp)
                        .navigationBarsPadding()
                        .imePadding(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = {
                        // Without this, launching the external picker backgrounds the app →
                        // wipe + PIN lock → the picked file is dropped. See ChatViewModel.
                        viewModel.beginExternalPickerGrace()
                        filePicker.launch("*/*")
                    }) {
                        Icon(Icons.Default.AttachFile, stringResource(R.string.chat_cd_attach_file))
                    }
                    IconButton(onClick = {
                        // Same grace as the file picker — the camera (and on some OEMs even
                        // the permission dialog) is an external activity too.
                        viewModel.beginExternalPickerGrace()
                        val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                            PackageManager.PERMISSION_GRANTED
                        if (granted) cameraLauncher.launch(null) else cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                    }) {
                        Icon(Icons.Default.PhotoCamera, stringResource(R.string.chat_cd_take_photo))
                    }
                    OutlinedTextField(
                        value = inputText,
                        onValueChange = { inputText = it },
                        modifier = Modifier.weight(1f),
                        placeholder = { Text(stringResource(R.string.chat_message_placeholder)) },
                        shape = RoundedCornerShape(24.dp),
                        maxLines = 4
                    )
                    Spacer(Modifier.width(8.dp))
                    FilledIconButton(
                        onClick = {
                            if (inputText.isNotBlank()) {
                                viewModel.sendMessage(inputText.trim())
                                inputText = ""
                            }
                        }
                    ) {
                        Icon(Icons.Default.Send, stringResource(R.string.chat_cd_send))
                    }
                }
            }
        }
    ) { padding ->
        // Honest feedback for a slow cold path: TOR_CONNECT_TIMEOUT_MS alone (90s) already
        // covers a mobile↔mobile rendezvous, but the delivery queue's own retry backoff on
        // top of that means a first message can genuinely still be sitting at the clock
        // several MINUTES in on a hard carrier pair — a real, reported sequence where it
        // eventually delivered fine, unassisted, but looked indistinguishable from "broken"
        // the whole time because the status pill (self-reachability only) stayed "TOR ACTIVE"
        // throughout. This ticks every 5s so the age keeps recomputing while something's
        // still pending, and only ever reads state that already exists (messages/deliveredIds)
        // — no networking or delivery-queue code touched.
        val now by produceState(initialValue = System.currentTimeMillis()) {
            while (true) {
                delay(5_000)
                value = System.currentTimeMillis()
            }
        }
        val oldestPendingAgeMs = remember(messages, deliveredIds, now) {
            messages.filter { it.isOutgoing && it.id !in deliveredIds }
                .minOfOrNull { now - it.timestamp }
        }

        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            if (caseMode) {
                TabRow(selectedTabIndex = caseTab.coerceAtLeast(0)) {
                    Tab(selected = caseTab == 0, onClick = { caseTab = 0 }, text = { Text(stringResource(R.string.case_tab_status)) })
                    Tab(selected = caseTab == 1, onClick = { caseTab = 1 }, text = { Text(stringResource(R.string.case_tab_messages)) })
                }
            }
            if (caseMode && caseTab != 1) {
                com.nexonai.unpruuf.screens.caseview.CaseStatusContent(contact, Modifier.weight(1f).fillMaxWidth())
            } else {
                if (oldestPendingAgeMs != null && oldestPendingAgeMs > STILL_CONNECTING_HINT_MS) {
                    StillConnectingHint(
                        relayConfigured = viewModel.isRelayConfigured(),
                        onSetUpRelay = onNavigateToSettings
                    )
                }
                if (messages.isEmpty()) {
                    Box(
                        modifier = Modifier.weight(1f).fillMaxWidth(),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                stringResource(R.string.chat_no_messages),
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(Modifier.height(8.dp))
                            Text(
                                stringResource(R.string.chat_no_messages_body),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                textAlign = TextAlign.Center
                            )
                        }
                    }
                } else {
                    LazyColumn(
                        state = listState,
                        modifier = Modifier.weight(1f).fillMaxWidth(),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(5.dp)
                    ) {
                        // The RAM wipe made visible: a quiet marker where history ends. Everything
                        // before this point is gone by design (5-min TTL, background/lock wipes) —
                        // absence shown deliberately instead of pretending history starts here.
                        item(key = "ram-ghost") {
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
                                horizontalArrangement = Arrangement.Center
                            ) {
                                Surface(
                                    shape = RoundedCornerShape(50),
                                    color = androidx.compose.ui.graphics.Color.Transparent,
                                    border = androidx.compose.foundation.BorderStroke(
                                        1.dp,
                                        MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.35f)
                                    )
                                ) {
                                    Text(
                                        stringResource(R.string.chat_older_messages_wiped),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.75f),
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 5.dp)
                                    )
                                }
                            }
                        }
                        items(messages, key = { it.id }) { message ->
                            MessageBubble(
                                message = message,
                                displayText = viewModel.getDisplayText(message),
                                delivered = message.id in deliveredIds,
                                onImageTap = { fullscreenImage = message }
                            )
                        }
                    }
                }
            }
        }
    }

    fullscreenImage?.let { message ->
        FullscreenImageDialog(message, onDismiss = { fullscreenImage = null })
    }

    if (showRemoveCaseDialog) {
        AlertDialog(
            onDismissRequest = { showRemoveCaseDialog = false },
            title = { Text(stringResource(R.string.case_remove_title)) },
            text = { Text(stringResource(R.string.case_remove_body)) },
            confirmButton = {
                TextButton(onClick = {
                    showRemoveCaseDialog = false
                    viewModel.removeCaseFromDevice()
                }) { Text(stringResource(R.string.case_remove_confirm), color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = {
                TextButton(onClick = { showRemoveCaseDialog = false }) { Text(stringResource(R.string.settings_cancel)) }
            }
        )
    }
}

// Purely informational — reads no networking state, changes no behavior. Reported for real:
// "can't send at all" turned out to mean "took 5-10 minutes on a cold mobile↔mobile path, then
// worked instantly" — the app was doing exactly what it's supposed to the whole time, but the
// status pill (self-reachability, not per-message) gave no sign that a first connect to THIS
// contact was still in flight, so a genuinely slow-but-working cold start looked like a bug.
//
// When no relay is configured, this is also the one moment a nudge toward setting one up
// actually lands: P2PNetworkManager already falls back direct-Tor → relay automatically after
// TOR_CONNECT_TIMEOUT_MS (see attemptDelivery/attemptChunkTrainDelivery) — a configured relay
// would very likely have turned that reported 5-10 minute wait into ~90s. Nothing to build there,
// it's Settings → "Relay (optional)"; this just points at it at the exact point of pain instead
// of leaving it undiscovered.
@Composable
private fun StillConnectingHint(relayConfigured: Boolean, onSetUpRelay: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.Center
    ) {
        Surface(
            shape = RoundedCornerShape(14.dp),
            color = MaterialTheme.colorScheme.secondaryContainer
        ) {
            Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        stringResource(R.string.chat_still_connecting),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSecondaryContainer,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(
                        stringResource(R.string.chat_still_connecting_body),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSecondaryContainer
                    )
                }
                if (!relayConfigured) {
                    Text(
                        stringResource(R.string.chat_set_up_relay_hint),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier
                            .padding(top = 4.dp)
                            .clickable(onClick = onSetUpRelay)
                    )
                }
            }
        }
    }
}

// Temp Node (NODE_MESH_SPEC.md §7) — an exceptional, per-chat, one-off additional own node
// (e.g. a second device run just for this one contact while traveling). Scan or paste the
// unpruuf-node-owner:v1:... string a Temp Node instance (node-mesh-server started with
// EPHEMERAL=1, see node-mesh-server/README.md) prints at startup — the exact same format a
// standard node's Settings setup already accepts, just registered contact-scoped here instead
// of into the global pool. Shows one of three states: none registered, registered-but-not-yet-
// confirmed ("pending" — P2PNetworkManager dual-deposits to both this node and the standard
// pool until the first successful delivery), or active/confirmed (standard nodes paused for
// this one chat's outgoing traffic — see depositForNodeMesh's doc comment).
@Composable
private fun TempNodeDialog(
    contact: Contact,
    error: String?,
    onScan: () -> Unit,
    onPaste: (String) -> Boolean,
    onDeactivate: () -> Unit,
    onDismiss: () -> Unit
) {
    var pasteInput by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        icon = { Icon(Icons.Default.Router, contentDescription = null) },
        title = { Text(stringResource(R.string.chat_temp_node_title)) },
        text = {
            Column {
                if (contact.tempNodeAddress != null) {
                    Text(
                        if (contact.tempNodeActive) stringResource(R.string.chat_temp_node_active)
                        else stringResource(R.string.chat_temp_node_pending),
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        contact.tempNodeAddress,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                } else {
                    Text(
                        stringResource(R.string.chat_temp_node_intro),
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = pasteInput,
                        onValueChange = { pasteInput = it },
                        label = { Text(stringResource(R.string.chat_temp_node_connection_string_field)) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    if (error != null) {
                        Text(
                            error,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(top = 4.dp)
                        )
                    }
                }
            }
        },
        confirmButton = {
            if (contact.tempNodeAddress != null) {
                TextButton(onClick = onDeactivate) {
                    Text(stringResource(R.string.chat_temp_node_deactivate), color = MaterialTheme.colorScheme.error)
                }
            } else {
                TextButton(onClick = {
                    if (pasteInput.isNotBlank() && onPaste(pasteInput)) pasteInput = ""
                }) { Text(stringResource(R.string.chat_temp_node_add)) }
            }
        },
        dismissButton = {
            Row {
                if (contact.tempNodeAddress == null) {
                    TextButton(onClick = onScan) { Text(stringResource(R.string.chat_temp_node_scan)) }
                }
                TextButton(onClick = onDismiss) { Text(stringResource(R.string.chat_close)) }
            }
        }
    )
}

private fun decodeImage(body: ByteArray) =
    runCatching { BitmapFactory.decodeByteArray(body, 0, body.size)?.asImageBitmap() }.getOrNull()

@Composable
private fun FullscreenImageDialog(message: RamMessage, onDismiss: () -> Unit) {
    val body = message.content ?: return
    val bitmap = remember(message.id) { decodeImage(body) }
    Dialog(onDismissRequest = onDismiss) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(androidx.compose.ui.graphics.Color.Black)
                .clickable(onClick = onDismiss),
            contentAlignment = Alignment.Center
        ) {
            if (bitmap != null) {
                Image(
                    bitmap = bitmap,
                    contentDescription = message.fileName,
                    modifier = Modifier.fillMaxWidth(),
                    contentScale = ContentScale.Fit
                )
            }
        }
    }
}

@Composable
private fun MessageBubble(message: RamMessage, displayText: String, delivered: Boolean = false, onImageTap: () -> Unit = {}) {
    val isOutgoing = message.isOutgoing
    val timeFormat = SimpleDateFormat("HH:mm", Locale.getDefault())

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isOutgoing) Arrangement.End else Arrangement.Start
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = 280.dp)
                .clip(
                    RoundedCornerShape(
                        topStart = 18.dp, topEnd = 18.dp,
                        bottomStart = if (isOutgoing) 18.dp else 6.dp,
                        bottomEnd = if (isOutgoing) 6.dp else 18.dp
                    )
                )
                // Own bubbles sit on the accent's DEEP surface, not the full accent —
                // the accent itself stays reserved for state (the ✓✓) and actions.
                .background(
                    if (isOutgoing) MaterialTheme.colorScheme.primaryContainer
                    else MaterialTheme.colorScheme.surfaceVariant
                )
                .let {
                    if (message.type == MessageType.IMAGE) it.clickable(onClick = onImageTap).padding(5.dp)
                    else it.padding(horizontal = 12.dp, vertical = 8.dp)
                }
        ) {
            if (message.type == MessageType.IMAGE) {
                val body = message.content
                val bitmap = remember(message.id) { body?.let { decodeImage(it) } }
                if (bitmap != null) {
                    Image(
                        bitmap = bitmap,
                        contentDescription = message.fileName,
                        modifier = Modifier.size(200.dp).clip(RoundedCornerShape(14.dp)),
                        contentScale = ContentScale.Crop
                    )
                } else {
                    Text(
                        "📷 ${message.fileName ?: stringResource(R.string.chat_photo_fallback)}",
                        color = if (isOutgoing) MaterialTheme.colorScheme.onPrimaryContainer
                        else MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.padding(8.dp)
                    )
                }
            } else {
                Text(
                    displayText,
                    color = if (isOutgoing) MaterialTheme.colorScheme.onPrimaryContainer
                    else MaterialTheme.colorScheme.onSurface,
                    style = MaterialTheme.typography.bodyMedium
                )
            }
            // Stamp in the monospace label voice; the delivered tick carries the accent —
            // the one place inside a bubble the accent is allowed to appear.
            Row(
                modifier = Modifier.align(Alignment.End).let {
                    if (message.type == MessageType.IMAGE) it.padding(horizontal = 4.dp, vertical = 2.dp) else it
                },
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    timeFormat.format(Date(message.timestamp)),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f)
                )
                if (isOutgoing) {
                    Spacer(Modifier.width(5.dp))
                    Text(
                        if (delivered) "✓✓" else "···",
                        style = MaterialTheme.typography.labelSmall,
                        color = if (delivered) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f)
                    )
                }
            }
        }
    }
}
