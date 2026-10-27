#!/usr/bin/env node
// Paste a server licence without the setup page: asks for the code in this window, checks it
// (same check as the server, offline) and stores it as license.txt in the data folder of the chosen
// slot. The server picks it up at the next start. Started by apply-license.bat / the Start menu entry.
'use strict';
const readline = require('readline');
const { LICENSE_PATH, NODE_SLOT } = require('./dist/config');
const { LicenseGuard } = require('./dist/license');

const guard = new LicenseGuard({ filePath: LICENSE_PATH, envCode: null, free: false });
const day = (ms) => new Date(ms).toISOString().slice(0, 10);

function show(s) {
  console.log(`  Kunde / customer : ${s.customer}`);
  console.log(`  Seriennummer     : ${s.serial}`);
  console.log(`  Nodes            : ${s.maxNodes}`);
  console.log(`  Gueltig bis      : ${day(s.expiresAtMs)} (${s.daysLeft} Tage / days)`);
}

console.log(`\nunpruuf Node-Server, Slot ${NODE_SLOT}`);
const before = guard.summary();
if (before.status === 'valid' || before.status === 'expiring') {
  console.log('\nAktuelle Lizenz / current licence:');
  show(before);
} else if (before.status === 'expired') {
  console.log(`\nDie vorhandene Lizenz ist abgelaufen (${before.expiresAtMs ? day(before.expiresAtMs) : '?'}). / The stored licence has expired.`);
} else {
  console.log('\nBisher keine Lizenz hinterlegt. / No licence stored yet.');
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
console.log('\nLizenzcode einfuegen (Rechtsklick = Einfuegen) und Enter druecken.');
console.log('Er beginnt mit  unpruuf-server-license:v1:');
console.log('Paste the licence code (right click = paste), then press Enter.');
rl.question('\n> ', (answer) => {
  rl.close();
  const code = String(answer || '').trim().split(/\s+/)[0] || '';
  if (!code) { console.log('\nNichts eingegeben. / Nothing entered.'); process.exit(1); }
  const result = guard.apply(code);
  if (!result.ok) {
    if (result.error === 'wrong-type') {
      console.log('\nDas ist eine App-Lizenz, keine Server-Lizenz. / This is an app licence, not a server licence.');
      console.log('Eine Server-Lizenz beginnt mit  unpruuf-server-license:v1:');
    } else {
      console.log('\nDer Code ist nicht gueltig. / The code is not valid.');
      console.log('Moegliche Gruende: nicht vollstaendig kopiert, oder mit einem anderen Schluessel signiert als dieser Server.');
    }
    process.exit(1);
  }
  const s = guard.summary();
  console.log('\nLizenz gespeichert. / Licence stored:');
  show(s);
  console.log(`\nDatei: ${LICENSE_PATH}`);
  console.log('Jetzt "unpruuf Node Server" starten (ist er schon offen: Fenster schliessen und neu starten). / Now start the node server (if it is already open, close it and start it again).');
  process.exit(0);
});
