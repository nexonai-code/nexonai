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
// This computer only, unless the operator opens it to the office network on purpose
// (HOST=0.0.0.0): the page is meant for the people in the building, not for the internet.
const HOST = process.env.HOST ?? "127.0.0.1";

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".ico": "image/x-icon" };

const server = http.createServer((req, res) => {
  // A malformed escape (`/%`) makes decodeURIComponent throw; without this guard that one
  // request would end the process for everyone. Query strings are not part of the file name.
  let filePath;
  try {
    const pathname = (req.url ?? "/").split("?")[0];
    filePath = path.join(ROOT, decodeURIComponent(pathname === "/" ? "/index.html" : pathname));
  } catch {
    res.writeHead(400);
    return res.end("bad request");
  }
  if (!filePath.startsWith(ROOT + path.sep)) {
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

server.listen(PORT, HOST, () => {
  console.log(`unpruuf web-reporter listening on http://${HOST === "0.0.0.0" ? "<this computer's IP>" : "localhost"}:${PORT}`);
});
