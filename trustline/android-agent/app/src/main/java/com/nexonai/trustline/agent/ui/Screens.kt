package com.nexonai.trustline.agent.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.net.toUri
import com.nexonai.trustline.agent.AgentViewModel
import com.nexonai.trustline.agent.NewForm
import com.nexonai.trustline.agent.Phase
import com.nexonai.trustline.agent.SendOutcome
import com.nexonai.trustline.agent.core.JObj
import com.nexonai.trustline.agent.core.Protocol
import com.nexonai.trustline.agent.core.bool
import com.nexonai.trustline.agent.core.get
import com.nexonai.trustline.agent.core.jo
import com.nexonai.trustline.agent.core.list
import com.nexonai.trustline.agent.core.str
import kotlinx.coroutines.launch

@Composable
fun AgentApp(vm: AgentViewModel) {
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        when (vm.phase) {
            Phase.Loading -> Centered { CircularProgressIndicator() }
            Phase.Setup -> SetupScreen(vm)
            Phase.Waiting -> WaitingScreen(vm)
            Phase.Locked -> LockedScreen(vm)
            Phase.Main -> MainScreen(vm)
        }
        vm.message?.let { m ->
            AlertDialog(onDismissRequest = { vm.dismissMessage() }, confirmButton = { TextButton(onClick = { vm.dismissMessage() }) { Text("OK") } }, text = { Text(m) })
        }
    }
}

@Composable
private fun Centered(content: @Composable () -> Unit) = Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) { content() }

@Composable
private fun Page(title: String, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        content()
    }
}

@Composable
private fun Field(label: String, value: String, onChange: (String) -> Unit, keyboard: KeyboardType = KeyboardType.Text) {
    OutlinedTextField(value = value, onValueChange = onChange, label = { Text(label) }, singleLine = true, modifier = Modifier.fillMaxWidth(),
        keyboardOptions = KeyboardOptions(keyboardType = keyboard))
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Dropdown(label: String, options: List<String>, selected: Int, onSelect: (Int) -> Unit) {
    var open by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = open, onExpandedChange = { open = it }) {
        OutlinedTextField(value = options.getOrElse(selected) { "" }, onValueChange = {}, readOnly = true, label = { Text(label) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = open) }, modifier = Modifier.menuAnchor().fillMaxWidth())
        ExposedDropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            options.forEachIndexed { i, o -> DropdownMenuItem(text = { Text(o) }, onClick = { onSelect(i); open = false }) }
        }
    }
}

