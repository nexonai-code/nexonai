'use strict';
const fs = require('fs');
const path = require('path');
const cfg = require('./src/config');
const { q } = require('./src/db');
const core = require('./src/core');
const U = require('./src/util');

// First start: create the relay signing key and two administrator accounts (four-eyes principle needs two).
core.relayKey();
if (!q.get('SELECT 1 FROM admins')) {
  const lines = ['TrustLine administrator credentials (created ' + new Date().toISOString() + ')', ''];
  for (const name of ['admin1', 'admin2']) {
    const pw = U.randomCode(16, 4);
    q.run('INSERT INTO admins(username, pass, created) VALUES(?,?,?)', name, U.hashPassword(pw), new Date().toISOString());
    lines.push(`${name}   ${pw}`);
  }
  lines.push('', 'Change the passwords after the first login (Admin console > Account).');
  const file = path.join(cfg.DATA_DIR, 'ADMIN-CREDENTIALS.txt');
  fs.writeFileSync(file, lines.join('\r\n'));
  console.log('\n' + lines.join('\n') + '\n(Saved to ' + file + ')\n');
}
require('./src/http').start();
