/**
 * Zero-dependency static file server for public/ — this page has no server-side logic of its
 * own (everything runs in the browser, talking directly to the relay over CORS), so a plain
 * static server is all it needs. Kept separate from build.js so `npm start` doesn't require a
 * bundler dependency at runtime, only at build time.
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "public");
const PORT = Number(process.env.PORT ?? 5173);

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".ico": "image/x-icon" };

const server = http.createServer((req, res) => {
  let filePath = path.join(ROOT, decodeURIComponent(req.url === "/" ? "/index.html" : req.url));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end("forbidden");
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end("not found");
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`unpruuf web-reporter listening on http://localhost:${PORT}`);
});
