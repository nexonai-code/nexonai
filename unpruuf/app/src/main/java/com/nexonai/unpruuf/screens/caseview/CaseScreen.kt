package com.nexonai.unpruuf.screens.caseview

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.nexonai.unpruuf.R
import com.nexonai.unpruuf.data.model.Contact
import java.text.DateFormat
import java.util.Date

/** Steps of a case as the reporter sees them: 0 = received, 1 = under review, 2 = closed. */
internal fun caseStep(status: String?): Int = when (status) {
    "in_progress" -> 1
    "closed" -> 2
    else -> 0
}

@Composable
internal fun caseStatusLabel(status: String?): String = when (status) {
    "in_progress" -> stringResource(R.string.case_status_in_progress)
    "closed" -> stringResource(R.string.case_status_closed)
    else -> stringResource(R.string.case_status_acknowledged)
}

private fun fmtDate(ms: Long?): String =
    ms?.let { DateFormat.getDateInstance(DateFormat.MEDIUM).format(Date(it)) } ?: "—"

private fun fmtDateTime(ms: Long?): String =
    ms?.let { DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date(it)) } ?: "—"

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CaseScreen(
    contactId: String,
    onNavigateBack: () -> Unit,
    onOpenChat: () -> Unit,
    viewModel: CaseViewModel = hiltViewModel()
) {
    LaunchedEffect(contactId) { viewModel.load(contactId) }
    val contact by viewModel.contact.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.case_title)) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, stringResource(R.string.chat_cd_back))
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            val c = contact
            if (c?.caseNumber == null) PendingCard() else CaseCard(c)
            Button(onClick = onOpenChat, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp)) {
                Text(stringResource(R.string.case_open_chat), fontWeight = FontWeight.Bold)
            }
            Text(
                stringResource(R.string.case_hint),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun PendingCard() {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Schedule, null, tint = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(10.dp))
                Text(stringResource(R.string.case_pending_title), style = MaterialTheme.typography.titleMedium)
            }
            Text(stringResource(R.string.case_pending_body), style = MaterialTheme.typography.bodyMedium)
            LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
        }
    }
}

@Composable
private fun CaseCard(c: Contact) {
    val clipboard = LocalClipboardManager.current
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text(
                stringResource(R.string.case_number_label).uppercase(),
                style = MaterialTheme.typography.labelSmall,
                letterSpacing = 1.5.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    c.caseNumber ?: "",
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold,
                    fontSize = 28.sp,
                    modifier = Modifier.weight(1f)
                )
                IconButton(onClick = { clipboard.setText(AnnotatedString(c.caseNumber ?: "")) }) {
                    Icon(Icons.Default.ContentCopy, stringResource(R.string.case_cd_copy))
                }
            }
            Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(50)) {
                Text(
                    caseStatusLabel(c.caseStatus),
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                    style = MaterialTheme.typography.labelLarge,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                )
            }
            CaseSteps(caseStep(c.caseStatus))
            HorizontalDivider()
            Text(stringResource(R.string.case_opened_at, fmtDate(c.caseOpenedAt)), style = MaterialTheme.typography.bodyMedium)
            if (c.caseStatus != "closed") {
                Text(stringResource(R.string.case_feedback_due, fmtDate(c.caseFeedbackDueAt)), style = MaterialTheme.typography.bodyMedium)
            }
            Text(
                stringResource(R.string.case_last_update, fmtDateTime(c.caseUpdatedAt)),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun CaseSteps(current: Int) {
    val labels = listOf(
        stringResource(R.string.case_step_received),
        stringResource(R.string.case_step_review),
        stringResource(R.string.case_step_closed)
    )
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
        labels.forEachIndexed { i, label ->
            val done = i <= current
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.weight(1f)) {
                Box(
                    modifier = Modifier
                        .size(28.dp)
                        .background(
                            if (done) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                            RoundedCornerShape(50)
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    if (done) Icon(Icons.Default.Check, null, tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(16.dp))
                }
                Spacer(Modifier.height(6.dp))
                Text(
                    label,
                    style = MaterialTheme.typography.labelSmall,
                    color = if (done) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

/** Compact strip at the top of the chat with the officer — tap opens "My case". */
@Composable
fun CaseBanner(contact: Contact, onClick: () -> Unit) {
    Surface(
        color = MaterialTheme.colorScheme.secondaryContainer,
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
    ) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                if (contact.caseNumber == null) stringResource(R.string.case_banner_pending)
                else stringResource(R.string.case_banner, contact.caseNumber, caseStatusLabel(contact.caseStatus)),
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSecondaryContainer,
                modifier = Modifier.weight(1f)
            )
            Text("›", color = MaterialTheme.colorScheme.onSecondaryContainer, fontSize = 20.sp)
        }
    }
}

