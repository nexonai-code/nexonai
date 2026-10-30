from html import escape as E
css=open('common.css').read()
# (area, feature, description, status, new)
R=[]
def a(area,rows):
    for r in rows: R.append((area,)+r)
a('App · Messaging',[
('Direct connection over Tor','Direct mode (Standard edition and direct contacts): every device has its own Tor address (hidden service) and receives directly. No account, no phone number, no server needed. The Business app does not use this path: its phone has no address of its own.','ok',0),
('Same-Wi-Fi shortcut','Only while a direct contact exists, never in the Whistleblower edition. Neutral service name that changes hourly and only contacts can compute.','ok',0),
('Confirmed delivery','Messages are retried until the other device confirms. Chat shows waiting or confirmed. A lost confirmation does not block the queue.','ok',0),
('Fixed packet size','Every packet is 4096 bytes on the wire, so someone watching the network learns no message length. Limit: a stored packet shows its content length to a node or relay operator (finding F1, see the evidence package). Closing it needs a change of the wire format.','part',1),
('Files and photos','Large content is split into packets and reassembled, up to 5 MB. Camera, thumbnails, images downscaled to 2048 px.','ok',0),
('Photo metadata removed','Every photo is re-encoded: EXIF, GPS and embedded thumbnails are gone.','ok',0),
('Network switching','On a network change Tor restarts so the address is republished. Self-check every 4 minutes.','ok',0),
('Optional relay','Off by default. A self-run, blind mailbox that only sees encrypted packets. Relay pool travels in the pairing QR.','ok',0),
])
a('App · Privacy',[
('End-to-end encryption','Double Ratchet (X25519, HKDF, XChaCha20-Poly1305) inside an outer AES-256-GCM layer. Forward secrecy in both directions.','ok',0),
('Messages in memory only','Never written to disk. With the app open they vanish after 5 minutes; on leaving the app or screen lock, immediately.','ok',0),
('Encrypted contact database','SQLCipher, AES-256. Only contacts are stored, never messages.','ok',0),
('Screenshot block','No screenshots, app hidden in the app switcher.','ok',0),
('Neutral notifications','"New message" only. Never sender, never content, nothing on the lock screen.','ok',0),
])
a('App · Identity',[
('No user ID in Business','The Business app (Pro, Pro Groups) has no user ID at all. The pairing code carries only keys, a routing seed and node addresses. Nothing in it names a person or a device, and two contacts comparing their codes find nothing in common.','ok',1),
('No ID on the wire in Business','A package is addressed by a routing tag that only the two partners can compute and that changes every hour. There is no ID anywhere to look up, so nobody can map a tag to a person.','ok',1),
('No own username','There is no profile name. Each contact names you on their side. Rename any time.','ok',0),
('Changing ID per contact','Direct mode only (Standard). Each contact sees a different, hourly-changing ID for you, offset per pair. Business needs no ID, see above.','ok',0),
('Own ID after pairing','Direct mode only (Standard). Both devices swap a fresh ID. Two contacts comparing notes find no common ID.','ok',0),
('QR overwrite protection','A QR with a known identity but different keys is rejected instead of silently replacing the contact.','ok',0),
('Safety number','Six-digit code per contact, checked over another channel such as a phone call. A match marks the contact as verified.','ok',0),
('Own Tor address per contact','Direct mode only (Standard). New pairings share the main address, older ones have their own. The ID is fully separate, the address only partly.','part',0),
('Verified contacts on a daily-changing address','Direct mode only (Standard). Built, not tested against real Tor.','part',0),
])
a('App · Traffic analysis',[
('Decoy traffic','Random decoy packets to all contacts. They keep paths warm; the receiver drops them.','ok',0),
('Timing resistance','Randomised intervals, but not a constant-rate channel.','part',0),
])
a('App · Access and duress',[
('PIN lock','App opens only with a PIN (salted hash, never in clear). Number pad.','ok',0),
('Panic PIN','A second PIN wipes all contacts and keys at once and opens an empty app.','ok',0),
('Fingerprint','In addition to the PIN, never instead. Never triggers the panic PIN.','ok',0),
('Delete chat','Wipes the messages on both sides, the contact stays.','ok',0),
('Delete contact','Also deleted on the other phone (queued, retried).','ok',0),
('Root detection','The app refuses to start on a device that looks rooted. Best effort, not proof.','ok',0),
('Build expiry','A build stops running about 180 days after it was built, in every edition.','ok',0),
])
a('App · Reliability and censorship',[
('Background services and wakelock','Tor and receiver run in the background. One-time request to exempt the app from battery optimisation.','ok',0),
('Address stays published','Every 20 seconds the device connects to itself. Leftovers of deleted contacts are cleaned up at start.','ok',0),
('Bridges','Settings → Censorship circumvention. Plain bridges with address and fingerprint work.','ok',0),
('Automatic connection path','If Tor cannot connect, the app tries the next path by itself: direct, company bridge (if the organisation has one), public obfs4 bridges, Snowflake. The path that worked is remembered for the next start. Hand-entered bridges always win. Not tested on a network that really blocks Tor.','part',1),
])
a('App · Editions and licence',[
('Standard, Pro, Pro Groups, Client','One codebase, four colours and icons. Standard pairs with Standard and Pro, Pro with Standard, Pro and Client, Client only with Pro, Pro Groups only with Pro Groups. All can be installed side by side.','ok',0),
('Pro Groups edition','Pro (Business) plus local groups. A group is a list on each phone plus a group code the members agree on; nobody can create a group for someone else. A group message goes to each member as an ordinary one-to-one message over the sender\'s own servers, shown under the name in your own address book. Up to 10 members, text only, no group server, no member list anywhere. Not run on real phones yet.','unk',1),
('Romanian interface','The main app now speaks English and Romanian and follows the phone language. All texts sit in resource files. A Romanian speaker has not read it yet.','unk',1),
('Whistleblower edition','Own line for reporting offices. See below.','ok',0),
('Signed licence codes','Ed25519, checked offline, no server. Expiry warning in Settings, then lock. The code binds to the device at activation.','ok',0),
('Clock rollback protection','The app remembers the latest date it has seen. No external time anchor.','part',0),
])
a('App · Business node-mesh',[
('Add own nodes','Scan the owner QR from the server. The app fetches all addresses of that server itself. Up to 1000 own nodes per device.','ok',0),
('Node lists','Named groups of own nodes. Import from file or pasted text, rename, delete. You choose a list when adding a contact.','ok',0),
('3 random nodes per contact','From the chosen list, from different servers where possible. Contacts share nodes.','ok',0),
('Own keys per contact','No key and no routing seed belongs to two contacts.','ok',0),
('Changing package addresses','The address of a package (routing tag) changes every hour.','ok',0),
('Packet lifetime per chat','1, 6 or 24 hours, clock icon in the chat. Applies to what you send.','ok',0),
('Even pick-up rhythm','About every 20 seconds with jitter, even when nothing is waiting. An observer cannot tell when a chat is opened.','ok',0),
('Decoy deposits','Empty packets about every 15 minutes per contact, so deposits do not only happen with real messages. A node operator can still tell them from messages by their length (finding F1); a network observer cannot.','part',0),
('Unlock server','After a restart the server is locked. The app shows "locked, unlock" and sends the key after confirmation.','ok',0),
('Temp Node per chat','An extra node for exactly one conversation, memory only, with its own QR. The first successful send confirms it.','ok',0),
('Temp Node on this phone','Pro Groups only. The phone starts the Temp Node for one chat itself: a new address that exists only while it runs, nothing kept, no second device. The contact can pick up only while this phone is on and the app runs. Not run on a real phone yet.','unk',1),
('Company feed','The organisation maintains node lists centrally. The app finds the current address itself, checks the signature, never accepts an older version. All or nothing.','part',0),
('No address book','The system stores no contact lists and no user IDs. The link between people sits only in keys, nodes and addresses. Contacts exist only on the phone.','ok',0),
])
a('App · Whistleblower edition',[
('One company QR','One QR for the whole organisation. A case is opened automatically.','ok',0),
('My case','Case number, status and deadlines for the reporter.','ok',0),
('Romanian','Own texts (over 280), visible only to reporters and officers.','ok',0),
('Relay required','Reports always go through the organisation\'s relay. No LAN, no own onion service.','ok',0),
('unpruuf Press (pilot)','The same reporter app with journalist wording: a source writes to a newsroom. A pilot, never tested with a real source.','unk',1),
])
a('App · Tor Client Edition (special build)',[
('QR scan of the feed code','The feed code is scanned instead of typed.','unk',0),
('Client authorisation','The feed service is invisible without the key in the feed code. Built, not checked against real Tor.','unk',0),
])
a('Node server',[
('Platforms','Windows (install.bat and start.bat), Linux, Docker, ready-made .exe without Node.js. The Windows run and the Docker build still need checking on a real machine.','unk',0),
('Built-in Tor','Downloads Tor once, runs it itself, publishes every node as an onion service. After a crash it restarts with the same address. The download is checked against pinned SHA-256 values taken from the Tor Project\'s signed list (since 14 October; before, it was not checked).','ok',1),
('Proof-of-work against flooding','Tor\'s own protection is always on. Plus a limit on fetches (5 per second, burst 30).','ok',0),
('Up to 250 nodes per server','The number comes from the licence and is not a setting. One Tor process, all onion services.','ok',0),
('Server licence','One code per server: customer, serial, nodes (max 250), expiry. Checked offline, nothing sent, no device recorded. Without a licence only the setup page runs.','ok',0),
('Sealed keys','Owner secret and onion keys only encrypted on disk. Locked after a restart until the app or setup page unlocks. Addresses stay the same.','ok',0),
('Only the owner writes','Depositing needs the owner secret. Contacts only read, with a routing tag, and cannot delete anything. Only time deletes.','ok',0),
('Packet lifetime','Profile 1, 6 or 24 hours. A deposit may ask for a shorter time, never a longer one. Expired packets are overwritten.','ok',0),
('Choose where packets live','Disk (default) or memory only with NODE_MESH_STORE=ram. A restart empties waiting packets.','ok',0),
('Slots 1 to 3','Up to three own servers on one machine, staggered daily reset (minute 0, 20, 40), own ports and folders.','ok',0),
('Setup page','Reachable only on this machine. Owner QR, paste licence, unlock, save node list as a file.','ok',0),
('Overview page','Traffic light, nodes, stored packets, oldest wait, 24-hour counters, hourly chart, licence status, where packets live. Refreshes every 5 seconds.','ok',0),
('Temp Node','start-tempnode.bat: one node for one conversation, everything in memory, no licence needed.','ok',0),
('Release check','The server holds a signed list of the hashes of its own files and checks itself at start and every hour. A changed file shows a warning on the overview and setup page; it can also refuse to start. A script checks a copy from outside. A server that is already compromised can lie about itself, and real remote proof would need special hardware. Not built.','ok',1),
('Company bridge','A private Tor bridge with an obfs4 front on a small separate server (start-bridge). Its line goes into the node list and the company feed, so apps on blocked networks use it. A full start through it is not yet checked.','unk',1),
('Feed service','start-feed: the organisation publishes its node lists encrypted and signed under an onion address that changes every few hours. Apps compute it themselves.','unk',0),
])
a('Android as a node (relay-android)',[
('Business node mode','One Android device as exactly one node. Same contract as the server. Shows the owner QR, profile and slot.','unk',0),
('Licence check','The same offline check as the server.','ok',0),
('Limits','No Tor proof-of-work, packets in a file on the device (not memory only), not tested on a device.','part',0),
('Relay mode','The same app can instead run as a classic relay: Tor service, QR, adjustable retention, activity log, bridges, root block.','ok',0),
])
a('Relay and tools',[
('Relay server (server/)','Blind mailbox for Standard and iOS. Docker/Linux, Windows, macOS, Android. Logs events without contents.','ok',0),
('Officer app','Windows dashboard for case officers, in Romanian: a real participant in the same protocol. One code for the whole organisation (large for a projector), cases open by themselves with a random case number, receipt and status signals go back to the reporter, deadlines under EU Directive 2019/1937, live updates. Deleting or exporting a single case is not built yet.','unk',0),
('Web reporter','Browser reporting page, no install, weaker anonymity stated openly in a banner.','unk',0),
('Evidence package','The folder evidence/: nine scripts that test the server surface, what it stores, its code, the app\'s permissions and libraries, the routing tags, the pairing code and the Tor hashes, plus a table that links every claim to its proof, and a proposed scope for an independent review. Not an audit. It found one claim the evidence does not support (F1) and four known vulnerabilities in server libraries, now fixed.','ok',1),
('Licence tool','Offline: create key pair, issue codes for apps and servers (single or batch), verify, sign a server release, small web interface.','ok',0),
('unpruuf Control','The customer\'s console on their own admin PC (local web page, English and Romanian). Adds servers over SSH with a key per server and a pinned host key, installs the node server in Docker, shows the state of all servers, unlocks them after a restart, updates them, and hands licence codes from the customer\'s stock to servers and named devices. It warns about a second install of one licence. Bookkeeping, not copy protection. Tested against a simulated server only, never against a real VPS.','unk',1),
('Relay pool tool','Signed list of relay addresses for companies, own key. Not fully wired into the app yet.','part',0),
('iOS app','Narrow companion in relay mode. Two real iPhones exchanged messages both ways. No node-mesh, no node lists, no licence modules yet. A build specification for the Business client (so an iPhone can pair with an Android Pro phone) was written on 14 October; nothing of it is built. The team decides the open points.','part',0),
])
lab={'ok':('built','ok'),'part':('partial','warn'),'unk':('built, unverified','warn'),'no':('not built','stop')}
areas=[]
for r in R:
    if r[0] not in areas: areas.append(r[0])
