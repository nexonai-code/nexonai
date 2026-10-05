'use strict';
// Builds the stand-alone Offline Auditor Tool (one HTML file, no network access needed).
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(__dirname, 'auditor.src.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const tl = fs.readFileSync(path.join(root, 'public', 'tlcrypto.js'), 'utf8');
const out = src.replace('/*INLINE_CSS*/', () => css).replace('/*INLINE_TLCRYPTO*/', () => tl);
fs.writeFileSync(path.join(root, 'public', 'auditor.html'), out);
console.log('Built public/auditor.html (' + Math.round(out.length / 1024) + ' KB)');
