# Play playground and `/problems` split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the app into `/play` (IDE with file tree, tabs, Run/Build) and `/problems` (today's graded exercises), with separate VM saves and `/` redirecting to `/play`.

**Architecture:** Dual HTML entry points share `vm.js` (parameterized IndexedDB save key + new agent FS verbs), `editor.js` / `languages.js`, and ghostty-web. Play adds `file-tree.js`, `build-cmd.js`, and a path-based tabbed editor API. The guest agent gains `ls` / `mkdir` / `rm` / `mv`. Axum embeds the new pages and redirects `/` → `/play`.

**Tech Stack:** Rust/Axum static embed, vanilla ES modules, CodeMirror 6, ghostty-web, v86, IndexedDB, Playwright e2e, Node's built-in test runner (`node --test`).

**Spec:** `docs/superpowers/specs/2026-10-31-play-playground-design.md`

## Global Constraints

- Fixed agent verb set only (no arbitrary `exec` on ttyS1); paths unrestricted like today's `read`/`write`.
- Play does not call `/api/session` or `/api/grade`.
- Separate IndexedDB keys: `vm:play` and `vm:problems`; migrate legacy `snapshot` → `vm:problems` once.
- Tree rooted at `/home/user`; Build marker walk stops at `/home/user`.
- Editor open size cap: 1 MiB; refuse binary (NUL in first 8 KiB).
- Image rebuild (`npm run build:image`) required before Play agent e2e.
- Follow existing code style (small modules, short comments, no drive-by refactors).

## File map

| File | Responsibility |
|------|----------------|
| `image/agent.sh` | New `ls` / `mkdir` / `rm` / `mv` verbs |
| `public/vm.js` | Save-key param + migration; `listDir` / `mkdir` / `rm` / `mv`; boot with empty problems |
| `public/build-cmd.js` | Pure marker → command detection + resolve effective build |
| `public/file-tree.js` | Sidebar tree UI + mutations |
| `public/editor.js` | Keep problem `open`; add path/tab helpers Play needs (or thin `play-editor.js` if file grows too large — prefer extending `editor.js` with `openPath` / `closePath` / `getOpenPaths`) |
| `public/languages.js` | `languageFromPath(path)` |
| `public/problems.html` | Current exercise page (moved from `index.html`) + link to Play |
| `public/problems.js` | Entry: `startApp` from `ui.js` |
| `public/play.html` / `public/play.js` / `public/play-ui.js` | Play IDE shell |
| `public/ui.js` | Problems-only; add nav link wiring if needed in HTML |
| `src/main.rs` | Embed new assets; `/` → `/play` redirect; drop old `/` → index mapping |
| `public/style.css` | Tree, tabs, play layout |
| `test/build-cmd.test.mjs` | Unit tests for build detection |
| `test/e2e.mjs` | Problems URL `/problems`; add Play coverage |
| `README.md` | Two modes, saves, routes |
| `package.json` | Optional `"test:unit": "node --test test/*.test.mjs"` |

Delete or stop embedding `public/index.html` after move (redirect replaces it).

---

### Task 1: Build-command detection (pure, TDD)

**Files:**
- Create: `public/build-cmd.js`
- Create: `test/build-cmd.test.mjs`
- Modify: `package.json` (add `test:unit` script)

**Interfaces:**
- Produces:
  - `BUILD_MARKERS`: ordered list `{ file, command }` — check in this order at each directory: `Cargo.toml`→`cargo build`, `go.mod`→`go build .`, `Makefile`→`make`, `uv.lock`→`uv sync`, `pyproject.toml`→`uv sync`
  - `detectBuildInListing(names: string[]): { command: string, marker: string } | null` — first matching marker filename in `names`
  - `resolveBuild({ override, detected }): { command: string, dir: string | null, source: "override" | "detected" | "none" }` — `override` non-empty string wins; `detected` is `{ command, dir } | null`; `dir` for override-only is `null` (caller uses `/home/user`)

