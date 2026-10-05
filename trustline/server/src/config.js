'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.TL_DATA ? path.resolve(process.env.TL_DATA) : path.join(ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const DEFAULTS = {
  // Network
  host: '0.0.0.0',
  port: 8080,
  // Optional TLS: set both to file paths (PEM). Without them the relay serves plain HTTP.
  tls: { keyFile: '', certFile: '' },
  // Public base URL shown in QR codes and on the start page. Empty = derived from the request.
  publicUrl: '',
  relayName: 'TrustLine Relay (Demo)',
  sessionHours: 12,
};

const file = path.join(DATA_DIR, 'config.json');
let cfg = {};
if (fs.existsSync(file)) {
  try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
    throw new Error('data/config.json is not valid JSON: ' + e.message);
  }
}
const merged = { ...DEFAULTS, ...cfg, tls: { ...DEFAULTS.tls, ...(cfg.tls || {}) } };
if (process.env.TL_PORT) merged.port = Number(process.env.TL_PORT);
if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(merged, null, 2));

module.exports = { ...merged, ROOT, DATA_DIR, PUBLIC_DIR: path.join(ROOT, 'public'), VERSION: '0.1.0' };
