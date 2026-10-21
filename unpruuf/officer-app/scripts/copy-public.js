// tsc only compiles .ts — the dashboard's static files have to be copied next to dist/web/app.js,
// which serves them from path.join(__dirname, "public"). Copies sub-folders too (fonts/).
const fs = require("fs");
const path = require("path");
const from = path.join(__dirname, "..", "src", "web", "public");
const to = path.join(__dirname, "..", "dist", "web", "public");
let count = 0;
function copyDir(a, b) {
  fs.mkdirSync(b, { recursive: true });
  for (const entry of fs.readdirSync(a, { withFileTypes: true })) {
    const src = path.join(a, entry.name);
    const dst = path.join(b, entry.name);
    if (entry.isDirectory()) copyDir(src, dst);
    else { fs.copyFileSync(src, dst); count++; }
  }
}
copyDir(from, to);
console.log(`copied ${count} dashboard files to dist/web/public`);
