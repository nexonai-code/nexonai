'use strict';
const crypto = require('crypto');

class ApiError extends Error {
  constructor(status, code, message, extra) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.extra = extra || null;
  }
}

const nowIso = () => new Date().toISOString();
const addMs = (iso, ms) => new Date(new Date(iso).getTime() + ms).toISOString();

function randomId(prefix) {
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = crypto.randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += alpha[b[i] % alpha.length];
  return prefix + '-' + s;
}
function randomCode(len, groups) {
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = crypto.randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += alpha[b[i] % alpha.length];
  return groups ? s.replace(new RegExp('(.{' + groups + '})(?=.)', 'g'), '$1-') : s;
}
const randomToken = () => crypto.randomBytes(32).toString('base64url');

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 32, { N: 16384, r: 8, p: 1 });
  return 'scrypt$' + salt.toString('base64') + '$' + h.toString('base64');
}
function checkPassword(pw, stored) {
  if (!stored || typeof pw !== 'string') return false;
  const [kind, s, h] = stored.split('$');
  if (kind !== 'scrypt') return false;
  const salt = Buffer.from(s, 'base64');
  const want = Buffer.from(h, 'base64');
  const got = crypto.scryptSync(pw, salt, want.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(got, want);
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// ---- money: amounts are decimal strings with at most 2 decimals; stored as integer minor units.
const AMOUNT_RE = /^\d{1,12}(\.\d{1,2})?$/;
function toMinor(str) {
  if (!AMOUNT_RE.test(str)) throw new ApiError(422, 'bad_amount', 'Invalid amount: ' + str);
  const [i, f = ''] = str.split('.');
  return Number(i) * 100 + Number((f + '00').slice(0, 2));
}
const fromMinor = (n) => Math.floor(n / 100) + '.' + String(n % 100).padStart(2, '0');

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HEX64_RE = /^[0-9a-f]{64}$/;

module.exports = {
  ApiError, nowIso, addMs, randomId, randomCode, randomToken, hashPassword, checkPassword,
  parseCookies, toMinor, fromMinor, AMOUNT_RE, ISO_RE, UUID_RE, HEX64_RE,
};
