package com.nexonai.unpruuf.screens.cases

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import com.nexonai.unpruuf.R
import com.nexonai.unpruuf.data.model.Contact
import com.nexonai.unpruuf.screens.caseview.caseStatusLabel
import com.nexonai.unpruuf.screens.qrpair.PortraitCaptureActivity
import com.nexonai.unpruuf.ui.components.EclipseMark
import java.text.DateFormat
import java.util.Date

/**
 * Whistleblower edition home. First start (no organisation yet): straight to scanning the
 * organisation QR. After that only "My cases" and a + for a new case — no contacts, no
 * messenger vocabulary.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CasesScreen(
    onOpenCase: (String) -> Unit,
    onNavigateToSettings: () -> Unit,
    viewModel: CasesViewModel = hiltViewModel()
) {
    val organization by viewModel.organization.collectAsState()
    val cases by viewModel.cases.collectAsState()
    val unread by viewModel.unreadIds.collectAsState()
    val error by viewModel.error.collectAsState()
    val busy by viewModel.busy.collectAsState()
    var menuOpen by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { viewModel.openCase.collect { onOpenCase(it) } }

    val scanLauncher = rememberLauncherForActivityResult(ScanContract()) { result ->
        result.contents?.let { viewModel.onScanned(it) }
    }
    val scanPrompt = stringResource(R.string.qr_scan_prompt)
    val cameraPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) {
            scanLauncher.launch(ScanOptions().apply {
                setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                setPrompt(scanPrompt)
                setBeepEnabled(false)
                setBarcodeImageEnabled(false)
                setOrientationLocked(true)
                setCaptureActivity(PortraitCaptureActivity::class.java)
            })
        }
    }
    val startScan = { cameraPermission.launch(Manifest.permission.CAMERA) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (organization == null) "unpruuf" else stringResource(R.string.cases_title)) },
                actions = {
                    IconButton(onClick = { menuOpen = true }) { Icon(Icons.Default.MoreVert, null) }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.cases_menu_settings)) },
                            onClick = { menuOpen = false; onNavigateToSettings() }
                        )
                        if (organization != null) {
                            DropdownMenuItem(
                                text = { Text(stringResource(R.string.cases_menu_other_org)) },
                                onClick = { menuOpen = false; viewModel.scanOtherOrganization() }
                            )
                        }
                    }
                }
            )
        },
        floatingActionButton = {
            if (organization != null) {
                ExtendedFloatingActionButton(
                    onClick = { if (!busy) viewModel.newCase() },
                    icon = { Icon(Icons.Default.Add, null) },
                    text = { Text(stringResource(R.string.cases_new)) }
                )
            }
        }
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            if (organization == null) {
                Onboarding(error = error, busy = busy, onScan = startScan, onPaste = viewModel::onScanned)
            } else if (cases.isEmpty()) {
                EmptyCases()
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 96.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(cases, key = { it.id }) { c -> CaseRow(c, c.id in unread, onClick = { onOpenCase(c.id) }) }
                }
            }
        }
    }
}

@Composable
private fun Onboarding(error: String?, busy: Boolean, onScan: () -> Unit, onPaste: (String) -> Unit) {
    var pasted by remember { mutableStateOf("") }
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Spacer(Modifier.height(24.dp))
        EclipseMark(modifier = Modifier.size(72.dp))
        Text(stringResource(R.string.wb_start_title), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Text(stringResource(R.string.wb_start_body), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Button(onClick = onScan, enabled = !busy, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().height(56.dp)) {
            Icon(Icons.Default.QrCodeScanner, null)
            Spacer(Modifier.width(8.dp))
            Text(stringResource(R.string.wb_scan_button), fontWeight = FontWeight.Bold)
        }
        if (busy) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
        error?.let {
            Text(
                stringResource(
                    when (it) {
                        "not_officer" -> R.string.wb_error_not_officer
                        "relay" -> R.string.wb_error_relay
                        "old" -> R.string.wb_error_old
                        else -> R.string.wb_error_unreadable
                    }
                ),
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall
            )
        }
        HorizontalDivider()
        OutlinedTextField(
            value = pasted,
            onValueChange = { pasted = it },
            label = { Text(stringResource(R.string.wb_paste_label)) },
            minLines = 2,
            modifier = Modifier.fillMaxWidth()
        )
        OutlinedButton(onClick = { onPaste(pasted); pasted = "" }, enabled = pasted.isNotBlank() && !busy, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.wb_connect))
        }
    }
}

@Composable
private fun EmptyCases() {
    Column(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(stringResource(R.string.cases_empty), style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(8.dp))
        Text(stringResource(R.string.cases_empty_body), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun CaseRow(c: Contact, unread: Boolean, onClick: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                if (c.caseNumber != null) {
                    Text(c.caseNumber, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                    Text(caseStatusLabel(c.caseStatus), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
                } else {
                    Text(stringResource(R.string.cases_pending), style = MaterialTheme.typography.titleMedium)
                }
                Text(
                    stringResource(R.string.cases_opened, DateFormat.getDateInstance(DateFormat.MEDIUM).format(Date(c.caseOpenedAt ?: c.addedAt))),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            if (unread) {
                Box(Modifier.size(10.dp).background(MaterialTheme.colorScheme.primary, RoundedCornerShape(50)))
            }
        }
    }
}
