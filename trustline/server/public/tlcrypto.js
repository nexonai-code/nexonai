/*
 * TrustLine shared crypto + protocol helpers.
 * Runs unchanged in the browser (operator portal, offline auditor) and in Node (relay, tests).
 * All primitives come from WebCrypto: ECDSA P-256 / SHA-256 (raw r||s signatures),
 * ECDH P-256 + HKDF-SHA256 + AES-256-GCM for the Channel B packages.
 * The Android app implements the exact same formats (see docs/PROTOCOL.md).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(globalThis.crypto);
  else root.TL = factory(root.crypto);
})(typeof self !== 'undefined' ? self : this, function (webcrypto) {
  'use strict';
  const subtle = webcrypto.subtle;
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const EC_SIGN = { name: 'ECDSA', namedCurve: 'P-256' };
  const EC_DH = { name: 'ECDH', namedCurve: 'P-256' };
  const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

  function b64e(u8) {
    if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64');
    let s = '';
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return btoa(s);
  }
  function b64d(str) {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(str, 'base64'));
    const bin = atob(str);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }
  function toBytes(x) { return typeof x === 'string' ? enc.encode(x) : x; }
  function rand(n) { return webcrypto.getRandomValues(new Uint8Array(n)); }
  function hex(u8) { return Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join(''); }

  async function sha256Bytes(data) { return new Uint8Array(await subtle.digest('SHA-256', toBytes(data))); }
  async function sha256Hex(data) { return hex(await sha256Bytes(data)); }

  /** Canonical JSON: sorted keys, no whitespace, strings via JSON.stringify, integers only. */
  function canon(v) {
    if (v === null) return 'null';
    const t = typeof v;
    if (t === 'string') return JSON.stringify(v);
    if (t === 'boolean') return v ? 'true' : 'false';
    if (t === 'number') {
      if (!Number.isSafeInteger(v)) throw new Error('canon: only integers are allowed');
      return String(v);
    }
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    if (t === 'object') {
      const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();
      return '{' + keys.map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
    }
    throw new Error('canon: unsupported type ' + t);
  }

  async function genSignKeyPair() { return subtle.generateKey(EC_SIGN, true, ['sign', 'verify']); }
  async function genEncKeyPair() { return subtle.generateKey(EC_DH, true, ['deriveBits']); }
  async function exportPub(key) { return b64e(new Uint8Array(await subtle.exportKey('spki', key))); }
  async function exportPriv(key) { return b64e(new Uint8Array(await subtle.exportKey('pkcs8', key))); }
  const importSignPub = (b) => subtle.importKey('spki', b64d(b), EC_SIGN, true, ['verify']);
  const importEncPub = (b) => subtle.importKey('spki', b64d(b), EC_DH, true, []);
  const importSignPriv = (b) => subtle.importKey('pkcs8', b64d(b), EC_SIGN, true, ['sign']);
  const importEncPriv = (b) => subtle.importKey('pkcs8', b64d(b), EC_DH, true, ['deriveBits']);

  /** Short key identifier: first 16 hex chars of SHA-256 over the SPKI DER bytes. */
  async function keyId(spkiB64) { return (await sha256Hex(b64d(spkiB64))).slice(0, 16); }

  async function signBytes(privKey, bytes) {
    return b64e(new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privKey, toBytes(bytes))));
  }
  async function verifyBytes(pubB64, bytes, sigB64) {
    try {
      const pub = await importSignPub(pubB64);
      return await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b64d(sigB64), toBytes(bytes));
    } catch (e) { return false; }
  }
  const signObject = (privKey, obj) => signBytes(privKey, canon(obj));
  const verifyObject = (pubB64, obj, sig) => verifyBytes(pubB64, canon(obj), sig);

  /** Generates a complete key bundle (used by the operator portal and by tests). */
  async function genBundle() {
    const s = await genSignKeyPair();
    const e = await genEncKeyPair();
    const signPub = await exportPub(s.publicKey);
    const encPub = await exportPub(e.publicKey);
    return {
      signPub, encPub,
      signPriv: await exportPriv(s.privateKey), encPriv: await exportPriv(e.privateKey),
      signKid: await keyId(signPub), encKid: await keyId(encPub),
    };
  }

  async function kekFor(secretBits, info) {
    const k = await subtle.importKey('raw', secretBits, 'HKDF', false, ['deriveKey']);
    return subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode(info) },
      k, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  /** recipients: [{ keyId, encPub }]. Returns the Channel B package object. */
  async function encryptPackage(payload, aad, recipients) {
    const contentRaw = rand(32);
    const ck = await subtle.importKey('raw', contentRaw, 'AES-GCM', false, ['encrypt']);
    const iv = rand(12);
    const ct = new Uint8Array(await subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, ck, enc.encode(canon(payload))));
    const rcpts = [];
    for (const r of recipients) {
      const eph = await genEncKeyPair();
      const pub = await importEncPub(r.encPub);
      const secret = await subtle.deriveBits({ name: 'ECDH', public: pub }, eph.privateKey, 256);
      const kek = await kekFor(secret, 'TrustLine-B-v1|' + r.keyId);
      const iv2 = rand(12);
      const wk = new Uint8Array(await subtle.encrypt(
        { name: 'AES-GCM', iv: iv2, additionalData: enc.encode(aad + '|' + r.keyId) }, kek, contentRaw));
      rcpts.push({ k: r.keyId, epk: await exportPub(eph.publicKey), iv: b64e(iv2), wk: b64e(wk) });
    }
    return { v: 1, aad, iv: b64e(iv), ct: b64e(ct), rcpts };
  }

  /** Decrypts a package for one recipient. encPrivB64 is the PKCS#8 private key (base64). */
  async function decryptPackage(pkg, myKeyId, encPrivB64) {
    const r = pkg.rcpts.find((x) => x.k === myKeyId);
    if (!r) throw new Error('not a recipient of this package');
    const priv = await importEncPriv(encPrivB64);
    const epk = await importEncPub(r.epk);
    const secret = await subtle.deriveBits({ name: 'ECDH', public: epk }, priv, 256);
    const kek = await kekFor(secret, 'TrustLine-B-v1|' + myKeyId);
    const contentRaw = new Uint8Array(await subtle.decrypt(
      { name: 'AES-GCM', iv: b64d(r.iv), additionalData: enc.encode(pkg.aad + '|' + myKeyId) }, kek, b64d(r.wk)));
    const ck = await subtle.importKey('raw', contentRaw, 'AES-GCM', false, ['decrypt']);
    const pt = await subtle.decrypt(
      { name: 'AES-GCM', iv: b64d(pkg.iv), additionalData: enc.encode(pkg.aad) }, ck, b64d(pkg.ct));
    return JSON.parse(dec.decode(pt));
  }

  const pkgHash = (pkg) => sha256Hex(canon(pkg));
  const normalizeCode = (c) => String(c || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  const codeHash = (instructionId, code) => sha256Hex(instructionId + ':' + normalizeCode(code));
  function generateCode() {
    let out = '';
    while (out.length < 12) {
      const b = rand(1)[0];
      if (b < 224) out += CODE_ALPHABET[b % 32];
    }
    return out;
  }
  const formatCode = (c) => normalizeCode(c).replace(/(.{4})(?=.)/g, '$1-');
  function uuid() {
    const b = rand(16);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const h = hex(b);
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function randomId(prefix) {
    const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    const b = rand(8);
    for (let i = 0; i < 8; i++) s += alpha[b[i] % alpha.length];
    return prefix + '-' + s;
  }

  /** Passphrase-protected key backup (PBKDF2-SHA256 + AES-256-GCM). */
  async function backupEncrypt(obj, passphrase) {
    const salt = rand(16), iv = rand(12), iterations = 210000;
    const km = await subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    const key = await subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj))));
    return { format: 'trustline-key-backup/1', kdf: 'PBKDF2-SHA256', iterations, salt: b64e(salt), iv: b64e(iv), ct: b64e(ct) };
  }
  async function backupDecrypt(file, passphrase) {
    if (!file || file.format !== 'trustline-key-backup/1') throw new Error('This is not a TrustLine key backup file.');
    const km = await subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    const key = await subtle.deriveKey({ name: 'PBKDF2', salt: b64d(file.salt), iterations: file.iterations, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    let pt;
    try { pt = await subtle.decrypt({ name: 'AES-GCM', iv: b64d(file.iv) }, key, b64d(file.ct)); } catch (e) { throw new Error('Wrong passphrase or damaged file.'); }
    return JSON.parse(dec.decode(pt));
  }

  return {
    backupEncrypt, backupDecrypt,
    b64e, b64d, hex, rand, canon, sha256Hex, sha256Bytes,
    genSignKeyPair, genEncKeyPair, genBundle, exportPub, exportPriv,
    importSignPub, importEncPub, importSignPriv, importEncPriv, keyId,
    signBytes, verifyBytes, signObject, verifyObject,
    encryptPackage, decryptPackage, pkgHash, codeHash, normalizeCode, generateCode, formatCode,
    uuid, randomId,
  };
});