- [ ] **Step 1: Write the failing tests**

```js
// test/build-cmd.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectBuildInListing, resolveBuild } from "../public/build-cmd.js";

describe("detectBuildInListing", () => {
  it("prefers Cargo.toml over Makefile", () => {
    const d = detectBuildInListing(["Makefile", "Cargo.toml", "src"]);
    assert.deepEqual(d, { command: "cargo build", marker: "Cargo.toml" });
  });
  it("returns null when no marker", () => {
    assert.equal(detectBuildInListing(["main.py", "README"]), null);
  });
  it("maps uv.lock to uv sync", () => {
    assert.deepEqual(detectBuildInListing(["uv.lock"]), { command: "uv sync", marker: "uv.lock" });
  });
});

describe("resolveBuild", () => {
  it("override wins", () => {
    const r = resolveBuild({
      override: "make release",
      detected: { command: "cargo build", dir: "/home/user/app" },
    });
    assert.deepEqual(r, { command: "make release", dir: null, source: "override" });
  });
  it("uses detection when override empty", () => {
    const r = resolveBuild({
      override: "  ",
      detected: { command: "make", dir: "/home/user/p" },
    });
    assert.deepEqual(r, { command: "make", dir: "/home/user/p", source: "detected" });
  });
  it("none when neither", () => {
    assert.equal(resolveBuild({ override: "", detected: null }).source, "none");
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `node --test test/build-cmd.test.mjs`  
Expected: FAIL (module missing)

- [ ] **Step 3: Implement `public/build-cmd.js`**

```js
export const BUILD_MARKERS = [
  { file: "Cargo.toml", command: "cargo build" },
  { file: "go.mod", command: "go build ." },
  { file: "Makefile", command: "make" },
  { file: "uv.lock", command: "uv sync" },
  { file: "pyproject.toml", command: "uv sync" },
];

export function detectBuildInListing(names) {
  const set = new Set(names);
  for (const m of BUILD_MARKERS) {
    if (set.has(m.file)) return { command: m.command, marker: m.file };
  }
  return null;
}

