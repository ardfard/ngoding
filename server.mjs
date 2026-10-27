// Minimal static server for the PoC: public/ plus the npm-installed xterm.js
// and v86 builds. The CheerpX VM additionally needs:
//  - cross-origin isolation headers (for SharedArrayBuffer)
//  - HTTP Range support, so the disk image is streamed block by block
//  - Last-Modified/ETag, without which HttpBytesDevice refuses to stream
import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const PORT = Number(process.env.PORT ?? 8080);
const root = resolve(import.meta.dirname, "public");
const vendor = {
  "/vendor/xterm/": resolve(import.meta.dirname, "node_modules/@xterm/xterm"),
  "/vendor/addon-fit/": resolve(import.meta.dirname, "node_modules/@xterm/addon-fit"),
  "/vendor/v86/": resolve(import.meta.dirname, "node_modules/v86/build"),
};
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".wasm": "application/wasm",
};

function resolvePath(urlPath) {
  for (const [prefix, dir] of Object.entries(vendor)) {
    if (urlPath.startsWith(prefix)) return safeJoin(dir, urlPath.slice(prefix.length));
  }
  return safeJoin(root, urlPath === "/" ? "index.html" : urlPath);
}

function safeJoin(dir, rel) {
  const p = normalize(join(dir, decodeURIComponent(rel)));
  return p.startsWith(dir) ? p : null;
}

createServer((req, res) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");

  const path = resolvePath(new URL(req.url, "http://x").pathname);
  let stat;
  try {
    stat = path && statSync(path);
  } catch {}
  if (!stat?.isFile()) {
    res.writeHead(404).end("not found");
    return;
  }

  res.setHeader("Content-Type", TYPES[extname(path)] ?? "application/octet-stream");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Last-Modified", stat.mtime.toUTCString());
  res.setHeader("ETag", `"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`);

  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  if (range) {
    const start = range[1] ? Number(range[1]) : stat.size - Number(range[2]);
    const end = range[1] && range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
    if (start > end || start >= stat.size) {
      res.writeHead(416, { "Content-Range": `bytes */${stat.size}` }).end();
      return;
    }
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Content-Length": end - start + 1,
    });
    if (req.method === "HEAD") return res.end();
    createReadStream(path, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, { "Content-Length": stat.size });
  if (req.method === "HEAD") return res.end();
  createReadStream(path).pipe(res);
}).listen(PORT, () => console.log(`ngoding PoC on http://localhost:${PORT}`));
