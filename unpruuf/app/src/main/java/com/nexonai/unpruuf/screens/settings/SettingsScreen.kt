package com.nexonai.unpruuf.screens.settings

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.biometric.BiometricManager
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Fingerprint
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import com.nexonai.unpruuf.BuildConfig
import com.nexonai.unpruuf.R
import com.nexonai.unpruuf.domain.AppEdition
import com.nexonai.unpruuf.domain.license.LicenseState
import com.nexonai.unpruuf.domain.network.NodeMeshManager
import com.nexonai.unpruuf.domain.network.RelayManager
import com.nexonai.unpruuf.screens.qrpair.PortraitCaptureActivity

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onNavigateBack: () -> Unit,
    onNavigateToInfo: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel()
) {
    val bridgesEnabled by viewModel.bridgesEnabled.collectAsState()
    val bridgeText by viewModel.bridgeText.collectAsState()
    val status by viewModel.status.collectAsState()
    val identityStatus by viewModel.identityStatus.collectAsState()
    var showRegenerateIdentityDialog by remember { mutableStateOf(false) }
    val relayMode by viewModel.relayMode.collectAsState()
    val biometricEnabled by viewModel.biometricEnabled.collectAsState()
    val context = LocalContext.current
    val biometricAvailable = remember {
        BiometricManager.from(context)
            .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) ==
            BiometricManager.BIOMETRIC_SUCCESS
    }
    val relayConfiguredOnion by viewModel.relayConfiguredOnion.collectAsState()
    val relayInput by viewModel.relayInput.collectAsState()
    val relayStatus by viewModel.relayStatus.collectAsState()
    val backupRelayInput by viewModel.backupRelayInput.collectAsState()
    val backupRelay2Input by viewModel.backupRelay2Input.collectAsState()
    val backupRelayStatus by viewModel.backupRelayStatus.collectAsState()
    val licenseState by viewModel.licenseState.collectAsState()
    val licenseInput by viewModel.licenseInput.collectAsState()
    val licenseStatus by viewModel.licenseStatus.collectAsState()
    val relayPoolLastImported by viewModel.relayPoolLastImported.collectAsState()
    val relayPoolInput by viewModel.relayPoolInput.collectAsState()
    val relayPoolStatus by viewModel.relayPoolStatus.collectAsState()
    val myNodeAddresses by viewModel.myNodeAddresses.collectAsState()
    val nodeMeshInput by viewModel.nodeMeshInput.collectAsState()
    val nodeMeshStatus by viewModel.nodeMeshStatus.collectAsState()
    val migratingAddress by viewModel.migratingAddress.collectAsState()
    val migrateInput by viewModel.migrateInput.collectAsState()

    val relayScanLauncher = rememberLauncherForActivityResult(ScanContract()) { result ->
        result.contents?.let { viewModel.onRelayQrScanned(it) }
    }
    val relayCameraPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            relayScanLauncher.launch(
                ScanOptions().apply {
                    setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                    setPrompt("Scan relay QR code")
                    setBeepEnabled(false)
                    setBarcodeImageEnabled(false)
                    setOrientationLocked(true)
                    setCaptureActivity(PortraitCaptureActivity::class.java)
                }
            )
        }
    }
    val nodeMeshScanLauncher = rememberLauncherForActivityResult(ScanContract()) { result ->
        result.contents?.let { viewModel.onNodeMeshQrScanned(it) }
    }
    val nodeMeshCameraPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            nodeMeshScanLauncher.launch(
                ScanOptions().apply {
                    setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                    setPrompt("Scan node QR code")
                    setBeepEnabled(false)
                    setBarcodeImageEnabled(false)
                    setOrientationLocked(true)
                    setCaptureActivity(PortraitCaptureActivity::class.java)
                }
            )
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, "Back")
                    }
                },
                actions = {
                    // Edition chip in the app bar — gold for Pro, seafoam for Standard,
                    // blue for Client (the accent IS the edition, so primary just works).
                    Surface(
                        color = MaterialTheme.colorScheme.primary,
                        shape = MaterialTheme.shapes.small
                    ) {
                        Text(
                            AppEdition.label.uppercase(),
                            color = MaterialTheme.colorScheme.onPrimary,
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                        )
                    }
                    Spacer(Modifier.width(12.dp))
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
        ) {
            SectionHeader("Security")
            ListItem(
                headlineContent = { Text("App edition") },
                supportingContent = {
                    Text(
                        "unpruuf ${AppEdition.label}",
                        color = MaterialTheme.colorScheme.primary,
                        fontWeight = FontWeight.Bold
                    )
                },
                leadingContent = { Icon(Icons.Default.Shield, null) }
            )
            HorizontalDivider()
            ListItem(
                headlineContent = { Text("App version") },
                // BuildConfig.VERSION_NAME already carries the per-edition suffix
                // (e.g. "1.01-pro") set in build.gradle.kts's flavor blocks.
                supportingContent = { Text(BuildConfig.VERSION_NAME) },
                leadingContent = { Icon(Icons.Default.Info, null) }
            )
            HorizontalDivider()
            ListItem(
                headlineContent = { Text("Network & security status") },
                supportingContent = { Text("Tor connection state and GRAL security overview") },
                leadingContent = { Icon(Icons.Default.Info, null) },
                trailingContent = { Icon(Icons.Default.ChevronRight, null) },
                modifier = Modifier.clickable(onClick = onNavigateToInfo)
            )
            HorizontalDivider()
            ListItem(
                headlineContent = { Text("Screenshots") },
                supportingContent = { Text("Blocked (FLAG_SECURE)") },
                leadingContent = { Icon(Icons.Default.Shield, null) }
            )
            HorizontalDivider()
            ListItem(
                headlineContent = { Text("Message storage") },
                supportingContent = { Text("RAM-only (GRAL Pillar 2)") },
                leadingContent = { Icon(Icons.Default.Shield, null) }
            )
            if (biometricAvailable) {
                HorizontalDivider()
                ListItem(
                    headlineContent = { Text("Fingerprint unlock") },
                    supportingContent = {
                        Text(
                            "Alongside the PIN, not instead of it — can only unlock normally, " +
                            "never the panic PIN. Off by default."
                        )
                    },
                    leadingContent = { Icon(Icons.Default.Fingerprint, null) },
                    trailingContent = {
                        Switch(
                            checked = biometricEnabled,
                            onCheckedChange = { viewModel.onBiometricEnabledChange(it) }
                        )
                    }
                )
            }
            HorizontalDivider()
            ListItem(
                headlineContent = { Text("Pairing identity") },
                supportingContent = {
                    Text(
                        "The identity your own QR code shows to a NEW contact. Renewing it " +
                        "doesn't affect contacts you've already paired with."
                    )
                },
                leadingContent = { Icon(Icons.Default.Shield, null) },
                trailingContent = {
                    TextButton(onClick = { showRegenerateIdentityDialog = true }) { Text("Renew") }
                }
            )
            identityStatus?.let {
                Column(modifier = Modifier.padding(horizontal = 16.dp)) {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                    LaunchedEffect(it) {
                        kotlinx.coroutines.delay(6000)
                        viewModel.clearIdentityStatus()
                    }
                }
                Spacer(Modifier.height(8.dp))
            }
            HorizontalDivider()

            SectionHeader("Censorship Circumvention")
            ListItem(
                headlineContent = { Text("Use Tor bridges") },
                supportingContent = {
                    Text("For networks that block Tor (e.g. certain countries/providers)")
                },
                leadingContent = { Icon(Icons.Default.Public, null) },
                trailingContent = {
                    Switch(
                        checked = bridgesEnabled,
                        onCheckedChange = {
                            viewModel.onBridgesEnabledChange(it)
                            if (!it) viewModel.save() // apply disabling immediately
                        }
                    )
                }
            )
            if (bridgesEnabled) {
                Column(modifier = Modifier.padding(horizontal = 16.dp)) {
                    Text(
                        "Paste bridge lines (one per line). Get them from " +
                        "bridges.torproject.org or the Telegram bot @GetBridgesBot.\n" +
                        "Vanilla bridges (IP:Port Fingerprint) work immediately. " +
                        "obfs4/Snowflake follow in the next update.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = bridgeText,
                        onValueChange = { viewModel.onBridgeTextChange(it) },
                        label = { Text("Bridge lines") },
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 100.dp),
                        minLines = 3
                    )
                    Spacer(Modifier.height(8.dp))
                    Button(
                        onClick = { viewModel.save() },
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("Save & reconnect Tor") }
                    status?.let {
                        Spacer(Modifier.height(8.dp))
                        Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                        LaunchedEffect(it) {
                            kotlinx.coroutines.delay(6000)
                            viewModel.clearStatus()
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                }
            }
            HorizontalDivider()

            // Client edition is free (see AppEdition/LicenseManager.requiresLicense) — no
            // license concept applies to it, so this section doesn't exist for that build.
            if (!AppEdition.isClient) {
                SectionHeader("License")
                val licenseInfo = when (val s = licenseState) {
                    is LicenseState.Valid -> s.info
                    is LicenseState.ExpiringSoon -> s.info
                    is LicenseState.Expired -> s.info
                    else -> null
                }
                val licenseHeadline = when (val s = licenseState) {
                    is LicenseState.Valid -> "Active — expires ${formatLicenseDate(s.info.expiresAtMs)}"
                    is LicenseState.ExpiringSoon ->
                        "Expires in ${s.daysLeft} day${if (s.daysLeft == 1L) "" else "s"} — renew soon"
                    is LicenseState.Expired -> "Expired ${formatLicenseDate(s.info.expiresAtMs)}"
                    is LicenseState.Invalid -> s.reason
                    is LicenseState.NotConfigured -> "No license configured"
                }
                ListItem(
                    headlineContent = { Text(licenseHeadline) },
                    supportingContent = licenseInfo?.let {
                        { Text("Serial ${it.serial} • ${it.customer}") }
                    },
                    leadingContent = { Icon(Icons.Default.VerifiedUser, null) }
                )
                Column(modifier = Modifier.padding(horizontal = 16.dp)) {
                    OutlinedTextField(
                        value = licenseInput,
                        onValueChange = { viewModel.onLicenseInputChange(it) },
                        label = { Text("License code") },
                        placeholder = { Text("unpruuf-license:v1:...") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(8.dp))
                    Button(
                        onClick = { viewModel.saveLicense() },
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("Activate") }
                    licenseStatus?.let {
                        Spacer(Modifier.height(8.dp))
                        Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                        LaunchedEffect(it) {
                            kotlinx.coroutines.delay(6000)
                            viewModel.clearLicenseStatus()
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                }
                HorizontalDivider()
            }

            SectionHeader("Relay (optional)")
            ListItem(
                headlineContent = { Text("Relay mode") },
                supportingContent = {
                    Text(
                        "Off: never used. Auto: best-effort store-and-forward mailbox — used " +
                        "only when a contact can't be reached directly, or proactively for " +
                        "transfers over 2 MB. Mandatory: every message routes through the " +
                        "relay, LAN/Tor-direct skipped entirely — meant for testing the relay " +
                        "path, switch freely. Off by default."
                    )
                },
                leadingContent = { Icon(Icons.Default.Send, null) }
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                RelayModeChip("Off", RelayManager.RelayMode.OFF, relayMode) {
                    viewModel.onRelayModeChange(it)
                    viewModel.saveRelay() // apply immediately, same as the old disable-switch did
                }
                RelayModeChip("Auto", RelayManager.RelayMode.AUTO, relayMode) {
                    viewModel.onRelayModeChange(it)
                    viewModel.saveRelay()
                }
                RelayModeChip("Mandatory", RelayManager.RelayMode.MANDATORY, relayMode) {
                    viewModel.onRelayModeChange(it)
                    viewModel.saveRelay()
                }
            }
            if (relayMode != RelayManager.RelayMode.OFF) {
                Column(modifier = Modifier.padding(horizontal = 16.dp)) {
                    if (relayConfiguredOnion.isNotEmpty()) {
                        Text(
                            "Configured: $relayConfiguredOnion",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(Modifier.height(8.dp))
                    }
                    Button(
                        onClick = { relayCameraPermission.launch(Manifest.permission.CAMERA) },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Default.QrCodeScanner, null)
                        Spacer(Modifier.width(8.dp))
                        Text("Scan QR code")
                    }
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "or paste the connection string shown by the relay",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = relayInput,
                        onValueChange = { viewModel.onRelayInputChange(it) },
                        label = { Text("Connection string") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(8.dp))
                    Button(
                        onClick = { viewModel.saveRelay() },
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("Save") }
                    relayStatus?.let {
                        Spacer(Modifier.height(8.dp))
                        Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                        LaunchedEffect(it) {
                            kotlinx.coroutines.delay(6000)
                            viewModel.clearRelayStatus()
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                }

                Column(modifier = Modifier.padding(horizontal = 16.dp)) {
                    Text(
                        "Backup relays",
                        style = MaterialTheme.typography.titleSmall
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "Tried in order if the primary relay above is unreachable. Both are " +
                        "shared with new contacts in your QR code, so they can reach you even " +
                        "when one relay is down. Leave empty if you don't have any.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = backupRelayInput,
                        onValueChange = { viewModel.onBackupRelayInputChange(it) },
                        label = { Text("First backup") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = backupRelay2Input,
                        onValueChange = { viewModel.onBackupRelay2InputChange(it) },
                        label = { Text("Second backup") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(8.dp))
                    Button(
                        onClick = { viewModel.saveBackupRelay() },
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("Save") }
                    backupRelayStatus?.let {
                        Spacer(Modifier.height(8.dp))
                        Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                        LaunchedEffect(it) {
                            kotlinx.coroutines.delay(6000)
                            viewModel.clearBackupRelayStatus()
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                }
            }
            HorizontalDivider()

            SectionHeader("Company relay list (optional)")
            ListItem(
                headlineContent = {
                    Text(relayPoolLastImported?.let { "Imported: ${it.org} (${it.relays.size} relay${if (it.relays.size == 1) "" else "s"})" }
                        ?: "No company relay list imported")
                },
                supportingContent = {
                    Text(
                        "Paste a signed relay list from your organization to fill the backup " +
                        "relay above automatically. Re-importing an updated list replaces the " +
                        "previous one."
                    )
                },
                leadingContent = { Icon(Icons.Default.Send, null) }
            )
            Column(modifier = Modifier.padding(horizontal = 16.dp)) {
                OutlinedTextField(
                    value = relayPoolInput,
                    onValueChange = { viewModel.onRelayPoolInputChange(it) },
                    label = { Text("Relay list code") },
                    placeholder = { Text("unpruuf-relaypool:v1:...") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(8.dp))
                Button(
                    onClick = { viewModel.importRelayPool() },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Import") }
                relayPoolStatus?.let {
                    Spacer(Modifier.height(8.dp))
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                    LaunchedEffect(it) {
                        kotlinx.coroutines.delay(6000)
                        viewModel.clearRelayPoolStatus()
                    }
                }
                Spacer(Modifier.height(8.dp))
            }
            HorizontalDivider()

            SectionHeader("Business Node-Mesh (optional)")
            ListItem(
                headlineContent = { Text("Your own nodes") },
                supportingContent = {
                    Text(
                        "Add your own unpruuf Node-Mesh server(s) — see node-mesh-server/README.md. " +
                        "Only you can write to your own node; a Business/Node-Mesh contact can " +
                        "read from it once paired. Up to ${NodeMeshManager.NODE_POOL_MAX_SIZE}."
                    )
                },
                leadingContent = { Icon(Icons.Default.Send, null) }
            )
            Column(modifier = Modifier.padding(horizontal = 16.dp)) {
                myNodeAddresses.forEach { address ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            address,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.weight(1f)
                        )
                        TextButton(onClick = { viewModel.startMigrateNode(address) }) { Text("Migrate") }
                        TextButton(onClick = { viewModel.removeMyNode(address) }) { Text("Remove") }
                    }
                    if (migratingAddress == address) {
                        Column(modifier = Modifier.padding(start = 8.dp, top = 4.dp, bottom = 4.dp)) {
                            Text(
                                "This node moved to a new address — every paired Business " +
                                "Node-Mesh contact will be notified automatically.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(Modifier.height(4.dp))
                            OutlinedTextField(
                                value = migrateInput,
                                onValueChange = { viewModel.onMigrateInputChange(it) },
                                label = { Text("New address") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth()
                            )
                            Spacer(Modifier.height(4.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(onClick = { viewModel.confirmMigrateNode() }) { Text("Confirm migration") }
                                OutlinedButton(onClick = { viewModel.cancelMigrateNode() }) { Text("Cancel") }
                            }
                        }
                    }
                }
                if (myNodeAddresses.isNotEmpty()) Spacer(Modifier.height(8.dp))
                Button(
                    onClick = { nodeMeshCameraPermission.launch(Manifest.permission.CAMERA) },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Default.QrCodeScanner, null)
                    Spacer(Modifier.width(8.dp))
                    Text("Scan node QR code")
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    "or paste the string shown by your node on first start",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = nodeMeshInput,
                    onValueChange = { viewModel.onNodeMeshInputChange(it) },
                    label = { Text("Node owner string") },
                    placeholder = { Text("unpruuf-node-owner:v1:...") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(8.dp))
                Button(
                    onClick = { viewModel.addMyNode() },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Add") }
                nodeMeshStatus?.let {
                    Spacer(Modifier.height(8.dp))
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                    LaunchedEffect(it) {
                        kotlinx.coroutines.delay(6000)
                        viewModel.clearNodeMeshStatus()
                    }
                }
                Spacer(Modifier.height(8.dp))
            }
            HorizontalDivider()

            SectionHeader("About")
            ListItem(
                headlineContent = { Text("unpruuf Standard") },
                supportingContent = { Text("Version 1.0.0 • GRAL v3.0") },
                leadingContent = { Icon(Icons.Default.Info, null) }
            )
            HorizontalDivider()
            ListItem(
                headlineContent = { Text("Package") },
                supportingContent = { Text("com.nexonai.unpruuf") },
                leadingContent = { Icon(Icons.Default.Info, null) }
            )
            HorizontalDivider()
            ListItem(
                headlineContent = { Text("Created by") },
                supportingContent = { Text("NexonAI") },
                leadingContent = { Icon(Icons.Default.Info, null) }
            )
            // logo_nexonai.jpg is the real NexonAI company asset — square, white
            // background. Sitting it directly on this screen's dark "Quiet Ink"
            // surface used to look like a mismatched crop; this "letterhead card"
            // (BRANDING.md's print/letterhead spec, adapted for a mobile footer:
            // light card, a dark rule beneath the mark, small monospace identity
            // line) gives it its own contained, intentional white ground instead
            // of turning the whole Settings screen white.
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFFF7F5F1))
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Image(
                        painter = painterResource(R.drawable.logo_nexonai),
                        contentDescription = "NexonAI",
                        contentScale = ContentScale.Fit,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(72.dp)
                    )
                    Spacer(Modifier.height(12.dp))
                    HorizontalDivider(thickness = 2.dp, color = Color(0xFF1B1B1B))
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "NexonAI",
                        style = MaterialTheme.typography.labelMedium,
                        color = Color(0xFF1B1B1B)
                    )
                }
            }
        }
    }

    if (showRegenerateIdentityDialog) {
        AlertDialog(
            onDismissRequest = { showRegenerateIdentityDialog = false },
            title = { Text("Renew pairing identity?") },
            text = {
                Text(
                    "Your own QR code will show a new identity from now on. Contacts you've " +
                    "already paired with are unaffected — they already run on their own " +
                    "per-contact identity, exchanged once right after pairing."
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.regeneratePairingIdentity()
                    showRegenerateIdentityDialog = false
                }) { Text("Renew") }
            },
            dismissButton = {
                TextButton(onClick = { showRegenerateIdentityDialog = false }) { Text("Cancel") }
            }
        )
    }
}

private fun formatLicenseDate(epochMs: Long): String =
    java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.getDefault()).format(java.util.Date(epochMs))

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RowScope.RelayModeChip(
    label: String,
    mode: RelayManager.RelayMode,
    current: RelayManager.RelayMode,
    onSelect: (RelayManager.RelayMode) -> Unit
) {
    FilterChip(
        selected = current == mode,
        onClick = { onSelect(mode) },
        label = { Text(label) },
        modifier = Modifier.weight(1f)
    )
}

@Composable
private fun SectionHeader(title: String) {
    // Monospace eyebrow — the technical voice marks structure, the accent stays out of it.
    Text(
        title.uppercase(),
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 20.dp, bottom = 8.dp)
    )
}