// ------------------------------------------------------------------ setup / waiting / locked
@Composable
private fun SetupScreen(vm: AgentViewModel) {
    val pre = vm.enrolPrefill
    var relay by remember(pre) { mutableStateOf(pre?.first ?: "") }
    var code by remember(pre) { mutableStateOf(pre?.second ?: "") }
    var device by remember { mutableStateOf(android.os.Build.MODEL ?: "Android phone") }
    var scanning by remember { mutableStateOf(false) }
    Page("TrustLine Agent") {
        Text("Connect this phone to your network operator. Your operator shows an activation QR code in the operator portal.")
        if (scanning) {
            QrScanner(onResult = { text ->
                scanning = false
                val u = runCatching { text.toUri() }.getOrNull()
                val c = u?.getQueryParameter("code")
                if (u != null && u.scheme == "trustline" && c != null) { code = c; relay = u.getQueryParameter("relay") ?: relay }
                else vm.notify("This QR code is not a TrustLine activation code.")
            }, onClose = { scanning = false })
        } else {
            Button(onClick = { scanning = true }, modifier = Modifier.fillMaxWidth()) { Text("Scan activation QR code") }
        }
        Field("Relay address", relay, { relay = it }, KeyboardType.Uri)
        Field("Activation code", code, { code = it })
        Field("Device name", device, { device = it })
        Button(onClick = { vm.enrol(relay, code, device) }, enabled = !vm.busy, modifier = Modifier.fillMaxWidth()) { Text(if (vm.busy) "Connecting..." else "Activate this phone") }
        Text("The private signing key is created inside the phone's secure hardware and never leaves it.", style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun WaitingScreen(vm: AgentViewModel) {
    Page("Waiting for approval") {
        Text("Your operator must approve this phone. Ask them to compare these fingerprints in the operator portal:")
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Signing key", style = MaterialTheme.typography.labelMedium); Text(vm.signKid, fontFamily = FontFamily.Monospace, fontSize = 18.sp)
                Text("Encryption key", style = MaterialTheme.typography.labelMedium); Text(vm.encKid, fontFamily = FontFamily.Monospace, fontSize = 18.sp)
                Text("Device: ${vm.deviceName} (${vm.keyInfo})", style = MaterialTheme.typography.bodySmall)
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) { CircularProgressIndicator(Modifier.height(24.dp)); Text("Checking every few seconds...") }
        OutlinedButton(onClick = { vm.resetDevice() }) { Text("Cancel and start over") }
    }
}

@Composable
private fun LockedScreen(vm: AgentViewModel) {
    Page("Locked") {
        Card(colors = androidx.compose.material3.CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) { Text(vm.lockReason, Modifier.padding(14.dp)) }
        Text("Contact your operator. Instructions already stored on the relay stay unchanged.")
        Button(onClick = { vm.resetDevice() }, colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)) { Text("Remove this device") }
    }
}

// ------------------------------------------------------------------ main
@Composable
private fun MainScreen(vm: AgentViewModel) {
    var tab by remember { mutableStateOf(0) }
    var detail by remember { mutableStateOf<Pair<String, JObj>?>(null) }
    val labels = listOf("Send", "Incoming", "Sent", "Status")
    Scaffold(bottomBar = {
        NavigationBar {
            labels.forEachIndexed { i, l ->
                NavigationBarItem(selected = tab == i, onClick = { tab = i; detail = null }, label = { Text(l) },
                    icon = { Text(when (i) { 0 -> "↑"; 1 -> "↓"; 2 -> "☰"; else -> "i" }, fontSize = 20.sp) })
            }
        }
    }) { pad ->
        Column(Modifier.padding(pad)) {
            if (!vm.online) Text("Offline: items are queued and sent when the connection returns.", Modifier.fillMaxWidth().padding(8.dp), color = MaterialTheme.colorScheme.error, fontSize = 13.sp)
            val d = detail
            when {
                d != null && d.first == "in" -> IncomingDetail(vm, d.second) { detail = null }
                d != null && d.first == "out" -> OutgoingDetail(vm, d.second) { detail = null }
                tab == 0 -> SendScreen(vm)
                tab == 1 -> ListScreen("Incoming instructions", vm.inbox, vm) { detail = Pair("in", it) }
                tab == 2 -> ListScreen("Sent instructions", vm.outbox, vm) { detail = Pair("out", it) }
                else -> StatusScreen(vm)
            }
        }
    }
}

private fun statusOf(vm: AgentViewModel, it: JObj): String = vm.localStatus[it["id"].str()] ?: it["status"].str()

@Composable
private fun ListScreen(title: String, items: List<JObj>, vm: AgentViewModel, onOpen: (JObj) -> Unit) {
    Page(title) {
        if (items.isEmpty()) Text("Nothing here yet.")
        items.sortedByDescending { it["instruction"]["createdAt"].str() }.forEach { it ->
            Card(Modifier.fillMaxWidth().padding(vertical = 2.dp).clickable { onOpen(it) }) {
                Row(Modifier.padding(14.dp).fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Column {
                        Text("${it["instruction"]["amount"]["value"].str()} ${it["instruction"]["amount"]["currency"].str()}", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                        Text(it["instruction"]["reference"].str(), style = MaterialTheme.typography.bodySmall)
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text(statusOf(vm, it), fontWeight = FontWeight.SemiBold)
                        if (it["frozen"].bool()) Text("FROZEN", color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun Row2(label: String, value: String) {
    Column(Modifier.padding(vertical = 3.dp)) { Text(label, style = MaterialTheme.typography.labelMedium); Text(value, style = MaterialTheme.typography.bodyLarge) }
}

@Composable
private fun IncomingDetail(vm: AgentViewModel, item: JObj, back: () -> Unit) {
    val scope = rememberCoroutineScope()
    val plain = remember(item) { vm.decrypt(item) }
    var code by remember { mutableStateOf("") }
    val ins = item["instruction"]
    val st = statusOf(vm, item)
    val sigOk = remember(item) { Protocol.verifyIncoming(item) }
    Page("Incoming instruction") {
        TextButton(onClick = back) { Text("< Back") }
        if (!sigOk) Card(colors = androidx.compose.material3.CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) { Text("Signature check FAILED. Do not pay out.", Modifier.padding(12.dp)) }
        if (item["frozen"].bool()) Card(colors = androidx.compose.material3.CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) { Text("This instruction is frozen by the operator or TrustLine. Do not pay out.", Modifier.padding(12.dp)) }
        Row2("Pay out", "${ins["payout"]["value"].str()} ${ins["payout"]["currency"].str()}")
        Row2("Status", st)
        Row2("Reference", ins["reference"].str())
        Row2("Purpose", ins["purpose"].str())
        Row2("Expires", ins["expiresAt"].str())
        if (plain != null) {
            Row2("Beneficiary (compare with the customer's ID)", plain["beneficiary"]["name"].str())
            Row2("Sender", "${plain["originator"]["name"].str()}, ${plain["originator"]["address"].str()}")
        } else Text("Channel B data could not be decrypted on this phone.", color = MaterialTheme.colorScheme.error)
        if (st == "INSTRUCTED" || st == "CONFIRMED") {
            Field("Payout code from the customer", code, { code = it })
            Button(modifier = Modifier.fillMaxWidth(), enabled = code.isNotBlank() && !vm.busy, onClick = {
                scope.launch {
                    val r = vm.payout(item, code)
                    if (r == null) { vm.notify("Payout recorded. Hand over ${ins["payout"]["value"].str()} ${ins["payout"]["currency"].str()}."); vm.say("Payout recorded"); vm.refreshAfterAction(); back() }
                    else vm.notify(r)
                }
            }) { Text("Confirm payout") }
        }
    }
}

@Composable
private fun OutgoingDetail(vm: AgentViewModel, item: JObj, back: () -> Unit) {
    val scope = rememberCoroutineScope()
    val ins = item["instruction"]
    val st = statusOf(vm, item)
    val code = vm.payoutCodeFor(item["id"].str())
    Page("Sent instruction") {
        TextButton(onClick = back) { Text("< Back") }
        Row2("Amount", "${ins["amount"]["value"].str()} ${ins["amount"]["currency"].str()}")
        Row2("Status", st)
        Row2("Reference", ins["reference"].str())
        Row2("Recipient agent", ins["recipient"]["agent"].str())
        if (item["frozen"].bool()) Text("Frozen", color = MaterialTheme.colorScheme.error)
        if (code != null && st != "PAID_OUT") { Row2("Payout code (give to the sender)", Protocol.formatCode(code)) }
        if (st == "INSTRUCTED" || st == "CONFIRMED") {
            OutlinedButton(onClick = { scope.launch { val r = vm.cancel(item); if (r != null) vm.notify(r); vm.refreshAfterAction() } }) { Text("Cancel instruction") }
        }
    }
}

// ------------------------------------------------------------------ send
@Composable
private fun SendScreen(vm: AgentViewModel) {
    val scope = rememberCoroutineScope()
    val dir = vm.directory
    val currencies = vm.settings["currencies"].list().map { it.str() }.ifEmpty { listOf("USD") }
    val purposes = vm.settings["purposes"].list().map { Pair(it["code"].str(), it["label"].str()) }.ifEmpty { listOf(Pair("OTHR", "Other")) }
    var to by remember { mutableStateOf(0) }; var cur by remember { mutableStateOf(0) }; var pur by remember { mutableStateOf(0) }
    var amount by remember { mutableStateOf("") }; var ref by remember { mutableStateOf("") }; var scr by remember { mutableStateOf("") }
    var sName by remember { mutableStateOf("") }; var sAddr by remember { mutableStateOf("") }; var sIdType by remember { mutableStateOf(0) }
    var sId by remember { mutableStateOf("") }; var sDob by remember { mutableStateOf("") }; var sRef by remember { mutableStateOf("") }; var bName by remember { mutableStateOf("") }
    var result by remember { mutableStateOf<SendOutcome?>(null) }
    val idTypes = listOf("passport", "national ID", "residence permit", "driving licence")

    result?.let { r ->
        Page("Instruction") {
            when (r) {
                is SendOutcome.Receipt -> {
                    Text("Accepted by the relay (log entry #${r.seq}).")
                    Text("Give this one-time payout code to the sender:")
                    Text(Protocol.formatCode(r.code), fontFamily = FontFamily.Monospace, fontSize = 30.sp, fontWeight = FontWeight.Bold)
                    Text("The sender passes the code to the beneficiary outside TrustLine.", style = MaterialTheme.typography.bodySmall)
                }
                is SendOutcome.Queued -> Text("No connection. The instruction is saved and signed. It is sent automatically when you are online. The payout code appears under Sent.")
                is SendOutcome.Rejected -> { Text("Rejected by the mandatory checks:", color = MaterialTheme.colorScheme.error); r.reasons.forEach { Text("- $it") } }
                is SendOutcome.Failed -> Text(r.text, color = MaterialTheme.colorScheme.error)
            }
            Button(onClick = { result = null; if (r is SendOutcome.Receipt || r is SendOutcome.Queued) { amount = ""; ref = ""; scr = ""; sName = ""; sAddr = ""; sId = ""; sDob = ""; sRef = ""; bName = "" } }) { Text("Done") }
        }
        return
    }
    Page("Send an instruction") {
        if (dir.isEmpty()) { Text("No partner agents are reachable yet. Your operator must connect to a partner network for your corridor. Pull to sync on the Status tab."); return@Page }
        Dropdown("Recipient agent", dir.map { "${it.agentName}, ${it.city} ${it.country} (${it.operatorName})" }, to) { to = it }
        Field("Amount", amount, { amount = it }, KeyboardType.Decimal)
        Dropdown("Currency", currencies, cur) { cur = it }
        Dropdown("Purpose", purposes.map { "${it.first} - ${it.second}" }, pur) { pur = it }
        Field("Your reference", ref, { ref = it })
        Text("Sender (Channel B, encrypted end to end)", fontWeight = FontWeight.Bold)
        Field("Full name", sName, { sName = it }); Field("Address", sAddr, { sAddr = it })
        Dropdown("ID type", idTypes, sIdType) { sIdType = it }
        Field("ID number", sId, { sId = it }); Field("Date of birth (YYYY-MM-DD)", sDob, { sDob = it }); Field("Customer reference (optional)", sRef, { sRef = it })
        Text("Beneficiary", fontWeight = FontWeight.Bold)
        Field("Full name (as on ID)", bName, { bName = it })
        Text("Sanctions screening", fontWeight = FontWeight.Bold)
        Field("Screening reference from the operator system", scr, { scr = it })
        Button(modifier = Modifier.fillMaxWidth(), enabled = !vm.busy, onClick = {
            val missing = listOf(sName, sAddr, sId, sDob, bName, scr, ref).any { it.isBlank() }
            when {
                missing -> vm.notify("Please fill in all fields.")
                !Regex("^\\d{1,12}(\\.\\d{1,2})?$").matches(amount) -> vm.notify("Amount must look like 250.00.")
                !Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(sDob.trim()) -> vm.notify("Date of birth must look like 1985-03-21.")
                else -> {
                    val rec = dir[to.coerceIn(0, dir.size - 1)]
                    val form = NewForm(rec, amount, currencies[cur], purposes[pur].first, ref.trim(), scr.trim(),
                        jo("name" to sName.trim(), "address" to sAddr.trim(), "idType" to idTypes[sIdType], "idNumber" to sId.trim(), "dob" to sDob.trim(), "customerRef" to sRef.trim().ifEmpty { "-" }),
                        jo("name" to bName.trim(), "payoutLocation" to rec.city.ifEmpty { rec.agentName }))
                    scope.launch { result = vm.sendInstruction(form); vm.say("Instruction sent"); vm.refreshAfterAction() }
                }
            }
        }) { Text("Sign and send") }
    }
}

// ------------------------------------------------------------------ status
@Composable
private fun StatusScreen(vm: AgentViewModel) {
    Page("Status") {
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp)) {
                Row2("Agent", "${vm.profile["agent"]["name"].str()} (${vm.profile["agentId"].str()})")
                Row2("Operator", vm.profile["operator"]["name"].str())
                Row2("Connection", if (vm.online) "online" else "offline")
                Row2("Last synchronisation", if (vm.lastSync == 0L) "never" else java.text.DateFormat.getDateTimeInstance().format(java.util.Date(vm.lastSync)))
                Row2("Offline window", vm.offlineWindowText())
                Row2("Offline payouts", if (vm.profile["limits"]["offlinePayout"].bool()) "allowed up to ${vm.profile["limits"]["offlineLimit"].str()} USD" else "not enabled")
                Row2("Device key", "${vm.signKid} (${vm.keyInfo})")
                Row2("Relay", vm.relayUrl)
            }
        }
        Button(onClick = { vm.syncNow() }, enabled = !vm.busy, modifier = Modifier.fillMaxWidth()) { Text(if (vm.busy) "Synchronising..." else "Synchronise now") }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) { Switch(checked = vm.speak, onCheckedChange = { vm.toggleSpeak(it) }); Text("Voice prompts") }
        if (vm.queue.isNotEmpty()) {
            Text("Offline queue", fontWeight = FontWeight.Bold)
            vm.queue.forEach { q ->
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp)) {
                        Text(q["summary"].str())
                        if (q["rejected"].bool()) {
                            Text("Rejected: ${q["error"].str()}", color = MaterialTheme.colorScheme.error)
                            TextButton(onClick = { vm.dismissQueueItem(q["qid"].str()) }) { Text("Remove") }
                        } else Text("Waiting for connection", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        OutlinedButton(onClick = { vm.resetDevice() }) { Text("Remove this device") }
    }
}
