// Server for the PoC. Everything heavy (the VM, the student's programs) runs in
// the browser; the server only:
//  - serves static files: public/ plus the npm-installed xterm.js and v86 builds
//  - hands out sessions (POST /api/session) and grades output files
//    (POST /api/grade), so expected answers never reach the browser
import { createServer } from "node:http";
import { createReadStream, readFileSync, statSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { extname, join, normalize, resolve } from "node:path";
import { PROBLEMS, grade, inputsFor, publicProblem } from "./lib/problems.js";
import { sessions } from "./lib/session.js";

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
// Content-addressed files never change, so browsers and CDNs may keep them
// forever. Everything else is revalidated (cheap 304s via ETag).
const IMMUTABLE = /^\/v86\/(flat\/[0-9a-f]+\.bin\.zst|state-[0-9a-f]+\.bin\.zst)$/;

// Tokens are signed with this secret; keep it stable across restarts so
// students keep their sessions.
const secretFile = resolve(import.meta.dirname, ".ngoding-secret");
const secret = process.env.NGODING_SECRET ?? (() => {
  try {
    return readFileSync(secretFile, "utf8").trim();
  } catch {
    const s = randomBytes(32).toString("hex");
    writeFileSync(secretFile, s + "\n", { mode: 0o600 });
    return s;
  }
})();
const session = sessions(secret);

const api = {
  // Body: { token? }. Reuses a valid token, otherwise starts a new session.
  "/api/session": ({ token }) => {
    let seed = session.verify(token);
    if (seed === null) ({ seed, token } = session.create());
    return { token, seed, problems: PROBLEMS.map(publicProblem), inputs: inputsFor(seed) };
  },
  // Body: { token, problemId, output } where output is the file's text.
  "/api/grade": ({ token, problemId, output }) => {
    const seed = session.verify(token);
    const p = PROBLEMS.find((p) => p.id === problemId);
    if (seed === null || !p || typeof output !== "string") return [400, { error: "bad request" }];
    return grade(p.solve(inputsFor(seed)[p.id]), output);
  },
};

async function handleApi(req, res, route) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1 << 20) return send(res, 413, { error: "output too large" });
  }
  let result;
  try {
    result = route(JSON.parse(body || "{}"));
  } catch {
    return send(res, 400, { error: "bad request" });
  }
  const [status, payload] = Array.isArray(result) ? result : [200, result];
  send(res, status, payload);
}

function send(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(payload));
}

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
  const urlPath = new URL(req.url, "http://x").pathname;
  if (api[urlPath]) {
    if (req.method !== "POST") return send(res, 405, { error: "use POST" });
    return handleApi(req, res, api[urlPath]);
  }

  const path = resolvePath(urlPath);
  let stat;
  try {
    stat = path && statSync(path);
  } catch {}
  if (!stat?.isFile()) {
    res.writeHead(404).end("not found");
    return;
  }

  const etag = `"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", IMMUTABLE.test(urlPath) ? "public, max-age=31536000, immutable" : "no-cache");
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304).end();
    return;
  }
  res.writeHead(200, {
    "Content-Type": TYPES[extname(path)] ?? "application/octet-stream",
    "Content-Length": stat.size,
  });
  if (req.method === "HEAD") return res.end();
  createReadStream(path).pipe(res);
}).listen(PORT, () => console.log(`ngoding PoC on http://localhost:${PORT}`));
