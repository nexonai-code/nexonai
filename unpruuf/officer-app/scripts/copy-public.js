// tsc only compiles .ts — the dashboard's static files have to be copied next to dist/web/app.js,
// which serves them from path.join(__dirname, "public").
const fs = require("fs");
const path = require("path");
const from = path.join(__dirname, "..", "src", "web", "public");
const to = path.join(__dirname, "..", "dist", "web", "public");
fs.mkdirSync(to, { recursive: true });
for (const f of fs.readdirSync(from)) fs.copyFileSync(path.join(from, f), path.join(to, f));
console.log(`copied ${fs.readdirSync(from).length} dashboard files to dist/web/public`);
