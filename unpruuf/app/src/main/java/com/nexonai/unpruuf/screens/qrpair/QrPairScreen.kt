package com.nexonai.unpruuf.screens.qrpair

import android.Manifest
import android.graphics.Bitmap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.google.zxing.BarcodeFormat
import com.google.zxing.MultiFormatWriter
import com.google.zxing.common.BitMatrix
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import com.nexonai.unpruuf.BuildConfig
import com.nexonai.unpruuf.domain.AppEdition

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QrPairScreen(
    onNavigateBack: () -> Unit,
    viewModel: QrPairViewModel = hiltViewModel()
) {
    val errorState by viewModel.errorState.collectAsState()
    val successState by viewModel.successState.collectAsState()
    val myPayload by viewModel.myQrPayload.collectAsState()
    var pendingPayload by remember { mutableStateOf<QrPairingPayload?>(null) }
    var pendingCrossPlatformPayload by remember { mutableStateOf<CrossPlatformPairingPayload?>(null) }
    var pendingNodeMeshPayload by remember { mutableStateOf<NodeMeshPairingPayload?>(null) }
    var contactName by remember { mutableStateOf("") }
    // Debug-build-only fallback for testers who can't be scanned in person (see the copy/paste
    // UI below) — the same JSON string the QR encodes, just also offered as text.
    var pastedCode by remember { mutableStateOf("") }
    val clipboardManager = LocalClipboardManager.current
    // Settings → Relay set to Mandatory means this device's traffic never uses an onion anyway
    // (see RelayManager.RelayMode) — so it defaults to the no-onion cross-platform-format QR
    // automatically, for Android↔Android pairing too, not just genuine iOS interop. See
    // QrPairViewModel.isRelayMandatory's doc comment.
    val mandatoryActive = remember { viewModel.isRelayMandatory() }
    // Manual toggle, Pro-only, offered only when Mandatory isn't already forcing the choice —
    // see CROSS_PLATFORM_PLAN.md. Toggling this only changes which QR is SHOWN/GENERATED here;
    // scanning always tries both formats regardless (see scanLauncher below), so either device
    // can be in either mode and pairing still works.
    var crossPlatformMode by remember { mutableStateOf(mandatoryActive) }
    // unpruuf Business / Node-Mesh — independent of the Android/iOS toggle above (and of
    // mandatoryActive): a separate product line, not a third variant of the relay-mandatory
    // choice — see NODE_MESH_SPEC.md §0. Takes priority over crossPlatformMode/mandatoryActive
    // for what's actually shown/generated whenever it's on.
    var nodeMeshMode by remember { mutableStateOf(false) }

    val scanLauncher = rememberLauncherForActivityResult(ScanContract()) { result ->
        val contents = result.contents
        if (contents != null) {
            // Try the onion-based format first (the common case), then the cross-platform
            // (relay-based) format, then the Node-Mesh format — the three are told apart by
            // which fields are present ("o" / "n" without "s" / "s"), not by an explicit type
            // tag, so trying each in sequence is the dispatch.
            val onionPayload = viewModel.jsonToPayload(contents)
            if (onionPayload != null) {
                contactName = ""
                pendingPayload = onionPayload
            } else {
                val crossPlatformPayload = jsonToCrossPlatformPayload(contents)
                if (crossPlatformPayload != null) {
                    contactName = ""
                    pendingCrossPlatformPayload = crossPlatformPayload
                } else {
                    val nodeMeshPayload = jsonToNodeMeshPayload(contents)
                    if (nodeMeshPayload != null) {
                        contactName = ""
                        pendingNodeMeshPayload = nodeMeshPayload
                    } else {
                        viewModel.showUnreadableQrError()
                    }
                }
            }
        }
    }

    val cameraPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            val opts = ScanOptions().apply {
                setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                setPrompt("Scan unpruuf QR code")
                setBeepEnabled(false)
                setBarcodeImageEnabled(false)
                setOrientationLocked(true)
                setCaptureActivity(PortraitCaptureActivity::class.java)
            }
            scanLauncher.launch(opts)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Add contact") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, "Back")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            if (mandatoryActive) {
                Text(
                    "RELAY-ONLY PAIRING — MANDATORY MODE IS ON",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(bottom = 12.dp)
                )
            } else if (AppEdition.isPro) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.padding(bottom = 12.dp)
                ) {
                    FilterChip(
                        selected = !crossPlatformMode,
                        onClick = { crossPlatformMode = false },
                        label = { Text("Android contact") }
                    )
                    FilterChip(
                        selected = crossPlatformMode,
                        onClick = { crossPlatformMode = true },
                        label = { Text("iOS / cross-platform") }
                    )
                }
            }

            // unpruuf Business / Node-Mesh — always offered, regardless of edition or Mandatory
            // relay mode, since it's an orthogonal product line (see NODE_MESH_SPEC.md §0), not
            // gated the way the manual iOS toggle above is.
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.padding(bottom = 12.dp)
            ) {
                FilterChip(
                    selected = nodeMeshMode,
                    onClick = { nodeMeshMode = !nodeMeshMode },
                    label = { Text("Business (Node-Mesh)") }
                )
            }

            Text(
                "YOUR CODE",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(Modifier.height(16.dp))

            if (nodeMeshMode) {
                val nodeMeshPayload = viewModel.myNodeMeshQrPayload()
                if (nodeMeshPayload != null) {
                    val qrJson = remember(nodeMeshPayload) { nodeMeshPayloadToJson(nodeMeshPayload) }
                    val qrBitmap = remember(qrJson) { generateQrBitmap(qrJson) }
                    qrBitmap?.let {
                        Card(shape = RoundedCornerShape(18.dp), modifier = Modifier.size(280.dp)) {
                            Image(
                                bitmap = it.asImageBitmap(),
                                contentDescription = "My Business Node-Mesh QR code",
                                filterQuality = FilterQuality.None,
                                modifier = Modifier.fillMaxSize().background(Color.White).padding(8.dp)
                            )
                        }
                    }
                } else {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.size(240.dp),
                        verticalArrangement = Arrangement.Center
                    ) {
                        Text(
                            "Configure a node first",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(
                            "Business Node-Mesh pairing needs your own node — set one up in " +
                            "Settings → Business Node-Mesh, then come back here.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                            modifier = Modifier.padding(top = 8.dp)
                        )
                    }
                }
            } else if (crossPlatformMode) {
                val crossPlatformPayload = viewModel.myCrossPlatformQrPayload()
                if (crossPlatformPayload != null) {
                    val qrJson = remember(crossPlatformPayload) { crossPlatformPayloadToJson(crossPlatformPayload) }
                    val qrBitmap = remember(qrJson) { generateQrBitmap(qrJson) }
                    qrBitmap?.let {
                        Card(shape = RoundedCornerShape(18.dp), modifier = Modifier.size(280.dp)) {
                            Image(
                                bitmap = it.asImageBitmap(),
                                contentDescription = "My cross-platform QR code",
                                filterQuality = FilterQuality.None,
                                modifier = Modifier.fillMaxSize().background(Color.White).padding(8.dp)
                            )
                        }
                    }
                } else {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.size(240.dp),
                        verticalArrangement = Arrangement.Center
                    ) {
                        Text(
                            "Configure a relay first",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(
                            "Cross-platform pairing needs a relay — set one up in " +
                            "Settings → Relay, then come back here.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                            modifier = Modifier.padding(top = 8.dp)
                        )
                    }
                }
            } else {
            myPayload?.let { payload ->
                val qrJson = viewModel.payloadToJson(payload)
                val qrBitmap = remember(qrJson) { generateQrBitmap(qrJson) }
                qrBitmap?.let {
                    Card(
                        shape = RoundedCornerShape(18.dp),
                        modifier = Modifier.size(280.dp)
                    ) {
                        Image(
                            bitmap = it.asImageBitmap(),
                            contentDescription = "Mein QR-Code",
                            // FilterQuality.None keeps module edges perfectly
                            // sharp black/white when Compose scales the bitmap
                            // up to fill the card — bilinear smoothing here
                            // turns crisp edges into gray gradients, which
                            // measurably hurts weak-autofocus camera scanning.
                            filterQuality = FilterQuality.None,
                            modifier = Modifier
                                .fillMaxSize()
                                .background(Color.White)
                                .padding(8.dp)
                        )
                    }
                }
            } ?: Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.size(240.dp),
                verticalArrangement = Arrangement.Center
            ) {
                CircularProgressIndicator()
                Spacer(Modifier.height(16.dp))
                Text(
                    "Waiting for Tor network…",
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

            // Debug-build only: a remote tester can't scan a QR code in person. Copy the exact
            // same string the QR encodes and send it through any channel (message, email) —
            // the tester pastes it into the "paste their code" field below on their own device.
            // Deliberately not offered in release builds: an in-person scan is a real physical-
            // proximity check a copy/pasted code sent over another channel doesn't have.
            if (BuildConfig.DEBUG) {
                val debugCode = if (nodeMeshMode) {
                    viewModel.myNodeMeshQrPayload()?.let { nodeMeshPayloadToJson(it) }
                } else if (crossPlatformMode) {
                    viewModel.myCrossPlatformQrPayload()?.let { crossPlatformPayloadToJson(it) }
                } else {
                    myPayload?.let { viewModel.payloadToJson(it) }
                }
                debugCode?.let { code ->
                    Spacer(Modifier.height(10.dp))
                    OutlinedButton(
                        onClick = { clipboardManager.setText(AnnotatedString(code)) },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Default.ContentCopy, null)
                        Spacer(Modifier.width(8.dp))
                        Text("Copy code (debug — share manually)")
                    }
                }
            }

            Spacer(Modifier.height(14.dp))

            // Live readiness in the technical voice — mirrors the contact list's pill. Only
            // meaningful for the Android/onion QR (cross-platform/Node-Mesh readiness is a flat
            // "relay/node configured or not", already shown as its own message above).
            if (!crossPlatformMode && !nodeMeshMode) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier
                        .size(7.dp)
                        .background(
                            if (myPayload != null) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.tertiary,
                            RoundedCornerShape(50)
                        )
                )
                Spacer(Modifier.width(7.dp))
                Text(
                    if (myPayload != null) "tor active — your code is ready"
                    else "connecting to tor…",
                    style = MaterialTheme.typography.labelSmall,
                    color = if (myPayload != null) MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.tertiary
                )
            }
            }

            Spacer(Modifier.height(28.dp))

            Button(
                onClick = { cameraPermission.launch(Manifest.permission.CAMERA) },
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.Default.QrCodeScanner, null)
                Spacer(Modifier.width(8.dp))
                Text("Scan their code", fontWeight = FontWeight.Bold)
            }

            // Debug-build only, the other half of the copy button above: paste a code a
            // remote tester sent you instead of scanning them in person. Feeds the exact
            // same dispatch (onion format, then cross-platform format) and the exact same
            // "name this contact" flow as a camera scan — no separate contact-creation path.
            if (BuildConfig.DEBUG) {
                Spacer(Modifier.height(14.dp))
                OutlinedTextField(
                    value = pastedCode,
                    onValueChange = { pastedCode = it },
                    label = { Text("Paste their code (debug)") },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(8.dp))
                OutlinedButton(
                    onClick = {
                        val trimmed = pastedCode.trim()
                        val onionPayload = viewModel.jsonToPayload(trimmed)
                        if (onionPayload != null) {
                            contactName = ""
                            pendingPayload = onionPayload
                            pastedCode = ""
                        } else {
                            val crossPlatformPayload = jsonToCrossPlatformPayload(trimmed)
                            if (crossPlatformPayload != null) {
                                contactName = ""
                                pendingCrossPlatformPayload = crossPlatformPayload
                                pastedCode = ""
                            } else {
                                val nodeMeshPayload = jsonToNodeMeshPayload(trimmed)
                                if (nodeMeshPayload != null) {
                                    contactName = ""
                                    pendingNodeMeshPayload = nodeMeshPayload
                                    pastedCode = ""
                                } else {
                                    viewModel.showUnreadableQrError()
                                }
                            }
                        }
                    },
                    enabled = pastedCode.isNotBlank(),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Add from pasted code")
                }
                Spacer(Modifier.height(10.dp))
                Text(
                    "Testing only — a code shared this way (message, email) skips the " +
                    "in-person check a QR scan gives you. Anyone who intercepts it could " +
                    "pair as this contact.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                )
            }

            Spacer(Modifier.height(14.dp))

            Text(
                "Both devices scan each other. The code carries your reachable address " +
                "and keys — no account, no phone number, nothing else.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center
            )

            errorState?.let { error ->
                Spacer(Modifier.height(16.dp))
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        error,
                        modifier = Modifier.padding(12.dp),
                        color = MaterialTheme.colorScheme.onErrorContainer
                    )
                }
                LaunchedEffect(error) {
                    kotlinx.coroutines.delay(4000)
                    viewModel.clearError()
                }
            }

            successState?.let { success ->
                Spacer(Modifier.height(16.dp))
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.primaryContainer
                    ),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        success,
                        modifier = Modifier.padding(12.dp),
                        color = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                }
                LaunchedEffect(success) {
                    kotlinx.coroutines.delay(2000)
                    viewModel.clearSuccess()
                    onNavigateBack()
                }
            }
        }
    }

    pendingPayload?.let { payload ->
        AlertDialog(
            onDismissRequest = { pendingPayload = null },
            title = { Text("Name contact") },
            text = {
                Column {
                    Text(
                        "What do you want to call this contact?",
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = contactName,
                        onValueChange = { contactName = it },
                        label = { Text("Name") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        if (contactName.isNotBlank()) {
                            viewModel.handleScannedQr(payload, contactName.trim())
                            pendingPayload = null
                        }
                    },
                    enabled = contactName.isNotBlank()
                ) { Text("Add") }
            },
            dismissButton = {
                TextButton(onClick = { pendingPayload = null }) { Text("Cancel") }
            }
        )
    }

    pendingCrossPlatformPayload?.let { payload ->
        AlertDialog(
            onDismissRequest = { pendingCrossPlatformPayload = null },
            title = { Text("Name contact") },
            text = {
                Column {
                    Text(
                        "What do you want to call this contact?",
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = contactName,
                        onValueChange = { contactName = it },
                        label = { Text("Name") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        if (contactName.isNotBlank()) {
                            viewModel.handleScannedCrossPlatformQr(payload, contactName.trim())
                            pendingCrossPlatformPayload = null
                        }
                    },
                    enabled = contactName.isNotBlank()
                ) { Text("Add") }
            },
            dismissButton = {
                TextButton(onClick = { pendingCrossPlatformPayload = null }) { Text("Cancel") }
            }
        )
    }

    pendingNodeMeshPayload?.let { payload ->
        AlertDialog(
            onDismissRequest = { pendingNodeMeshPayload = null },
            title = { Text("Name contact") },
            text = {
                Column {
                    Text(
                        "What do you want to call this contact?",
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = contactName,
                        onValueChange = { contactName = it },
                        label = { Text("Name") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        if (contactName.isNotBlank()) {
                            viewModel.handleScannedNodeMeshQr(payload, contactName.trim())
                            pendingNodeMeshPayload = null
                        }
                    },
                    enabled = contactName.isNotBlank()
                ) { Text("Add") }
            },
            dismissButton = {
                TextButton(onClick = { pendingNodeMeshPayload = null }) { Text("Cancel") }
            }
        )
    }
}

private fun generateQrBitmap(content: String, size: Int = 512): Bitmap? {
    return try {
        val matrix: BitMatrix = MultiFormatWriter().encode(
            content, BarcodeFormat.QR_CODE, size, size
        )
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
}