export function resolveBuild({ override, detected }) {
  const o = (override ?? "").trim();
  if (o) return { command: o, dir: null, source: "override" };
  if (detected) return { command: detected.command, dir: detected.dir, source: "detected" };
  return { command: "", dir: null, source: "none" };
}
```

Also export async helper for Play (used later; can add in this task):

```js
/** Walk from startDir up to /home/user inclusive. listDir(path) -> Promise<string[]>. */
export async function findBuild(startDir, listDir) {
  const root = "/home/user";
  let dir = (startDir || root).replace(/\/$/, "") || root;
  if (dir !== root && !dir.startsWith(root + "/")) dir = root;
  for (;;) {
    const names = await listDir(dir);
    const hit = detectBuildInListing(names ?? []);
    if (hit) return { command: hit.command, dir, marker: hit.marker };
    if (dir === root) return null;
    dir = dir.slice(0, dir.lastIndexOf("/")) || root;
    if (dir.length < root.length) return null;
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `node --test test/build-cmd.test.mjs`  
Expected: PASS

- [ ] **Step 5: Add npm script and commit**

```json
"test:unit": "node --test test/*.test.mjs"
```

```bash
git add public/build-cmd.js test/build-cmd.test.mjs package.json
git commit -m "Add build-command detection helpers for Play."
```

---

### Task 2: Agent FS verbs

**Files:**
- Modify: `image/agent.sh`
- Note: image rebuild is Task 7; local syntax check only here

**Interfaces:**
- Produces agent verbs (request line still `id verb a b`):
  - `ls <path>` → `DATA id <base64>` of lines `d\tname` / `f\tname` (no `.`/`..`), then `DONE id status` (`0` if dir readable, else non-zero, no DATA)
  - `mkdir <path>` → `mkdir -p`, `chown user:user` on path (and best-effort parents like write)
  - `rm <path>` → `rm -rf -- "$a"`
  - `mv <src> <dst>` → `mv -- "$a" "$b"`; chown destination to user when it is a new path under a user-owned tree (best-effort `chown -R user:user` on dst)

- [ ] **Step 1: Extend `image/agent.sh` case arms**

After the `read)` arm, add:

```bash
        ls)
            if [ -d "$a" ]; then
                out=$(find "$a" -mindepth 1 -maxdepth 1 \( -type d -printf 'd\t%f\n' -o -type f -printf 'f\t%f\n' -o -printf 'f\t%f\n' \) | sort)
                echo "DATA $id $(printf %s "$out" | base64 -w0)"
                st=0
            else
                st=1
            fi ;;
        mkdir)
            mkdir -p "$a" && chown user:user "$a"
            st=$? ;;
        rm)
            rm -rf -- "$a"
            st=$? ;;
        mv)
            mv -- "$a" "$b" && chown -R user:user "$b" 2>/dev/null
            st=$? ;;
```

Use `find` as above only if busybox/debian find supports `-printf` (Debian does). Prefer that over parsing `ls`.

- [ ] **Step 2: Sanity-check script syntax**

Run: `bash -n image/agent.sh`  
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add image/agent.sh
git commit -m "Add ls/mkdir/rm/mv verbs to the guest agent."
```

---

### Task 3: VM save keys + FS wrappers

**Files:**
- Modify: `public/vm.js`
- Test: manual reasoning + later e2e; optional tiny test of migration helper if extracted

**Interfaces:**
- Consumes: `store.get` / `put` / `del`
- Produces:
  - `boot(ctx)` where `ctx.saveKey` is required (`"vm:play"` | `"vm:problems"`); `ctx.problems` / `ctx.inputs` optional (default `[]` / `{}`); skip input writes when no problems
  - `listDir(path): Promise<{ name: string, type: "dir" | "file" }[] | null>` — null on failure
  - `mkdir(path): Promise<boolean>`
  - `rm(path): Promise<boolean>`
  - `mv(from, to): Promise<boolean>`
  - `reset()` deletes only the configured `saveKey` for this page's boot (store key used in last `boot` / module-level `saveKey` set in `boot`)

- [ ] **Step 1: Replace fixed `SAVE_KEY` with boot-scoped key + migration**

```js
const LEGACY_SAVE_KEY = "snapshot";
let saveKey = "vm:problems";

async function loadSaved(key) {
  let saved = await store.get(key);
  if (!saved && key === "vm:problems") {
    const legacy = await store.get(LEGACY_SAVE_KEY);
    if (legacy) {
      await store.put(key, legacy);
      await store.del(LEGACY_SAVE_KEY);
      saved = legacy;
    }
  }
  return saved;
}
```

In `boot(ctx)`: `saveKey = ctx.saveKey;` then `let saved = await loadSaved(saveKey);` and use `saveKey` in `save` / invalidation deletes / `reset`.

- [ ] **Step 2: Make challenge input loop tolerate empty problems**

Keep existing loop; Play passes `problems: []`.

- [ ] **Step 3: Add wrappers**

```js
export async function listDir(path) {
  const { status, data } = await agent("ls", path);
  if (status !== 0) return null;
  const text = fromBase64(data);
  if (!text) return [];
  return text.split("\n").filter(Boolean).map((line) => {
    const [type, name] = line.split("\t");
    return { type: type === "d" ? "dir" : "file", name };
  });
}

export async function mkdir(path) {
  dirty = true;
  return (await agent("mkdir", path)).status === 0;
}

export async function rm(path) {
  dirty = true;
  return (await agent("rm", path)).status === 0;
}

export async function mv(from, to) {
  dirty = true;
  return (await agent("mv", from, to)).status === 0;
}
```

- [ ] **Step 4: Update Problems boot call site in `ui.js`**

Pass `saveKey: "vm:problems"` into `vm.boot({ ... })`.

- [ ] **Step 5: Commit**

```bash
git add public/vm.js public/ui.js
git commit -m "Parameterize VM saves and add directory agent wrappers."
```

---

### Task 4: Route split — `/play` redirect shell + `/problems` page

**Files:**
- Create: `public/problems.html` (copy of current `index.html` + nav link to `/play`)
- Create: `public/problems.js` (move body of `main.js`)
- Create: `public/play.html` (minimal shell: status, link to Problems, placeholder workspace — filled in Task 5–6)
- Create: `public/play.js` (boots play-ui stub that only sets status for now)
- Create: `public/play-ui.js` (stub `export async function startPlay(vm) { ... }` — terminal + boot with `saveKey: "vm:play"`, `session: "play"`, empty problems; enough that page loads)
- Modify: `src/main.rs` embed table + redirect
- Delete or stop serving: `public/index.html`, `public/main.js` (replace with problems/play entries)
- Modify: `public/ui.js` header — add `<a href="/play">Play</a>` in problems HTML only

**Interfaces:**
- Produces: GET `/` → 302/303 `Location: /play`; GET `/play`, `/problems` return HTML; Problems behavior unchanged aside from URL and nav link

- [ ] **Step 1: Move exercise HTML/JS to `/problems`**

- Copy `public/index.html` → `public/problems.html`
- Title can stay exercise-focused; in header add `<a href="/play">Play</a>` next to the title
- `public/problems.js`: same as current `main.js` importing `./ui.js`
- Remove embed of `/` → index and `/main.js`; embed `/problems` and `/problems.js`

- [ ] **Step 2: Add axum redirect and Play stubs**

In `main.rs`:

```rust
use axum::response::Redirect;
// ...
.route("/", any(|| async { Redirect::temporary("/play") }))
```

Embed:

```rust
"/play" => "public/play.html",
"/play.js" => "public/play.js",
"/play-ui.js" => "public/play-ui.js",
"/build-cmd.js" => "public/build-cmd.js",
"/problems" => "public/problems.html",
"/problems.js" => "public/problems.js",
// keep existing shared assets; remove "/" and "/main.js" if deleted
```

`play.html` minimal: status, nav to Problems, `#workspace` with `#terminal` (and empty `#tree`, `#editor-tabs`, `#editor`, toolbar stubs).

`play-ui.js` stub: init ghostty like `ui.js`, `vm.boot({ term, problems: [], inputs: {}, session: "play", saveKey: "vm:play", setStatus, onSave })`, expose `window.ngoding = { vm, term }`.

- [ ] **Step 3: Update server unit test for embeds**

In `src/main.rs` tests, assert `EMBEDDED.get("/problems")` and `EMBEDDED.get("/play")` instead of `EMBEDDED["/"]` if that assertion exists.

- [ ] **Step 4: Run `cargo test`**

Run: `cargo test`  
Expected: PASS

- [ ] **Step 5: Point e2e Problems URL (interim)**

In `test/e2e.mjs`, set `APP_URL` default to `http://localhost:8080/problems` so existing e2e still targets exercises after redirect. Full Play e2e comes in Task 8.

- [ ] **Step 6: Commit**

```bash
git add public/problems.html public/problems.js public/play.html public/play.js public/play-ui.js src/main.rs test/e2e.mjs
git rm -f public/index.html public/main.js   # if removed
git commit -m "Split routes: /play stub, /problems exercises, / redirects."
```

---

### Task 5: Language-from-path + path/tab editor API

**Files:**
- Modify: `public/languages.js`
- Modify: `public/editor.js`
- Test: extend unit tests or a small `test/languages.test.mjs`

**Interfaces:**
- Produces:
  - `languageFromPath(path: string): Language` — by extension; unknown → python (or a plain-text fallback: still python mode is OK per YAGNI)
  - Editor API additions on `createEditor(...)`:
    - `async openPath(path: string): Promise<boolean>` — read file; if null, status + return false (no stuck tab); if too large / binary, status + return false; else open/focus tab buffer
    - `closePath(path: string): void` — drop buffer; if current, switch to another open or empty
    - `getOpenPaths(): string[]`
    - `currentPath(): string | null`
    - Keep existing `open(problem)` for Problems

**Constants:** `MAX_EDITOR_BYTES = 1_048_576`

- [ ] **Step 1: Failing unit test for `languageFromPath`**

```js
// test/languages.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { languageFromPath } from "../public/languages.js";

it("maps .rs to rust", () => {
  assert.equal(languageFromPath("/home/user/a.rs").id, "rust");
});
it("maps .py to python", () => {
  assert.equal(languageFromPath("~/x.py").id, "python");
});
```

- [ ] **Step 2: Implement `languageFromPath`**

```js
export function languageFromPath(path) {
  const m = path.toLowerCase().match(/\.([^.\/]+)$/);
  const ext = m?.[1];
  return LANGUAGES.find((l) => l.ext === ext) ?? languageById(DEFAULT_LANG);
}
```

- [ ] **Step 3: Add `openPath` / `closePath` to `createEditor`**

Binary check: `text.slice(0, 8192).includes("\0")`.  
Size: `text.length > MAX_EDITOR_BYTES` (UTF-16 length ≈ ok for PoC; or `encoder.encode(text).length`).

For Play, `openPath` sets language via `languageFromPath(path)` for that buffer's `makeState` (per-file language, not global Problems language). Problems continues using global lang + `open(problem)`.

When implementing per-path language in the shared editor, store `language` on each `files` entry and use it in `makeState`. `setLanguage` on Problems still rewrites current problem path via `open(problem)`.

- [ ] **Step 4: Run unit tests**

Run: `npm run test:unit`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/languages.js public/editor.js test/languages.test.mjs
git commit -m "Add path-based editor open/close and languageFromPath."
```

---

### Task 6: File tree + Play IDE UI (tabs, Run, Build, Reset)

**Files:**
- Create: `public/file-tree.js`
- Modify: `public/play.html`, `public/play-ui.js`, `public/style.css`
- Modify: `src/main.rs` embed `/file-tree.js` if not already
- Consumes: `vm.listDir/mkdir/rm/mv/readFile/writeFile/type/save/reset/boot`, `createEditor`, `findBuild` / `resolveBuild`, `runCommand`, `languageFromPath`

**Interfaces:**
- Produces: `createFileTree({ root: "/home/user", mount, vm, onOpen(path), onStatus(msg) })` → `{ refresh(path?), }`
  - UI: expand/collapse dirs, click file → `onOpen`
  - Buttons or context actions: New file, New folder, Rename, Delete (confirm). After success, `refresh` parent.
- Play toolbar: Save, Run, Build, editable build command input, Vim, status, Reset, link to Problems
- Tabs bar: one button per `getOpenPaths()`, dirty mark, close button
- `localStorage` key `ngoding.play.build` for override string
- Build button: `resolveBuild` + `vm.type(\`cd ${dir} && ${command}\n\`)` with `dir` = detected dir or `/home/user`
- Disable Build when `source === "none"`
- Reset: confirm, `await vm.reset()`, reload
- `beforeunload` if `editor.hasUnsaved()`
- Expose `window.ngoding = { vm, term, editor, tree }` for e2e

- [ ] **Step 1: Implement `file-tree.js`**

Keep DOM simple: nested `<ul>` / `<li>`, `data-path` attributes. No cards. Match existing dark CSS variables from `style.css`.

New file flow: `prompt` for name → `vm.writeFile(parent + "/" + name, "")` → refresh → `onOpen`.  
New folder: `prompt` → `vm.mkdir`.  
Rename: `prompt` → `vm.mv`.  
Delete: `confirm` → `vm.rm` → notify Play UI to `editor.closePath` if open.

- [ ] **Step 2: Wire `play-ui.js` fully**

Layout in `play.html`:

```html
<body class="play">
  <aside id="sidebar">
    <header>… ngoding · Play · <a href="/problems">Problems</a> · status · Reset</header>
    <div id="tree-toolbar">… new file/folder …</div>
    <div id="tree"></div>
  </aside>
  <div id="workspace">
    <div id="toolbar">… Save Run Build [input] Vim …</div>
    <div id="editor-tabs"></div>
    <section id="editor"></section>
    <div id="split" …></div>
    <main id="terminal"></main>
  </div>
</body>
```

Reuse split/layout patterns from `ui.js` where cheap; Play can default to split only (no need to port all three layouts unless easy).

After boot: `tree.refresh()`, enable buttons.

When active path changes, recompute build: `findBuild(dirname(path), async (d) => (await vm.listDir(d))?.map(e => e.name) ?? [])`, then `resolveBuild({ override: input.value, detected })`, update Build disabled state and placeholder.

- [ ] **Step 3: CSS for tree + tabs**

Add `.play` layout: sidebar width ~220px, tree scroll, tabs row under toolbar. Do not invent a purple dashboard look; follow existing green/mono palette in `style.css`.

- [ ] **Step 4: Embed `file-tree.js` in `main.rs`**

- [ ] **Step 5: Commit**

```bash
git add public/file-tree.js public/play.html public/play-ui.js public/style.css src/main.rs
git commit -m "Add Play IDE: file tree, tabs, Run and Build."
```

---

### Task 7: Rebuild VM image

**Files:**
- Regenerated under `public/v86/` (not necessarily committed if gitignored — follow repo practice)

- [ ] **Step 1: Rebuild**

Run: `npm run build:image`  
Expected: completes; new `state-*.bin.zst` + `version.json`

- [ ] **Step 2: Confirm agent in image**

After boot in browser or via existing tooling, `ls` verb must work. If image artifacts are committed in this repo, commit them; if ignored, note in PR that operators must rebuild.

- [ ] **Step 3: Commit image outputs only if the repo tracks them**

```bash
# if tracked:
git add public/v86/version.json public/v86/state-*.bin.zst public/v86/fs.json
git commit -m "Rebuild VM image with new agent FS verbs."
```

---

### Task 8: E2E — Problems URL + Play coverage

**Files:**
- Modify: `test/e2e.mjs`
- Optionally: `test/e2e-play.mjs` if keeping problems file smaller — prefer one file with a clear Play section after Problems, or run Play first on fresh profile

**Interfaces:**
- Problems tests use `http://localhost:8080/problems`
- Play tests use `http://localhost:8080/play` (separate browser context so IndexedDB does not collide mid-suite)

- [ ] **Step 1: Keep Problems suite on `/problems`**

Already pointed in Task 4; verify Check/editor flows still pass.

- [ ] **Step 2: Add Play section (new context)**

```js
const play = await browser.newContext({ viewport: { width: 1400, height: 850 } });
const playPage = await play.newPage();
await playPage.goto("http://localhost:8080/play");
await playPage.waitForFunction(() => document.getElementById("status").textContent.startsWith("ready"), null, { timeout: 600_000 });

// tree lists home
await playPage.waitForFunction(() => window.ngoding?.tree);
const names = await playPage.evaluate(async () => {
  const entries = await window.ngoding.vm.listDir("/home/user");
  return entries?.map((e) => e.name) ?? null;
});
expect("play lists home", Array.isArray(names));

// create, open, save
await playPage.evaluate(async () => {
  await window.ngoding.vm.writeFile("/home/user/hello.py", "print(42)\n");
});
await playPage.evaluate(() => window.ngoding.tree.refresh());
await playPage.evaluate(() => window.ngoding.editor.openPath("/home/user/hello.py"));
await playPage.waitForFunction(() => window.ngoding.editor.currentPath() === "/home/user/hello.py");
// edit + save via editor API
await playPage.evaluate(async () => {
  const { editor } = window.ngoding;
  // set doc through CM if needed, or rewrite file and reopen
  await editor.save();
});
expect("play opens hello.py", (await playPage.evaluate(() => window.ngoding.editor.currentPath())) === "/home/user/hello.py");

// rename / delete via vm + closePath
await playPage.evaluate(async () => {
  await window.ngoding.vm.mv("/home/user/hello.py", "/home/user/hi.py");
  window.ngoding.editor.closePath("/home/user/hello.py");
  await window.ngoding.tree.refresh();
});
await playPage.evaluate(() => window.ngoding.editor.openPath("/home/user/hi.py"));
await playPage.evaluate(async () => {
  await window.ngoding.vm.rm("/home/user/hi.py");
  window.ngoding.editor.closePath("/home/user/hi.py");
});

// Run
await playPage.evaluate(async () => {
  await window.ngoding.vm.writeFile("/home/user/hi.py", "print('play-ok')\n");
  await window.ngoding.editor.openPath("/home/user/hi.py");
  await window.ngoding.editor.run();
});
await screenIncludesOn(playPage, "play-ok");

// Build: write Makefile + custom override
await playPage.evaluate(async () => {
  await window.ngoding.vm.writeFile("/home/user/Makefile", "all:\n\t@echo built-ok\n");
});
// trigger UI refresh of build detection, click Build or type via resolve
await playPage.locator("#build-cmd").fill(""); // clear override
await playPage.evaluate(async () => {
  const { findBuild, resolveBuild } = await import("/build-cmd.js");
  // or use UI button
});
await playPage.getByRole("button", { name: /^Build/ }).click();
await screenIncludesOn(playPage, "built-ok");

await playPage.locator("#build-cmd").fill("echo custom-build");
await playPage.getByRole("button", { name: /^Build/ }).click();
await screenIncludesOn(playPage, "custom-build");
```

Adapt helpers (`screenIncludesOn`) to take a page. Exact selectors must match `play.html` ids: `#build-cmd`, Build button label `Build`.

- [ ] **Step 3: Isolation check**

In Problems context, after Play reset in Play context, Problems still restores (or still has its save). Practical approach:

1. Problems context: boot, create a marker file via agent `writeFile("/home/user/problems-marker", "x")`, `vm.save()`, wait for save status.
2. Play context: boot, `vm.reset()` (play key only), reload play.
3. Problems context: reload `/problems`, expect restore and `readFile("/home/user/problems-marker") === "x"`.

If flake-prone, document as best-effort and assert IndexedDB keys differ via `page.evaluate` on `indexedDB` if easier.

- [ ] **Step 4: Run e2e**

Run: with server up, `npm run test:e2e`  
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add test/e2e.mjs
git commit -m "Cover /play IDE and keep problems e2e on /problems."
```

---

### Task 9: README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update docs**

Cover: `/` → `/play`; `/problems` for exercises; separate VM saves; Play tree/tabs/Build override; rebuild image for agent verbs; `npm run test:unit`.

Adjust architecture diagram blurb if it still says a single page.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Document Play vs Problems modes and separate saves."
```

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| `/` → `/play`, `/problems` exercises, nav links | 4, 6 |
| Separate `vm:play` / `vm:problems` + legacy migrate | 3 |
| Agent `ls`/`mkdir`/`rm`/`mv` | 2, 7 |
| Tree + tabs + Run + Build detect/override | 1, 5, 6 |
| Errors: missing/binary/large, tab close on delete | 5, 6 |
| E2E both modes + isolation | 8 |
| README | 9 |
| No Play grading APIs | 4, 6 |

## Self-review notes

- No TBD placeholders left in steps.
- `findBuild` walk must not escape `/home/user` — implement carefully in Task 1/6.
- `editor.openPath` vs Problems `open(problem)` share one CodeMirror view; tab state lives in the `files` Map.
- Image rebuild is a hard gate before Task 8 Play agent assertions.
