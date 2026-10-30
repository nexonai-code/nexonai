#!/usr/bin/env node
// Prints the PUBLIC key of private-key.json (safe to share: it only lets apps check licences).
'use strict';
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'private-key.json');
if (!fs.existsSync(file)) { console.error('private-key.json fehlt / is missing: ' + file); process.exit(1); }
const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
console.log(rec.publicKeyB64);
