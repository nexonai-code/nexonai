#!/usr/bin/env node
// Local GUI wrapper around issue.js's exact logic (../lib.js — same buildPayload/signLicense
// used by the CLI tool). Starts a server bound to localhost only, opens the default browser,
// and persists every issued license into data/customers.json next to this file so past
// customers/codes are browsable without re-running anything. No network call, nothing sent
// anywhere — the whole point of this system staying offline.
'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const {
  EDITIONS, MS_PER_YEAR,
  privateKeyFromRecord, buildPayload, signLicense,
} = require('../lib');

const KEY_FILE = path.join(__dirname, '..', 'private-key.json');
const DATA_DIR = path.join(__dirname, 'data');
const CUSTOMERS_FILE = path.join(DATA_DIR, 'customers.json');
const PORT = 4321;

if (!fs.existsSync(KEY_FILE)) {
  console.error(`No key pair found at ${KEY_FILE}.`);
  console.error("Run 'node keygen.js' from the license-tool folder (one level up) first.");
  process.exit(1);
}
const privateKey = privateKeyFromRecord(JSON.parse(fs.readFileSync(KEY_FILE, 'utf8')));

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadCustomers() {
  if (!fs.existsSync(CUSTOMERS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(CUSTOMERS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveCustomers(list) {
  fs.writeFileSync(CUSTOMERS_FILE, JSON.stringify(list, null, 2));
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/customers', (req, res) => {
  res.json(loadCustomers());
});

app.post('/api/issue', (req, res) => {
  const body = req.body || {};
  const edition = body.edition;
  const customer = typeof body.customer === 'string' ? body.customer.trim() : '';
  const count = parseInt(body.count, 10);
  const years = parseFloat(body.years);
  const serialPrefix = (typeof body.serialPrefix === 'string' && body.serialPrefix.trim()) || 'NX';
  const startAt = parseInt(body.startAt, 10) || 1;

  if (!edition || !EDITIONS.includes(edition)) {
    return res.status(400).json({ error: `Edition must be one of: ${EDITIONS.join(', ')}.` });
  }
  if (!customer) return res.status(400).json({ error: 'Customer name is required.' });
  if (customer.includes('|')) return res.status(400).json({ error: "Customer name must not contain '|'." });
  if (!Number.isInteger(count) || count < 1 || count > 5000) {
    return res.status(400).json({ error: 'Count must be a positive integer (max 5000 per batch).' });
  }
  if (!Number.isFinite(years) || years <= 0) {
    return res.status(400).json({ error: 'Years must be a positive number.' });
  }
  if (!Number.isInteger(startAt) || startAt < 1) {
    return res.status(400).json({ error: 'Start-at must be a positive integer.' });
  }

  const issuedAtMs = Date.now();
  const expiresAtMs = issuedAtMs + Math.round(years * MS_PER_YEAR);
  const pad = String(startAt + count - 1).length < 4 ? 4 : String(startAt + count - 1).length;

  const customers = loadCustomers();
  const issued = [];
  for (let i = 0; i < count; i++) {
    const serial = `${serialPrefix}-${String(startAt + i).padStart(pad, '0')}`;
    const payload = buildPayload({ edition, serial, customer, issuedAtMs, expiresAtMs });
    const code = signLicense(privateKey, payload);
    const record = { serial, customer, edition, issuedAtMs, expiresAtMs, code };
    issued.push(record);
    customers.push(record);
  }
  saveCustomers(customers);

  res.json({ issued });
});

app.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  console.log(`unpruuf License Tool running at ${url}`);
  console.log('Close this window to stop it.');
  const { exec } = require('child_process');
  if (process.platform === 'win32') exec(`start "" "${url}"`);
  else if (process.platform === 'darwin') exec(`open "${url}"`);
  else exec(`xdg-open "${url}"`, () => {});
});
