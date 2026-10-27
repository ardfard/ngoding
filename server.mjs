// Minimal static server for the PoC: public/ plus the npm-installed xterm.js
// and v86 builds.
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
  const path = resolvePath(new URL(req.url, "http://x").pathname);
  let stat;
  try {
    stat = path && statSync(path);
  } catch {}
  if (!stat?.isFile()) {
    res.writeHead(404).end("not found");
    return;
  }

  res.writeHead(200, {
    "Content-Type": TYPES[extname(path)] ?? "application/octet-stream",
    "Content-Length": stat.size,
    "Cache-Control": "no-cache",
  });
  if (req.method === "HEAD") return res.end();
  createReadStream(path).pipe(res);
}).listen(PORT, () => console.log(`ngoding PoC on http://localhost:${PORT}`));
