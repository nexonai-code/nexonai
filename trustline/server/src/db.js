'use strict';
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const cfg = require('./config');

const db = new DatabaseSync(path.join(cfg.DATA_DIR, 'trustline.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS admins (
  username TEXT PRIMARY KEY, pass TEXT NOT NULL, created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, kind TEXT NOT NULL, ref TEXT NOT NULL, expires TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS operators (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, country TEXT NOT NULL, licence TEXT NOT NULL,
  contact TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, risk TEXT NOT NULL DEFAULT 'medium',
  dd TEXT NOT NULL DEFAULT '{}', created TEXT NOT NULL,
  sign_pub TEXT, enc_pub TEXT, sign_kid TEXT, enc_kid TEXT, keys_at TEXT, status_reason TEXT);
CREATE TABLE IF NOT EXISTS operator_users (
  username TEXT PRIMARY KEY, operator_id TEXT NOT NULL REFERENCES operators(id),
  pass TEXT, invite TEXT, invite_exp TEXT);
CREATE TABLE IF NOT EXISTS proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, subject TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
  proposer TEXT NOT NULL, approver TEXT, status TEXT NOT NULL, created TEXT NOT NULL, decided TEXT);
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY, operator_id TEXT NOT NULL REFERENCES operators(id), name TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '', country TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', status TEXT NOT NULL,
  per_instruction INTEGER NOT NULL, per_day INTEGER NOT NULL,
  offline_payout INTEGER NOT NULL DEFAULT 0, offline_limit INTEGER NOT NULL DEFAULT 0, offline_hours INTEGER NOT NULL DEFAULT 24,
  code TEXT UNIQUE, code_exp TEXT, created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT NOT NULL REFERENCES agents(id),
  sign_pub TEXT NOT NULL, enc_pub TEXT NOT NULL, sign_kid TEXT NOT NULL, enc_kid TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, cert TEXT, cert_sig TEXT,
  created TEXT NOT NULL, certified_at TEXT, revoked_at TEXT, revoked_reason TEXT);
CREATE INDEX IF NOT EXISTS devices_kid ON devices(sign_kid);
CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY, a TEXT NOT NULL REFERENCES operators(id), b TEXT NOT NULL REFERENCES operators(id),
  corridors TEXT NOT NULL, status TEXT NOT NULL, record TEXT NOT NULL, a_sig TEXT, b_sig TEXT,
  created TEXT NOT NULL, approved TEXT);
CREATE TABLE IF NOT EXISTS instructions (
  id TEXT PRIMARY KEY, sender_agent TEXT NOT NULL, sender_op TEXT NOT NULL,
  recipient_agent TEXT NOT NULL, recipient_op TEXT NOT NULL, corridor TEXT NOT NULL,
  amount TEXT NOT NULL, currency TEXT NOT NULL, usd_minor INTEGER NOT NULL,
  status TEXT NOT NULL, frozen INTEGER NOT NULL DEFAULT 0, freeze_reason TEXT,
  instruction TEXT NOT NULL, sig TEXT NOT NULL, package TEXT NOT NULL, code_hash TEXT NOT NULL,
  wrong_codes INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL, received TEXT NOT NULL,
  expires TEXT NOT NULL, updated TEXT NOT NULL, receipt TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ins_recipient ON instructions(recipient_agent, status);
CREATE INDEX IF NOT EXISTS ins_sender ON instructions(sender_agent, received);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, instruction_id TEXT NOT NULL, type TEXT NOT NULL, agent_id TEXT NOT NULL,
  nonce TEXT NOT NULL UNIQUE, event TEXT NOT NULL, sig TEXT NOT NULL, received TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS log (
  seq INTEGER PRIMARY KEY, ts TEXT NOT NULL, type TEXT NOT NULL, ref TEXT NOT NULL, ops TEXT NOT NULL,
  data TEXT NOT NULL, prev TEXT NOT NULL, hash TEXT NOT NULL, sig TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS op_log (
  operator_id TEXT NOT NULL, seq INTEGER NOT NULL, ts TEXT NOT NULL, type TEXT NOT NULL, ref TEXT NOT NULL,
  relay_seq INTEGER NOT NULL, relay_hash TEXT NOT NULL, data TEXT NOT NULL, prev TEXT NOT NULL, hash TEXT NOT NULL,
  PRIMARY KEY (operator_id, seq));
CREATE TABLE IF NOT EXISTS seals (
  id INTEGER PRIMARY KEY AUTOINCREMENT, operator_id TEXT NOT NULL, seq INTEGER NOT NULL, hash TEXT NOT NULL,
  seal TEXT NOT NULL, sig TEXT NOT NULL, received TEXT NOT NULL);
`);

let depth = 0;
/** Runs fn inside one immediate transaction (re-entrant). */
function tx(fn) {
  if (depth > 0) return fn();
  db.exec('BEGIN IMMEDIATE');
  depth++;
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally { depth--; }
}

const q = {
  get: (sql, ...p) => db.prepare(sql).get(...p),
  all: (sql, ...p) => db.prepare(sql).all(...p),
  run: (sql, ...p) => db.prepare(sql).run(...p),
};

module.exports = { db, tx, q };
