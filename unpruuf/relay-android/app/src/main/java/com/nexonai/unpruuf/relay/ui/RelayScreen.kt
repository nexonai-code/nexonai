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
                    "unpruuf Relay",
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 22.sp,
                    color = MaterialTheme.colorScheme.onBackground
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    "Blind store-and-forward for offline contacts",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            StatusPill(isReady)

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
                        "PAIR A DEVICE",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(14.dp))

                    if (connectionString != null) {
                        val qrBitmap = remember(connectionString) { generateQrBitmap(connectionString!!) }
                        qrBitmap?.let {
                            androidx.compose.foundation.Image(
                                bitmap = it.asImageBitmap(),
                                contentDescription = "Relay connection QR code",
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
                            Text("Copy connection string")
                        }
                        Spacer(Modifier.height(8.dp))
                        Text(
                            "Scan or paste this in the unpruuf app under Settings → Relay.",
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
                                    "Waiting for Tor…",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Text(
                                    "First start can take 10–30 s",
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
                        "MESSAGE EXPIRY",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "A queued message is automatically deleted (\"reset\") after this many " +
                        "hours if nobody has picked it up yet.",
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
                                "Queued right now",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                if (queuedCount == 1L) "1 message" else "$queuedCount messages",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        TextButton(
                            onClick = { showWipeConfirm = true },
                            enabled = queuedCount > 0
                        ) { Text("Reset now", color = MaterialTheme.colorScheme.error) }
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
                                "RECENT ACTIVITY",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(Modifier.height(6.dp))
                            Text(
                                "What passes through this relay — never the message itself, " +
                                "only when it arrived, its size, and how long it waited before " +
                                "being picked up.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        if (activityLog.isNotEmpty()) {
                            TextButton(onClick = { service.clearActivityLog() }) { Text("Clear") }
                        }
                    }
                    Spacer(Modifier.height(12.dp))

                    if (activityLog.isEmpty()) {
                        Text(
                            "Nothing yet — this fills up as devices push and fetch through this relay.",
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
                            "Access token",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            "Rotating breaks every device already paired with this relay.",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    TextButton(onClick = { showRotateConfirm = true }) { Text("Rotate") }
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
                                "Censorship circumvention",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                "Use Tor bridges — for networks that block Tor directly.",
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
                            "Paste bridge lines (one per line) from bridges.torproject.org or " +
                            "the Telegram bot @GetBridgesBot. Vanilla bridges (IP:Port " +
                            "Fingerprint) and obfs4/Snowflake lines both work.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(Modifier.height(10.dp))
                        OutlinedTextField(
                            value = bridgeText,
                            onValueChange = { service.onBridgeTextChange(it) },
                            placeholder = { Text("Bridge lines") },
                            modifier = Modifier.fillMaxWidth().heightIn(min = 100.dp),
                            minLines = 3,
                            textStyle = MaterialTheme.typography.labelSmall
                        )
                        Spacer(Modifier.height(10.dp))
                        Button(
                            onClick = { service.saveBridges() },
                            modifier = Modifier.fillMaxWidth()
                        ) { Text("Save & reconnect") }

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

            Spacer(Modifier.height(4.dp))
        }
    }

    if (showWipeConfirm) {
        AlertDialog(
            onDismissRequest = { showWipeConfirm = false },
            title = { Text("Reset now?") },
            text = { Text("Deletes every currently queued message immediately. Devices that already picked theirs up are unaffected.") },
            confirmButton = {
                TextButton(onClick = {
                    service.wipeAllNow()
                    showWipeConfirm = false
                }) { Text("Reset now", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { showWipeConfirm = false }) { Text("Cancel") } }
        )
    }

    if (showRotateConfirm) {
        AlertDialog(
            onDismissRequest = { showRotateConfirm = false },
            title = { Text("Rotate access token?") },
            text = { Text("Every device currently paired with this relay will stop being able to use it until you share the new QR code with them again.") },
            confirmButton = {
                TextButton(onClick = {
                    service.regenerateToken()
                    showRotateConfirm = false
                    rotatedNotice = true
                }) { Text("Rotate", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { showRotateConfirm = false }) { Text("Cancel") } }
        )
    }

    LaunchedEffect(rotatedNotice) {
        if (rotatedNotice) {
            snackbarHostState.showSnackbar("Token rotated. Share the new code with paired devices.")
            rotatedNotice = false
        }
    }
}

private val logTimeFormat = SimpleDateFormat("HH:mm:ss", Locale.getDefault())

@Composable
private fun ActivityLogRow(entry: RelayEventLog.Entry) {
    val (label, color) = when (entry.kind) {
        RelayEventLog.Kind.STORED -> "stored" to MaterialTheme.colorScheme.onSurface
        RelayEventLog.Kind.FETCHED -> "fetched" to MaterialTheme.colorScheme.primary
        RelayEventLog.Kind.REJECTED -> "rejected" to MaterialTheme.colorScheme.error
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
            val detail = buildString {
                if (entry.bytes > 0) append(formatBytes(entry.bytes))
                entry.avgDwellMs?.let {
                    if (isNotEmpty()) append(" · ")
                    append("queued ${formatDuration(it)}")
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
                if (active) "RELAY ACTIVE" else "CONNECTING",
                style = MaterialTheme.typography.labelSmall,
                color = fg
            )
        }
    }
}

@Composable
private fun TtlStepper(hours: Int, onChange: (Int) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        StepButton(label = "−", enabled = hours > RelayConstants.MIN_TTL_HOURS) {
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
