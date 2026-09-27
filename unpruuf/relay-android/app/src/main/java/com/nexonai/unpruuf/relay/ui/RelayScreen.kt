package com.nexonai.unpruuf.relay.ui

import android.graphics.Bitmap
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.zxing.BarcodeFormat
import com.google.zxing.MultiFormatWriter
import com.google.zxing.common.BitMatrix
import com.nexonai.unpruuf.relay.core.RelayConstants
import com.nexonai.unpruuf.relay.core.RelayEventLog
import com.nexonai.unpruuf.relay.service.RelayService
import androidx.compose.ui.res.stringResource
import com.nexonai.unpruuf.relay.R
import java.text.SimpleDateFormat
import java.util.Locale

@Composable
fun RelayScreen(service: RelayService?) {
    if (service == null) {
        Box(
            Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
            contentAlignment = Alignment.Center
        ) {
            CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
        }
        return
    }

    val isReady by service.isReady.collectAsState()
    val connectionString by service.connectionString.collectAsState()
    val ttlHours by service.ttlHours.collectAsState()
    val queuedCount by service.queuedCount.collectAsState()
    val bridgesEnabled by service.bridgesEnabled.collectAsState()
    val bridgeText by service.bridgeText.collectAsState()
    val bridgeStatus by service.bridgeStatus.collectAsState()
    val activityLog by service.activityLog.collectAsState()
    val lanAccessEnabled by service.lanAccessEnabled.collectAsState()
    val nodeMeshMode by service.nodeMeshMode.collectAsState()
    val nodeMeshProfile by service.nodeMeshProfile.collectAsState()
    val nodeMeshSlot by service.nodeMeshSlot.collectAsState()
    val ownerConnectionString by service.ownerConnectionString.collectAsState()
    val lastHygiene by service.lastHygiene.collectAsState()
    var pendingModeSwitch by remember { mutableStateOf<Boolean?>(null) }
    var showOwnerRotateConfirm by remember { mutableStateOf(false) }

    var showWipeConfirm by remember { mutableStateOf(false) }
    var showRotateConfirm by remember { mutableStateOf(false) }
    var rotatedNotice by remember { mutableStateOf(false) }
    val clipboard = LocalClipboardManager.current
    val snackbarHostState = remember { SnackbarHostState() }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(22.dp)
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    if (nodeMeshMode) stringResource(R.string.title_business_node) else stringResource(R.string.title_relay),
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 22.sp,
                    color = MaterialTheme.colorScheme.onBackground
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    if (nodeMeshMode) stringResource(R.string.subtitle_node_mesh)
                    else stringResource(R.string.subtitle_relay),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            StatusPill(isReady)

            ModeCard(
                nodeMeshMode = nodeMeshMode,
                onRequestSwitch = { pendingModeSwitch = it }
            )

            if (nodeMeshMode) {
                NodeMeshOwnerCard(
                    ownerConnectionString = ownerConnectionString,
                    onCopy = { clipboard.setText(AnnotatedString(it)) }
                )
                NodeMeshSettingsCard(
                    profile = nodeMeshProfile,
                    slot = nodeMeshSlot,
                    queuedCount = queuedCount,
                    lastHygiene = lastHygiene,
                    onProfile = { service.setNodeMeshProfile(it) },
                    onSlot = { service.setNodeMeshSlot(it) }
                )
            } else {
                // ─── QR + connection string ──────────────────────────────────────
                Card(
                    shape = RoundedCornerShape(18.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(20.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            stringResource(R.string.pair_a_device),
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(Modifier.height(14.dp))

                        if (connectionString != null) {
                            val qrBitmap = remember(connectionString) { generateQrBitmap(connectionString!!) }
                            qrBitmap?.let {
                                androidx.compose.foundation.Image(
                                    bitmap = it.asImageBitmap(),
                                    contentDescription = stringResource(R.string.cd_relay_qr),
                                    filterQuality = FilterQuality.None,
                                    modifier = Modifier
                                        .size(220.dp)
                                        .clip(RoundedCornerShape(12.dp))
                                        .background(Color.White)
                                        .padding(10.dp)
                                )
                            }
                            Spacer(Modifier.height(16.dp))
                            Text(
                                connectionString ?: "",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                textAlign = TextAlign.Center,
                                modifier = Modifier.fillMaxWidth()
                            )
                            Spacer(Modifier.height(12.dp))
                            OutlinedButton(onClick = {
                                clipboard.setText(AnnotatedString(connectionString ?: ""))
                            }) {
                                Icon(Icons.Default.ContentCopy, null, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(8.dp))
                                Text(stringResource(R.string.copy_connection_string))
                            }
                            Spacer(Modifier.height(8.dp))
                            Text(
                                stringResource(R.string.scan_or_paste_hint),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                textAlign = TextAlign.Center
                            )
                        } else {
                            Box(Modifier.size(220.dp), contentAlignment = Alignment.Center) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                                    Spacer(Modifier.height(16.dp))
                                    Text(
                                        stringResource(R.string.waiting_for_tor),
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                    Text(
                                        stringResource(R.string.first_start_note),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }
                    }
                }

                // ─── Message expiry (the configurable "reset") ───────────────────
                Card(
                    shape = RoundedCornerShape(18.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(20.dp)) {
                        Text(
                            stringResource(R.string.message_expiry),
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(
                            stringResource(R.string.message_expiry_body),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(Modifier.height(16.dp))

                        TtlStepper(
                            hours = ttlHours,
                            onChange = { service.setTtlHours(it) }
                        )

                        Spacer(Modifier.height(18.dp))
                        HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                        Spacer(Modifier.height(18.dp))

                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(
                                    stringResource(R.string.queued_right_now),
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                                Text(
                                    if (queuedCount == 1L) stringResource(R.string.one_message) else stringResource(R.string.n_messages, queuedCount),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            TextButton(
                                onClick = { showWipeConfirm = true },
                                enabled = queuedCount > 0
                            ) { Text(stringResource(R.string.reset_now), color = MaterialTheme.colorScheme.error) }
                        }
                    }
                }

            }

            // ─── Recent activity (diagnostics) ───────────────────────────────
            Card(
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(
                                stringResource(R.string.recent_activity),
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(Modifier.height(6.dp))
                            Text(
                                stringResource(R.string.recent_activity_body),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        if (activityLog.isNotEmpty()) {
                            TextButton(onClick = { service.clearActivityLog() }) { Text(stringResource(R.string.clear)) }
                        }
                    }
                    Spacer(Modifier.height(12.dp))

                    if (activityLog.isEmpty()) {
                        Text(
                            stringResource(R.string.activity_empty),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    } else {
                        Column(
                            modifier = Modifier.heightIn(max = 260.dp).verticalScroll(rememberScrollState()),
                            verticalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            activityLog.forEach { entry -> ActivityLogRow(entry) }
                        }
                    }
                }
            }

            if (nodeMeshMode) {
                Card(
                    shape = RoundedCornerShape(18.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(stringResource(R.string.owner_key), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
                            Text(
                                stringResource(R.string.owner_key_body),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        TextButton(onClick = { showOwnerRotateConfirm = true }) { Text(stringResource(R.string.rotate)) }
                    }
                }
            } else {
                // ─── Access token (secondary, rotate) ────────────────────────────
                Card(
                    shape = RoundedCornerShape(18.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(
                                stringResource(R.string.access_token),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                stringResource(R.string.access_token_body),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        TextButton(onClick = { showRotateConfirm = true }) { Text(stringResource(R.string.rotate)) }
                    }
                }

            }

            // ─── Censorship circumvention (bridges) ──────────────────────────
            Card(
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(
                                stringResource(R.string.censorship_circumvention),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                stringResource(R.string.censorship_circumvention_body),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Switch(
                            checked = bridgesEnabled,
                            onCheckedChange = {
                                service.onBridgesEnabledChange(it)
                                if (!it) service.saveBridges() // apply disabling immediately
                            }
                        )
                    }

                    if (bridgesEnabled) {
                        Spacer(Modifier.height(14.dp))
                        Text(
                            stringResource(R.string.bridge_lines_help),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(Modifier.height(10.dp))
                        OutlinedTextField(
                            value = bridgeText,
                            onValueChange = { service.onBridgeTextChange(it) },
                            placeholder = { Text(stringResource(R.string.bridge_lines_field)) },
                            modifier = Modifier.fillMaxWidth().heightIn(min = 100.dp),
                            minLines = 3,
                            textStyle = MaterialTheme.typography.labelSmall
                        )
                        Spacer(Modifier.height(10.dp))
                        Button(
                            onClick = { service.saveBridges() },
                            modifier = Modifier.fillMaxWidth()
                        ) { Text(stringResource(R.string.save_and_reconnect)) }

                        bridgeStatus?.let {
                            Spacer(Modifier.height(8.dp))
                            Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                            LaunchedEffect(it) {
                                kotlinx.coroutines.delay(6000)
                                service.clearBridgeStatus()
                            }
                        }
                    }
                }
            }

            if (!nodeMeshMode) {
                // ─── LAN access (demo/local-network mode, no Tor) ────────────────
                Card(
                    shape = RoundedCornerShape(18.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(20.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(
                                    stringResource(R.string.allow_lan_access),
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                                Text(
                                    stringResource(R.string.allow_lan_access_body),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            Switch(
                                checked = lanAccessEnabled,
                                onCheckedChange = { service.setLanAccessEnabled(it) }
                            )
                        }
                    }
                }

            }

            Spacer(Modifier.height(4.dp))
        }
    }

    if (showWipeConfirm) {
        AlertDialog(
            onDismissRequest = { showWipeConfirm = false },
            title = { Text(stringResource(R.string.reset_now_title)) },
            text = { Text(stringResource(R.string.reset_now_body)) },
            confirmButton = {
                TextButton(onClick = {
                    service.wipeAllNow()
                    showWipeConfirm = false
                }) { Text(stringResource(R.string.reset_now), color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { showWipeConfirm = false }) { Text(stringResource(R.string.cancel)) } }
        )
    }

    if (showRotateConfirm) {
        AlertDialog(
            onDismissRequest = { showRotateConfirm = false },
            title = { Text(stringResource(R.string.rotate_access_token_title)) },
            text = { Text(stringResource(R.string.rotate_access_token_body)) },
            confirmButton = {
                TextButton(onClick = {
                    service.regenerateToken()
                    showRotateConfirm = false
                    rotatedNotice = true
                }) { Text(stringResource(R.string.rotate), color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { showRotateConfirm = false }) { Text(stringResource(R.string.cancel)) } }
        )
    }

    pendingModeSwitch?.let { target ->
        AlertDialog(
            onDismissRequest = { pendingModeSwitch = null },
            title = { Text(if (target) stringResource(R.string.switch_to_business_title) else stringResource(R.string.switch_to_relay_title)) },
            text = {
                Text(
                    stringResource(R.string.switch_mode_body) + " " +
                    if (target) stringResource(R.string.switch_mode_relay_lost)
                    else stringResource(R.string.switch_mode_node_lost)
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    service.setNodeMeshMode(target)
                    pendingModeSwitch = null
                }) { Text(stringResource(R.string.switch_label), color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { pendingModeSwitch = null }) { Text(stringResource(R.string.cancel)) } }
        )
    }

    if (showOwnerRotateConfirm) {
        AlertDialog(
            onDismissRequest = { showOwnerRotateConfirm = false },
            title = { Text(stringResource(R.string.rotate_owner_key_title)) },
            text = { Text(stringResource(R.string.rotate_owner_key_body)) },
            confirmButton = {
                TextButton(onClick = {
                    service.regenerateNodeMeshOwnerSecret()
                    showOwnerRotateConfirm = false
                }) { Text(stringResource(R.string.rotate), color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { showOwnerRotateConfirm = false }) { Text(stringResource(R.string.cancel)) } }
        )
    }

    val tokenRotatedMessage = stringResource(R.string.token_rotated_snackbar)
    LaunchedEffect(rotatedNotice) {
        if (rotatedNotice) {
            snackbarHostState.showSnackbar(tokenRotatedMessage)
            rotatedNotice = false
        }
    }
}

@Composable
private fun ModeCard(nodeMeshMode: Boolean, onRequestSwitch: (Boolean) -> Unit) {
    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Text(stringResource(R.string.mode_label), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                FilterChip(
                    selected = !nodeMeshMode,
                    onClick = { if (nodeMeshMode) onRequestSwitch(false) },
                    label = { Text(stringResource(R.string.title_relay)) },
                    modifier = Modifier.weight(1f)
                )
                FilterChip(
                    selected = nodeMeshMode,
                    onClick = { if (!nodeMeshMode) onRequestSwitch(true) },
                    label = { Text(stringResource(R.string.title_business_node)) },
                    modifier = Modifier.weight(1f)
                )
            }
            Spacer(Modifier.height(8.dp))
            Text(
                if (nodeMeshMode) stringResource(R.string.mode_card_business_body)
                else stringResource(R.string.mode_card_relay_body),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun NodeMeshOwnerCard(ownerConnectionString: String?, onCopy: (String) -> Unit) {
    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(stringResource(R.string.connect_your_own_app), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(10.dp))
            Text(
                stringResource(R.string.write_key_warning),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(14.dp))
            if (ownerConnectionString != null) {
                val qrBitmap = remember(ownerConnectionString) { generateQrBitmap(ownerConnectionString) }
                qrBitmap?.let {
                    androidx.compose.foundation.Image(
                        bitmap = it.asImageBitmap(),
                        contentDescription = stringResource(R.string.cd_owner_qr),
                        filterQuality = FilterQuality.None,
                        modifier = Modifier
                            .size(220.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(Color.White)
                            .padding(10.dp)
                    )
                }
                Spacer(Modifier.height(12.dp))
                OutlinedButton(onClick = { onCopy(ownerConnectionString) }) {
                    Icon(Icons.Default.ContentCopy, null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(R.string.copy_owner_code))
                }
            } else {
                Box(Modifier.size(220.dp), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.height(16.dp))
                        Text(stringResource(R.string.waiting_for_tor), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

@Composable
private fun NodeMeshSettingsCard(
    profile: String,
    slot: Int,
    queuedCount: Long,
    lastHygiene: String?,
    onProfile: (String) -> Unit,
    onSlot: (Int) -> Unit
) {
    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Text(stringResource(R.string.retention_profile), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(8.dp))
            RelayConstants.NODE_MESH_PROFILES.forEach { (name, hours) ->
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                    RadioButton(selected = profile == name, onClick = { onProfile(name) })
                    Column(Modifier.weight(1f)) {
                        Text(name, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
                        Text(
                            if (hours == 1) stringResource(R.string.messages_stay_one_hour) else stringResource(R.string.messages_stay_n_hours, hours),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
            Spacer(Modifier.height(14.dp))
            HorizontalDivider(color = MaterialTheme.colorScheme.outline)
            Spacer(Modifier.height(14.dp))
            Text(stringResource(R.string.node_slot), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(4.dp))
            Text(
                stringResource(R.string.node_slot_body),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                (1..3).forEach { n ->
                    FilterChip(selected = slot == n, onClick = { onSlot(n) }, label = { Text(stringResource(R.string.slot_n, n)) })
                }
            }
            Spacer(Modifier.height(14.dp))
            HorizontalDivider(color = MaterialTheme.colorScheme.outline)
            Spacer(Modifier.height(14.dp))
            Text(
                if (queuedCount == 1L) stringResource(R.string.one_packet_stored) else stringResource(R.string.n_packets_stored, queuedCount),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface
            )
            Text(
                stringResource(R.string.removed_automatically),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            lastHygiene?.let {
                Spacer(Modifier.height(6.dp))
                Text(stringResource(R.string.last_maintenance, it), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

private val logTimeFormat = SimpleDateFormat("HH:mm:ss", Locale.getDefault())

@Composable
private fun ActivityLogRow(entry: RelayEventLog.Entry) {
    val (label, color) = when (entry.kind) {
        RelayEventLog.Kind.STORED -> stringResource(R.string.log_stored) to MaterialTheme.colorScheme.onSurface
        RelayEventLog.Kind.FETCHED -> stringResource(R.string.log_fetched) to MaterialTheme.colorScheme.primary
        RelayEventLog.Kind.REJECTED -> stringResource(R.string.log_rejected) to MaterialTheme.colorScheme.error
    }
    Row(verticalAlignment = Alignment.Top) {
        Text(
            logTimeFormat.format(entry.atMs),
            fontFamily = FontFamily.Monospace,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.width(64.dp)
        )
        Column(Modifier.weight(1f)) {
            val countSuffix = if (entry.count > 1) " ×${entry.count}" else ""
            Text(
                "$label$countSuffix · …${entry.tagSuffix}",
                style = MaterialTheme.typography.bodySmall,
                color = color
            )
            val queuedForFmt = stringResource(R.string.queued_for)
            val detail = buildString {
                if (entry.bytes > 0) append(formatBytes(entry.bytes))
                entry.avgDwellMs?.let {
                    if (isNotEmpty()) append(" · ")
                    append(queuedForFmt.format(formatDuration(it)))
                }
                entry.note?.let {
                    if (isNotEmpty()) append(" · ")
                    append(it)
                }
            }
            if (detail.isNotEmpty()) {
                Text(detail, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

private fun formatBytes(bytes: Int): String =
    if (bytes < 1024) "$bytes B" else "%.1f KB".format(bytes / 1024.0)

private fun formatDuration(ms: Long): String = when {
    ms < 1_000 -> "${ms}ms"
    ms < 60_000 -> "%.1fs".format(ms / 1_000.0)
    ms < 3_600_000 -> "${ms / 60_000}m ${(ms % 60_000) / 1_000}s"
    else -> "${ms / 3_600_000}h ${(ms % 3_600_000) / 60_000}m"
}

@Composable
private fun StatusPill(active: Boolean) {
    val fg = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.tertiary
    val bg = if (active) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant
    Surface(
        color = bg,
        shape = RoundedCornerShape(50),
        border = BorderStroke(1.dp, fg.copy(alpha = 0.25f))
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
        ) {
            Box(Modifier.size(7.dp).clip(CircleShape).background(fg))
            Spacer(Modifier.width(7.dp))
            Text(
                if (active) stringResource(R.string.relay_active) else stringResource(R.string.connecting),
                style = MaterialTheme.typography.labelSmall,
                color = fg
            )
        }
    }
}

@Composable
private fun TtlStepper(hours: Int, onChange: (Int) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        StepButton(label = "\u2212", enabled = hours > RelayConstants.MIN_TTL_HOURS) {
            onChange((hours - stepFor(hours)).coerceAtLeast(RelayConstants.MIN_TTL_HOURS))
        }
        Spacer(Modifier.width(4.dp))
        Box(
            modifier = Modifier
                .weight(1f)
                .background(MaterialTheme.colorScheme.background, RoundedCornerShape(12.dp))
                .padding(vertical = 12.dp),
            contentAlignment = Alignment.Center
        ) {
            Text(
                formatHours(hours),
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.SemiBold,
                fontSize = 16.sp,
                color = MaterialTheme.colorScheme.onBackground
            )
        }
        Spacer(Modifier.width(4.dp))
        StepButton(label = "+", enabled = hours < RelayConstants.MAX_TTL_HOURS) {
            onChange((hours + stepFor(hours)).coerceAtMost(RelayConstants.MAX_TTL_HOURS))
        }
    }
}

// Coarser steps the longer the TTL already is — 1h steps near the default, whole days once
// you're well past it, so reaching "30 days" doesn't take ninety taps.
private fun stepFor(hours: Int): Int = when {
    hours < 24 -> 1
    hours < 24 * 7 -> 6
    else -> 24
}

private fun formatHours(hours: Int): String = when {
    hours % 24 == 0 && hours >= 24 -> {
        val days = hours / 24
        if (days == 1) "1 day" else "$days days"
    }
    else -> if (hours == 1) "1 hour" else "$hours hours"
}

@Composable
private fun StepButton(label: String, enabled: Boolean, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        enabled = enabled,
        shape = CircleShape,
        color = MaterialTheme.colorScheme.surfaceVariant,
        contentColor = if (enabled) MaterialTheme.colorScheme.onSurface
        else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
        modifier = Modifier.size(44.dp)
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(label, fontFamily = FontFamily.Monospace, fontSize = 18.sp)
        }
    }
}

// Mirrors the main unpruuf app's QrPairScreen.generateQrBitmap exactly — RGB_565, direct
// black/white pixel writes, no anti-aliasing (see that file's own comment on why crisp module
// edges matter for weak-autofocus phone cameras scanning this from another screen).
private fun generateQrBitmap(content: String, size: Int = 512): Bitmap? = try {
    val matrix: BitMatrix = MultiFormatWriter().encode(content, BarcodeFormat.QR_CODE, size, size)
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.RGB_565)
    for (x in 0 until size) {
        for (y in 0 until size) {
            bitmap.setPixel(x, y, if (matrix[x, y]) android.graphics.Color.BLACK else android.graphics.Color.WHITE)
        }
    }
    bitmap
} catch (e: Exception) {
    null
}
