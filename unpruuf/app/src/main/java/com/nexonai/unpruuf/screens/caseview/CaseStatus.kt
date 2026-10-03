package com.nexonai.unpruuf.screens.caseview

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
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

/** The "Status" tab of a case (Whistleblower edition) — number, status, steps, deadlines. */
@Composable
fun CaseStatusContent(contact: Contact?, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        if (contact?.caseNumber == null) PendingCard() else CaseCard(contact)
        Text(
            stringResource(R.string.case_hint),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
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
