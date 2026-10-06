package com.nexonai.unpruuf.screens.qrpair

import android.Manifest
import android.graphics.Bitmap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.res.stringResource
import com.nexonai.unpruuf.R

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QrPairScreen(
    onNavigateBack: () -> Unit,
    viewModel: QrPairViewModel = hiltViewModel()
) {
    val errorState by viewModel.errorState.collectAsState()
    val successState by viewModel.successState.collectAsState()
    val myPayload by viewModel.myQrPayload.collectAsState()
    // Business Node-Mesh: which list the contact being added gets its three nodes from.
    val selectedNodeListId by viewModel.selectedNodeListId.collectAsState()
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
    var nodeMeshMode by remember { mutableStateOf(viewModel.isNodeMeshUsable()) }

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

    val scanPrompt = stringResource(R.string.qr_scan_prompt)
    val cameraPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            val opts = ScanOptions().apply {
                setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                setPrompt(scanPrompt)
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
                title = { Text(stringResource(R.string.qr_title_add_contact)) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, stringResource(R.string.qr_cd_back))
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
                    stringResource(R.string.qr_relay_only_mandatory),
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
                        label = { Text(stringResource(R.string.qr_chip_android_contact)) }
                    )
                    FilterChip(
                        selected = crossPlatformMode,
                        onClick = { crossPlatformMode = true },
                        label = { Text(stringResource(R.string.qr_chip_ios_cross_platform)) }
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
                    label = { Text(stringResource(R.string.qr_chip_business_node_mesh)) }
                )
            }

            Text(
                stringResource(R.string.qr_your_code),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(Modifier.height(16.dp))

            if (nodeMeshMode) {
                // Mandatory choice: the QR carries three nodes taken from the chosen list.
                val listChoices = remember(selectedNodeListId, successState) { viewModel.nodeListChoices() }
                if (listChoices.isNotEmpty()) {
                    Text(
                        stringResource(R.string.qr_node_list_title),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState())
                            .padding(vertical = 8.dp)
                    ) {
                        listChoices.forEach { choice ->
                            FilterChip(
                                selected = choice.id == selectedNodeListId,
                                onClick = { viewModel.selectNodeList(choice.id) },
                                label = {
                                    Text(
                                        if (choice.freeSlots > 0)
                                            stringResource(R.string.qr_node_list_chip, choice.name, choice.nodeCount, choice.serverCount, choice.freeSlots)
                                        else stringResource(R.string.qr_node_list_chip_full, choice.name, choice.nodeCount, choice.serverCount)
                                    )
                                }
                            )
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                }
                val nodeMeshPayload = viewModel.myNodeMeshQrPayload()
                if (nodeMeshPayload != null) {
                    val qrJson = remember(nodeMeshPayload) { nodeMeshPayloadToJson(nodeMeshPayload) }
                    val qrBitmap = remember(qrJson) { generateQrBitmap(qrJson) }
                    qrBitmap?.let {
                        Card(shape = RoundedCornerShape(18.dp), modifier = Modifier.size(280.dp)) {
                            Image(
                                bitmap = it.asImageBitmap(),
                                contentDescription = stringResource(R.string.qr_cd_my_node_mesh_qr),
                                filterQuality = FilterQuality.None,
                                modifier = Modifier.fillMaxSize().background(Color.White).padding(8.dp)
                            )
                        }
                    }
                } else if (listChoices.isNotEmpty()) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.size(240.dp),
                        verticalArrangement = Arrangement.Center
                    ) {
                        Text(
                            stringResource(R.string.qr_choose_list_first),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(
                            stringResource(R.string.qr_choose_list_first_body),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                            modifier = Modifier.padding(top = 8.dp)
                        )
                    }
                } else {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.size(240.dp),
                        verticalArrangement = Arrangement.Center
                    ) {
                        Text(
                            stringResource(R.string.qr_configure_node_first),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(
                            stringResource(R.string.qr_configure_node_first_body),
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
                                contentDescription = stringResource(R.string.qr_cd_my_cross_platform_qr),
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
                            stringResource(R.string.qr_configure_relay_first),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(
                            stringResource(R.string.qr_configure_relay_first_body),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                            modifier = Modifier.padding(top = 8.dp)
                        )
                    }
                }
            } else {
            LaunchedEffect(Unit) { viewModel.requestOnionQr() }
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
                            contentDescription = stringResource(R.string.qr_cd_my_qr),
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
                    stringResource(R.string.qr_waiting_for_tor),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    stringResource(R.string.qr_first_start_note),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            }

            // Debug-build fallback for testers who can't be scanned in person — copy the exact
            // same string the QR encodes and send it through any channel (message, email), the
            // tester pastes it into the "paste their code" field below on their own device.
            // Not offered in ordinary release builds: an in-person scan is a real physical-
            // proximity check a copy/pasted code sent over another channel doesn't have.
            //
            // Whistleblower: no longer needed in normal use — after scanning the organisation's QR
            // the app sends its own code to the officer automatically (OfficerCase.kt intake).
            // Still offered as a manual fallback for officer dashboards older than that.
            if (BuildConfig.DEBUG || AppEdition.isWhistleblower) {
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
                        Text(
                            if (AppEdition.isWhistleblower) stringResource(R.string.qr_copy_code_whistleblower)
                            else stringResource(R.string.qr_copy_code_debug)
                        )
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
                    if (myPayload != null) stringResource(R.string.qr_tor_active)
                    else stringResource(R.string.qr_connecting_to_tor),
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
                Text(stringResource(R.string.qr_scan_their_code), fontWeight = FontWeight.Bold)
            }

            // The other half of the copy button above: paste a code sent through another
            // channel instead of scanning it in person. Feeds the exact same dispatch (onion
            // format, then cross-platform format) and the exact same "name this contact" flow
            // as a camera scan — no separate contact-creation path. Enabled on Whistleblower
            // release builds for the same reason as the copy button above (not a debug-only
            // testing affordance there — see that button's doc comment).
            if (BuildConfig.DEBUG || AppEdition.isWhistleblower) {
                Spacer(Modifier.height(14.dp))
                OutlinedTextField(
                    value = pastedCode,
                    onValueChange = { pastedCode = it },
                    label = { Text(if (AppEdition.isWhistleblower) stringResource(R.string.qr_paste_officer_code) else stringResource(R.string.qr_paste_their_code_debug)) },
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
                    Text(stringResource(R.string.qr_add_from_pasted_code))
                }
                Spacer(Modifier.height(10.dp))
                Text(
                    stringResource(R.string.qr_pasted_code_warning),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                )
            }

            Spacer(Modifier.height(14.dp))

            Text(
                stringResource(R.string.qr_both_devices_scan_footer),
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
            title = { Text(stringResource(R.string.qr_name_contact_title)) },
            text = {
                Column {
                    Text(
                        stringResource(R.string.qr_name_contact_body),
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = contactName,
                        onValueChange = { contactName = it },
                        label = { Text(stringResource(R.string.qr_name_field)) },
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
                ) { Text(stringResource(R.string.qr_add)) }
            },
            dismissButton = {
                TextButton(onClick = { pendingPayload = null }) { Text(stringResource(R.string.qr_cancel)) }
            }
        )
    }

    pendingCrossPlatformPayload?.let { payload ->
        AlertDialog(
            onDismissRequest = { pendingCrossPlatformPayload = null },
            title = { Text(stringResource(R.string.qr_name_contact_title)) },
            text = {
                Column {
                    Text(
                        stringResource(R.string.qr_name_contact_body),
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = contactName,
                        onValueChange = { contactName = it },
                        label = { Text(stringResource(R.string.qr_name_field)) },
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
                ) { Text(stringResource(R.string.qr_add)) }
            },
            dismissButton = {
                TextButton(onClick = { pendingCrossPlatformPayload = null }) { Text(stringResource(R.string.qr_cancel)) }
            }
        )
    }

    pendingNodeMeshPayload?.let { payload ->
        AlertDialog(
            onDismissRequest = { pendingNodeMeshPayload = null },
            title = { Text(stringResource(R.string.qr_name_contact_title)) },
            text = {
                Column {
                    Text(
                        stringResource(R.string.qr_name_contact_body),
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = contactName,
                        onValueChange = { contactName = it },
                        label = { Text(stringResource(R.string.qr_name_field)) },
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
                ) { Text(stringResource(R.string.qr_add)) }
            },
            dismissButton = {
                TextButton(onClick = { pendingNodeMeshPayload = null }) { Text(stringResource(R.string.qr_cancel)) }
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