rows=''
for ar,f,d,s,n in R:
    t,c=lab[s]
    new=' <span class="chip ok">new since 8 Oct</span>' if n else ''
    rows+=f'<tr data-area="{E(ar)}"><td class="ar">{E(ar)}</td><td><b>{E(f)}</b>{new}</td><td>{E(d)}</td><td><span class="chip {c}">{t}</span></td></tr>\n'
opts=''.join(f'<option value="{E(x)}">{E(x)}</option>' for x in areas)
extra='''
.ctl{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.ctl input,.ctl select{font:inherit;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:9px 12px;min-width:0}
.ctl input{flex:1 1 220px}
.ctl select{flex:0 1 260px}
.ctl input:focus-visible,.ctl select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.big{max-width:1120px}
.big .tablewrap{overflow:auto;max-height:none}
.big table{min-width:760px;table-layout:fixed}
.big th:nth-child(1){width:15%}.big th:nth-child(2){width:23%}.big th:nth-child(3){width:46%}.big th:nth-child(4){width:16%}
.big td{overflow-wrap:anywhere}
td.ar{font-family:var(--font-mono);font-size:.76rem;color:var(--dim)}
@media (max-width:640px){.big table{min-width:0;table-layout:auto}.big thead{display:none}.big tr{display:block;padding:12px 14px;border-bottom:1px solid var(--line)}.big tr:last-child{border-bottom:0}.big td{display:block;padding:2px 0;border:0}.big td:last-child{margin-top:6px}}
.count{font-family:var(--font-mono);font-size:.8rem;color:var(--dim)}
.empty{padding:20px;color:var(--dim)}
'''
html=f'''<title>unpruuf Feature Table</title>
{css.replace('</style>',extra+'</style>')}
<div class="wrap big">
<header>
<div class="eyebrow">NexonAI · status 14 October 2026 · app 1.17</div>
<h1>What is inside the apps and nodes</h1>
<p class="lede">Every feature in one table: the Android app and its editions, the node server, the Android node, the relay and the tools, including the console for customers (Control). Each row carries its status. NexonAI runs no servers; every server belongs to the customer.</p>
<div class="meta">
<span class="chip ok">built</span>
<span class="chip warn">partial or built, unverified</span>
<span class="chip stop">not built</span>
</div>
</header>
<div class="callout"><b>Applies to all business and whistleblower parts.</b> Checked with automated tests and local runs. Not yet seen on a real phone and not over the real Tor network. Also open: Pro Groups and the Temp Node on the phone on real phones, Control against a real server, the Romanian texts read by a native speaker, and no independent audit.</div>
<div class="ctl">
<input id="q" type="search" placeholder="Search features, e.g. licence, Tor, TTL" aria-label="Search features">
<select id="area" aria-label="Filter by area"><option value="">All areas</option>{opts}</select>
<span class="count" id="cnt"></span>
</div>
<div class="tablewrap"><table id="t">
<thead><tr><th>Area</th><th>Feature</th><th>What it does</th><th>Status</th></tr></thead>
<tbody>
{rows}</tbody></table><div class="empty" id="none" hidden>No feature matches this search.</div></div>
<div class="callout ok"><b>What a node sees.</b> An encrypted packet of 4096 bytes, an address that changes every hour, the requested lifetime, the times of deposit and pick-up, and the number of requests. It does not see content, sender, recipient, names, contact lists or IP addresses (everything runs over Tor), and it cannot tell which addresses belong to one conversation. It can read the length of each packet\'s content, because that number sits in the clear inside the packet (finding F1). It cannot read, write (only the owner writes) or delete (only time deletes), and neither can we.</div>
<div class="callout"><b>Honest limit.</b> Someone who watches the network of both sides at the same time can still correlate timing patterns. That is an unsolved problem of every Tor service. No independent security audit has been completed, and a finished one would not be a certificate.</div>
<footer>Gabriel Hategan · NexonAI Consulting SRL · Alba Iulia</footer>
</div>
<script>
(function(){{
  var q=document.getElementById('q'),a=document.getElementById('area'),rows=[].slice.call(document.querySelectorAll('#t tbody tr')),c=document.getElementById('cnt'),n=document.getElementById('none');
  function run(){{
    var s=q.value.trim().toLowerCase(),ar=a.value,k=0;
    rows.forEach(function(r){{
      var ok=(!ar||r.getAttribute('data-area')===ar)&&(!s||r.textContent.toLowerCase().indexOf(s)>-1);
      r.hidden=!ok; if(ok)k++;
    }});
    c.textContent=k+' of '+rows.length+' features';
    n.hidden=k>0;
  }}
  q.addEventListener('input',run);a.addEventListener('change',run);run();
}})();
</script>
'''
open('feature-table-en2.html','w').write(html)
print(len(R),'rows',len(html))
