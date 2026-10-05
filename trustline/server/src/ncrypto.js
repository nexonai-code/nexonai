'use strict';
// Synchronous Node crypto used inside database transactions. Formats are identical to public/tlcrypto.js
// (SPKI DER base64 public keys, raw r||s ECDSA signatures, SHA-256).
const crypto = require('crypto');

const sha256Hex = (data) => crypto.createHash('sha256').update(data).digest('hex');

function newKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return {
    pub: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    priv: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
  };
}
function signWith(privB64, data) {
  const key = crypto.createPrivateKey({ key: Buffer.from(privB64, 'base64'), format: 'der', type: 'pkcs8' });
  return crypto.sign('sha256', Buffer.from(data), { key, dsaEncoding: 'ieee-p1363' }).toString('base64');
}
function verifySig(pubB64, data, sigB64) {
  try {
    const key = crypto.createPublicKey({ key: Buffer.from(pubB64, 'base64'), format: 'der', type: 'spki' });
    if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails.namedCurve !== 'prime256v1') return false;
    const sig = Buffer.from(sigB64, 'base64');
    if (sig.length !== 64) return false;
    return crypto.verify('sha256', Buffer.from(data), { key, dsaEncoding: 'ieee-p1363' }, sig);
  } catch (e) { return false; }
}
const keyIdOf = (spkiB64) => sha256Hex(Buffer.from(spkiB64, 'base64')).slice(0, 16);
function validSpki(b64) {
  try {
    const key = crypto.createPublicKey({ key: Buffer.from(b64, 'base64'), format: 'der', type: 'spki' });
    return key.asymmetricKeyType === 'ec' && key.asymmetricKeyDetails.namedCurve === 'prime256v1';
  } catch (e) { return false; }
}

module.exports = { sha256Hex, newKeyPair, signWith, verifySig, keyIdOf, validSpki };
