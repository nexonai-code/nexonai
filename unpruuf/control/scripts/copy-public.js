// Copies the page files next to the compiled code (tsc only handles .ts).
const fs = require('fs');
const path = require('path');
const from = path.join(__dirname, '..', 'public');
const to = path.join(__dirname, '..', 'dist', 'public');
fs.mkdirSync(to, { recursive: true });
for (const f of fs.readdirSync(from)) fs.copyFileSync(path.join(from, f), path.join(to, f));
