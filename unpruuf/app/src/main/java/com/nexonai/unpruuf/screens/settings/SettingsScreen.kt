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
import androidx.compose.ui.res.stringResource

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
    val lockedServers by viewModel.lockedServers.collectAsState()
    val unlockResult by viewModel.unlockResult.collectAsState()
    var unlockCandidate by remember { mutableStateOf<NodeMeshManager.LockedServer?>(null) }
    LaunchedEffect(Unit) { viewModel.checkLockedServers() }

    val scanRelayPrompt = stringResource(R.string.settings_scan_relay_prompt)
    val scanNodePrompt = stringResource(R.string.settings_scan_node_prompt)
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
                    setPrompt(scanRelayPrompt)
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
                    setPrompt(scanNodePrompt)
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
                title = { Text(stringResource(R.string.settings_title)) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, stringResource(R.string.settings_cd_back))
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
            SectionHeader(stringResource(R.string.settings_section_security))
            ListItem(
                headlineContent = { Text(stringResource(R.string.settings_app_edition)) },
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
                headlineContent = { Text(stringResource(R.string.settings_app_version)) },
                // BuildConfig.VERSION_NAME already carries the per-edition suffix
                // (e.g. "1.01-pro") set in build.gradle.kts's flavor blocks.
                supportingContent = { Text(BuildConfig.VERSION_NAME) },
                leadingContent = { Icon(Icons.Default.Info, null) }
            )
            HorizontalDivider()
            ListItem(
                headlineContent = { Text(stringResource(R.string.settings_network_security_status)) },
                supportingContent = { Text(stringResource(R.string.settings_network_security_status_body)) },
                leadingContent = { Icon(Icons.Default.Info, null) },
                trailingContent = { Icon(Icons.Default.ChevronRight, null) },
                modifier = Modifier.clickable(onClick = onNavigateToInfo)
            )
            HorizontalDivider()
            ListItem(
                headlineContent = { Text(stringResource(R.string.settings_screenshots)) },
                supportingContent = { Text(stringResource(R.string.settings_screenshots_body)) },
                leadingContent = { Icon(Icons.Default.Shield, null) }
            )
            HorizontalDivider()
            ListItem(
                headlineContent = { Text(stringResource(R.string.settings_message_storage)) },
                supportingContent = { Text(stringResource(R.string.settings_message_storage_body)) },
                leadingContent = { Icon(Icons.Default.Shield, null) }
            )
            if (biometricAvailable) {
                HorizontalDivider()
                ListItem(
                    headlineContent = { Text(stringResource(R.string.settings_fingerprint_unlock)) },
                    supportingContent = {
                        Text(stringResource(R.string.settings_fingerprint_unlock_body))
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
                headlineContent = { Text(stringResource(R.string.settings_pairing_identity)) },
                supportingContent = {
                    Text(stringResource(R.string.settings_pairing_identity_body))
                },
                leadingContent = { Icon(Icons.Default.Shield, null) },
                trailingContent = {
                    TextButton(onClick = { showRegenerateIdentityDialog = true }) { Text(stringResource(R.string.settings_renew)) }
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

            SectionHeader(stringResource(R.string.settings_section_censorship))
            ListItem(
                headlineContent = { Text(stringResource(R.string.settings_use_tor_bridges)) },
                supportingContent = {
                    Text(stringResource(R.string.settings_use_tor_bridges_body))
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
                        stringResource(R.string.settings_bridges_help),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = bridgeText,
                        onValueChange = { viewModel.onBridgeTextChange(it) },
                        label = { Text(stringResource(R.string.settings_bridge_lines_field)) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 100.dp),
                        minLines = 3
                    )
                    Spacer(Modifier.height(8.dp))
                    Button(
                        onClick = { viewModel.save() },
                        modifier = Modifier.fillMaxWidth()
                    ) { Text(stringResource(R.string.settings_save_reconnect_tor)) }
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
                SectionHeader(stringResource(R.string.settings_section_license))
                val licenseInfo = when (val s = licenseState) {
                    is LicenseState.Valid -> s.info
                    is LicenseState.ExpiringSoon -> s.info
                    is LicenseState.Expired -> s.info
                    else -> null
                }
                val licenseHeadline = when (val s = licenseState) {
                    is LicenseState.Valid -> stringResource(R.string.settings_license_active, formatLicenseDate(s.info.expiresAtMs))
                    is LicenseState.ExpiringSoon ->
                        if (s.daysLeft == 1L) stringResource(R.string.settings_license_expiring_one)
                        else stringResource(R.string.settings_license_expiring_many, s.daysLeft)
                    is LicenseState.Expired -> stringResource(R.string.settings_license_expired, formatLicenseDate(s.info.expiresAtMs))
                    is LicenseState.Invalid -> s.reason
                    is LicenseState.NotConfigured -> stringResource(R.string.settings_license_not_configured)
                }
                ListItem(
                    headlineContent = { Text(licenseHeadline) },
                    supportingContent = licenseInfo?.let {
                        { Text(stringResource(R.string.settings_license_serial, it.serial, it.customer)) }
                    },
                    leadingContent = { Icon(Icons.Default.VerifiedUser, null) }
                )
                Column(modifier = Modifier.padding(horizontal = 16.dp)) {
                    OutlinedTextField(
                        value = licenseInput,
                        onValueChange = { viewModel.onLicenseInputChange(it) },
                        label = { Text(stringResource(R.string.settings_license_code_field)) },
                        placeholder = { Text("unpruuf-license:v1:...") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(8.dp))
                    Button(
                        onClick = { viewModel.saveLicense() },
                        modifier = Modifier.fillMaxWidth()
                    ) { Text(stringResource(R.string.settings_activate)) }
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

            SectionHeader(stringResource(R.string.settings_section_relay))
            ListItem(
                headlineContent = { Text(stringResource(R.string.settings_relay_mode)) },
                supportingContent = {
                    Text(stringResource(R.string.settings_relay_mode_body))
                },
                leadingContent = { Icon(Icons.Default.Send, null) }
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                RelayModeChip(stringResource(R.string.settings_relay_off), RelayManager.RelayMode.OFF, relayMode) {
                    viewModel.onRelayModeChange(it)
                    viewModel.saveRelay() // apply immediately, same as the old disable-switch did
                }
                RelayModeChip(stringResource(R.string.settings_relay_auto), RelayManager.RelayMode.AUTO, relayMode) {
                    viewModel.onRelayModeChange(it)
                    viewModel.saveRelay()
                }
                RelayModeChip(stringResource(R.string.settings_relay_mandatory), RelayManager.RelayMode.MANDATORY, relayMode) {
                    viewModel.onRelayModeChange(it)
                    viewModel.saveRelay()
                }
            }
            if (relayMode != RelayManager.RelayMode.OFF) {
                Column(modifier = Modifier.padding(horizontal = 16.dp)) {
                    if (relayConfiguredOnion.isNotEmpty()) {
                        Text(
                            stringResource(R.string.settings_relay_configured, relayConfiguredOnion),
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
                        Text(stringResource(R.string.settings_scan_qr_code))
                    }
                    Spacer(Modifier.height(8.dp))
                    Text(
                        stringResource(R.string.settings_relay_paste_hint),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = relayInput,
                        onValueChange = { viewModel.onRelayInputChange(it) },
                        label = { Text(stringResource(R.string.settings_connection_string_field)) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(8.dp))
                    Button(
                        onClick = { viewModel.saveRelay() },
                        modifier = Modifier.fillMaxWidth()
                    ) { Text(stringResource(R.string.settings_save)) }
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
                        stringResource(R.string.settings_backup_relays),
                        style = MaterialTheme.typography.titleSmall
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        stringResource(R.string.settings_backup_relays_body),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = backupRelayInput,
                        onValueChange = { viewModel.onBackupRelayInputChange(it) },
                        label = { Text(stringResource(R.string.settings_first_backup_field)) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = backupRelay2Input,
                        onValueChange = { viewModel.onBackupRelay2InputChange(it) },
                        label = { Text(stringResource(R.string.settings_second_backup_field)) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(8.dp))
                    Button(
                        onClick = { viewModel.saveBackupRelay() },
                        modifier = Modifier.fillMaxWidth()
                    ) { Text(stringResource(R.string.settings_save)) }
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

            SectionHeader(stringResource(R.string.settings_section_relay_pool))
            ListItem(
                headlineContent = {
                    Text(relayPoolLastImported?.let {
                        if (it.relays.size == 1) stringResource(R.string.settings_relay_pool_imported_one, it.org)
                        else stringResource(R.string.settings_relay_pool_imported_many, it.org, it.relays.size)
                    } ?: stringResource(R.string.settings_relay_pool_none))
                },
                supportingContent = {
                    Text(stringResource(R.string.settings_relay_pool_body))
                },
                leadingContent = { Icon(Icons.Default.Send, null) }
            )
            Column(modifier = Modifier.padding(horizontal = 16.dp)) {
                OutlinedTextField(
                    value = relayPoolInput,
                    onValueChange = { viewModel.onRelayPoolInputChange(it) },
                    label = { Text(stringResource(R.string.settings_relay_pool_code_field)) },
                    placeholder = { Text("unpruuf-relaypool:v1:...") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(8.dp))
                Button(
                    onClick = { viewModel.importRelayPool() },
                    modifier = Modifier.fillMaxWidth()
                ) { Text(stringResource(R.string.settings_import)) }
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

            SectionHeader(stringResource(R.string.settings_section_node_mesh))
            ListItem(
                headlineContent = { Text(stringResource(R.string.settings_your_own_nodes)) },
                supportingContent = {
                    Text(stringResource(R.string.settings_your_own_nodes_body, NodeMeshManager.OWN_NODES_MAX))
                },
                leadingContent = { Icon(Icons.Default.Send, null) }
            )
            Column(modifier = Modifier.padding(horizontal = 16.dp)) {
                lockedServers.forEach { server ->
                    Card(
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
                        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)
                    ) {
                        Column(Modifier.padding(12.dp)) {
                            Text(
                                stringResource(R.string.settings_server_locked_title),
                                style = MaterialTheme.typography.titleSmall,
                                color = MaterialTheme.colorScheme.onErrorContainer
                            )
                            Spacer(Modifier.height(4.dp))
                            Text(
                                stringResource(R.string.settings_server_locked_body, server.nodeCount),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onErrorContainer
                            )
                            Spacer(Modifier.height(8.dp))
                            Button(onClick = { unlockCandidate = server }) { Text(stringResource(R.string.settings_unlock)) }
                        }
                    }
                }
                unlockResult?.let { ok ->
                    Text(
                        stringResource(if (ok) R.string.settings_unlock_done else R.string.settings_unlock_failed),
                        style = MaterialTheme.typography.bodySmall,
                        color = if (ok) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
                    )
                    Spacer(Modifier.height(8.dp))
                    LaunchedEffect(ok) {
                        kotlinx.coroutines.delay(6000)
                        viewModel.clearUnlockResult()
                    }
                }
                var showAllNodes by remember { mutableStateOf(false) }
                val collapsible = myNodeAddresses.size > 5
                if (myNodeAddresses.isNotEmpty()) {
                    Text(
                        stringResource(R.string.settings_nodes_count, myNodeAddresses.size),
                        style = MaterialTheme.typography.labelLarge
                    )
                }
                (if (collapsible && !showAllNodes) myNodeAddresses.take(3) else myNodeAddresses).forEach { address ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            address,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.weight(1f)
                        )
                        TextButton(onClick = { viewModel.startMigrateNode(address) }) { Text(stringResource(R.string.settings_migrate)) }
                        TextButton(onClick = { viewModel.removeMyNode(address) }) { Text(stringResource(R.string.settings_remove)) }
                    }
                    if (migratingAddress == address) {
                        Column(modifier = Modifier.padding(start = 8.dp, top = 4.dp, bottom = 4.dp)) {
                            Text(
                                stringResource(R.string.settings_node_migrated_notice),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(Modifier.height(4.dp))
                            OutlinedTextField(
                                value = migrateInput,
                                onValueChange = { viewModel.onMigrateInputChange(it) },
                                label = { Text(stringResource(R.string.settings_new_address_field)) },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth()
                            )
                            Spacer(Modifier.height(4.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(onClick = { viewModel.confirmMigrateNode() }) { Text(stringResource(R.string.settings_confirm_migration)) }
                                OutlinedButton(onClick = { viewModel.cancelMigrateNode() }) { Text(stringResource(R.string.settings_cancel)) }
                            }
                        }
                    }
                }
                if (collapsible) {
                    TextButton(onClick = { showAllNodes = !showAllNodes }) {
                        Text(
                            if (showAllNodes) stringResource(R.string.settings_show_fewer_nodes)
                            else stringResource(R.string.settings_show_all_nodes, myNodeAddresses.size)
                        )
                    }
                }
                if (myNodeAddresses.isNotEmpty()) Spacer(Modifier.height(8.dp))
                Button(
                    onClick = { nodeMeshCameraPermission.launch(Manifest.permission.CAMERA) },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Default.QrCodeScanner, null)
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(R.string.settings_scan_node_qr_code))
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    stringResource(R.string.settings_node_paste_hint),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = nodeMeshInput,
                    onValueChange = { viewModel.onNodeMeshInputChange(it) },
                    label = { Text(stringResource(R.string.settings_node_owner_string_field)) },
                    placeholder = { Text("unpruuf-node-owner:v1:...") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(8.dp))
                Button(
                    onClick = { viewModel.addMyNode() },
                    modifier = Modifier.fillMaxWidth()
                ) { Text(stringResource(R.string.settings_add)) }
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

            SectionHeader(stringResource(R.string.settings_section_about))
            ListItem(
                headlineContent = { Text(stringResource(R.string.settings_about_name)) },
                supportingContent = { Text(stringResource(R.string.settings_about_version)) },
                leadingContent = { Icon(Icons.Default.Info, null) }
            )
            HorizontalDivider()
            ListItem(
                headlineContent = { Text(stringResource(R.string.settings_about_package)) },
                supportingContent = { Text("com.nexonai.unpruuf") },
                leadingContent = { Icon(Icons.Default.Info, null) }
            )
            HorizontalDivider()
            ListItem(
                headlineContent = { Text(stringResource(R.string.settings_about_created_by)) },
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

    unlockCandidate?.let { server ->
        AlertDialog(
            onDismissRequest = { unlockCandidate = null },
            title = { Text(stringResource(R.string.settings_unlock_confirm_title)) },
            text = { Text(stringResource(R.string.settings_unlock_confirm_body)) },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.unlockServer(server)
                    unlockCandidate = null
                }) { Text(stringResource(R.string.settings_unlock)) }
            },
            dismissButton = {
                TextButton(onClick = { unlockCandidate = null }) { Text(stringResource(R.string.settings_cancel)) }
            }
        )
    }

    if (showRegenerateIdentityDialog) {
        AlertDialog(
            onDismissRequest = { showRegenerateIdentityDialog = false },
            title = { Text(stringResource(R.string.settings_renew_identity_title)) },
            text = {
                Text(stringResource(R.string.settings_renew_identity_body))
            },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.regeneratePairingIdentity()
                    showRegenerateIdentityDialog = false
                }) { Text(stringResource(R.string.settings_renew)) }
            },
            dismissButton = {
                TextButton(onClick = { showRegenerateIdentityDialog = false }) { Text(stringResource(R.string.settings_cancel)) }
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
