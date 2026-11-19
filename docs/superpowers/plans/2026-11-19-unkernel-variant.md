# ngoding on unkernel (/新) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve a second copy of ngoding at `/新` whose VM is unkernel booting a Debian trixie riscv64 ext4 disk, not v86.

**Architecture:** The pages stay the same. The server maps `/新/<file>` to the same embedded files, rewrites absolute links in the HTML, and swaps `/新/vm.js` for `public/vm-unkernel.js`, which has the same exports as `vm.js` and is built on the unkernel SDK (`openHttpDisk` + `createKernel` + `spawn`/`exec` via kwtty). The disk comes from `image-unkernel/` (Docker riscv64 build → `mke2fs -d`) and is served with HTTP Range.

**Tech Stack:** Rust/axum (server), vanilla ES modules (frontend), unkernel 0.1 npm SDK, Docker buildx + qemu binfmt (riscv64), e2fsprogs, Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-11-19-unkernel-variant-design.md`

## Global Constraints

- The v86 app at `/` keeps working unchanged (its e2e must still pass).
- `/新` uses separate local state: play-session list key `ngoding.新.play.sessions`, VM save keys prefixed `unk:`.
- Cloud (accounts, cloud save, shares) is disabled under `/新`.
- No guest network.
- Kernel cmdline: `console=hvc0 root=/dev/wda rw init=/sbin/ngoding-init`, `initrd: null`.
- Commits: jj, one per task, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; keep `docs/research/` out.

## Findings from the risk checks (done before this plan)

- `kwtty` is extracted from the SDK's bundled Alpine with `node --experimental-wasm-jspi image-unkernel/extract-kwtty.mjs` (static riscv64 musl, 56 KB).
- A minimal trixie disk with `image-unkernel/init.sh` boots under Node: `exec` answers 167 ms after start, and `spawn("/bin/su", ["-l","user"])` gives a login shell on `/dev/pts/0` (`image-unkernel/boot-check.mjs`).
- SDK browser entry `dist/web.mjs` imports `./_chunks/core.mjs` and loads `./unkernel-alpine.wasm` next to itself; `openHttpDisk(url, { name })` persists the overlay in IndexedDB and drops it if the image changes; `resetHttpDisk(name)`.

---

### Task 1: Image pipeline

**Files:**
- Create: `image-unkernel/{Dockerfile,init.sh,profile.sh,extract-kwtty.mjs,boot-check.mjs,build.sh}`
- Modify: `package.json` (script `build:image:unkernel`), `.gitignore` (`image-unkernel/build/`, `public/unkernel-image/`)

**Produces:** `public/unkernel-image/debian-<16 hex>.ext4` and `public/unkernel-image/version.json` = `{"disk":"debian-<hex>.ext4"}`.

- [ ] `build.sh`: run extract-kwtty if `build/kwtty` is missing → `docker build --output type=local,dest=$tmp` → `sha256sum` of the image, first 16 hex characters → move to `public/unkernel-image/debian-$hash.ext4` → write `version.json` → remove older `debian-*.ext4` unless `KEEP_OLD=1`.
- [ ] Full build, then `node --experimental-wasm-jspi image-unkernel/boot-check.mjs <disk> 'gcc --version | head -1; go version; rustc --version; ghc --version; python3 -c "import numpy; print(numpy.__version__)"; uv --version; node --version; tsc --version'`. Expected: every tool prints a version.
- [ ] Commit `Add the Debian riscv64 disk image for unkernel.`

### Task 2: Server routes for /新, the SDK and the image

**Files:** Modify `src/main.rs`.

**Produces:** the URLs `/新/…`, `/unkernel/web.mjs`, `/unkernel/_chunks/core.mjs`, `/unkernel/unkernel-alpine.wasm`, and `/unkernel-image/*` (Range).

- [ ] Tests first (in `mod tests`):
  - `unkernel_alias("/新/vm.js") == Some("/vm-unkernel.js")`, `("/新/play.js") == Some("/play.js")`, `("/新/") == Some("/")`, `("/新/play") == Some("/play")`, `("/新/v86/version.json") == None`, `("/新/api/session") == None`.
  - `rewrite_html(r#"<script src="/play.js"></script><a href="/">x</a><a href="/learn">l</a><link href="/style.css"><link href="/fonts/a.woff2">"#)` gives `/新/play.js`, `/新/`, `/新/learn`, and leaves `/style.css` and `/fonts/…` unchanged.
  - `parse_range("bytes=0-0", 10) == Some((0,0))`, `("bytes=5-", 10) == Some((5,9))`, `("bytes=-3", 10) == Some((7,9))`, `("bytes=10-", 10) == None`, `("bytes=0-1,4-5", 10) == None`.
  - `is_immutable("/unkernel-image/debian-0123456789abcdef.ext4")` is true and `is_immutable("/unkernel-image/version.json")` is false.
- [ ] Implement:
  - `const UNK: &str = "/新";`.
  - `unkernel_alias(decoded_path)`: strip the prefix; `""` and `"/"` → `"/"`; `"/vm.js"` → `"/vm-unkernel.js"`; refuse `/v86/`, `/api/`, `/unkernel`; return `Some(rest)` only if `EMBEDDED` has `rest`.
  - Add `"/vm-unkernel.js" => "public/vm-unkernel.js"`, `"/base.js" => "public/base.js"` and the three SDK files to `APP`.
  - `rewrite_html`: replace `="/` with `="/新/` unless followed by `style.css`, `fonts/`, `vendor/`, `api/` or `unkernel`. Cache rewritten HTML in a `LazyLock<HashMap>` with its own ETag (prefix `u`).
  - `static_file`: percent-decode the path first; `/新` exactly → 308 to `/新/`; alias hit → embedded body (rewritten if `.html`); `/unkernel-image/` → files from `unk_image_dir` (`NGODING_UNKERNEL_IMAGE_DIR`, default `public/unkernel-image`), with `Accept-Ranges: bytes` and a `Range` → 206 + `Content-Range` (416 if unsatisfiable), streaming with `take(len)` after `seek`.
- [ ] `cargo test` passes; `curl -sI -H 'Range: bytes=0-0' localhost:8080/unkernel-image/version.json` → 206.
- [ ] Commit `Serve the app under /新 with unkernel's VM module.`

### Task 3: Frontend base path and state isolation

**Files:** Create `public/base.js`, `test/base.test.mjs`; modify `public/play-sessions.js`, `public/cloud-api.js`, `public/home.js`, `public/play-ui.js`, `public/ui.js`, `public/learn-ui.js`.

**Produces:** `base.js` exports `UNK_PREFIX = "/新"`, `basePath(pathname = location.pathname)` → `"/新"` or `""`, `IS_UNKERNEL` (boolean, from `location.pathname`, false when `location` is undefined), `appHref(path)` → `basePath() + path`, `homeHref()` → `appHref("/")`.

- [ ] Test: `basePath("/新/play") === "/新"`; `basePath("/%E6%96%B0/play") === "/新"`; `basePath("/play") === ""`; `basePath("/新x") === ""`.
- [ ] `play-sessions.js`: `SESSIONS_KEY` = `IS_UNKERNEL ? "ngoding.新.play.sessions" : "ngoding.play.sessions"`; `playSaveKey(id)` = `${IS_UNKERNEL ? "unk:" : ""}vm:play:${id}`.
- [ ] `cloud-api.js`: `authMe()` and `accountsAvailable()` return null/false when `IS_UNKERNEL`.
- [ ] `home.js`: `/play?s=` → `appHref("/play?s=…")`; deleting a session under `/新` also calls the VM's `resetDisk(key)`, through a dynamic `import("./vm.js")` only when `IS_UNKERNEL`.
- [ ] `play-ui.js`, `ui.js`, `learn-ui.js`: `location.replace("/")` → `location.replace(homeHref())`; `a[href="/"]` → ``a[href="${homeHref()}"]``; the share button is hidden when `IS_UNKERNEL`.
- [ ] Learn and Exercise save keys: `ctx.saveKey` stays `vm:learn` / `vm:exercise`; vm-unkernel adds `unk:` itself (the play key already has it, so it adds the prefix only if missing).
- [ ] `npm run test:unit` passes. Commit `Keep /新 state and links apart from the v86 app.`

### Task 4: vm-unkernel.js

**Files:** Create `public/vm-unkernel.js`, `public/vm-shared.js`, `test/vm-shared.test.mjs`; modify `public/vm.js` (import the shared parser).

**Produces:** the exports of `vm.js`, plus `resetDisk(key)`. `vm-shared.js` exports `parseLs(text) → [{type:"dir"|"file", name}]` (moved from `vm.js`), `unkKey(saveKey)` (adds `unk:` once), `LS_SCRIPT` (the find invocation that prints `d\tname` / `f\tname`).

- [ ] Tests: `parseLs("d\tsrc\nf\ta.c\n")` → two entries; `parseLs("")` → `[]`; `unkKey("vm:learn") === "unk:vm:learn"`; `unkKey("unk:vm:play:x") === "unk:vm:play:x"`.
- [ ] Implement `boot(ctx)`:
  1. `checkSupport()`; if not ok, throw `Error("This browser can't run the unkernel VM: " + problems.join("; "))`.
  2. `{disk} = await (await fetch("/unkernel-image/version.json", {cache:"no-cache"})).json()`.
  3. `key = unkKey(ctx.saveKey)`; `meta = await store.get(key + ":meta")` (`{disk, savedAt}`); if `meta && meta.disk !== disk`, write the reset notice, `resetHttpDisk(key)`, and set meta to null.
  4. `diskDev = await openHttpDisk("/unkernel-image/" + disk, { name: key, onError })`.
  5. `kernel = await createKernel({ kernel: "/unkernel/unkernel-alpine.wasm", initrd: null, disks:[diskDev], cmdline, memoryMiB: 1024 })`.
  6. `exec("/bin/sh", ["-c", "date -s @$1 >/dev/null; base64 -d > /dev/urandom", "_", String(epoch)], { input: entropyB64 })`.
  7. Fresh disk with problems: write inputs via `writeFile`.
  8. `pty = await kernel.spawn("/bin/su", ["-l", "user"], { cols: term.cols, rows: term.rows })`; pump `pty.output` → `term.write` batched per frame; `term.onData` → `markDirty(); pty.write(s)`; `term.onResize` → `pty.resize(cols, rows)`; when `pty.ended` settles, spawn again.
  9. `kernel.exited` → `setStatus("VM stopped: " + reason)`.
  10. Return `{ restored: meta?.savedAt ?? null }`.
- [ ] `save()`: `await kernel.sync()`; `store.put(key + ":meta", { disk, savedAt })`; same `onPersist` phases, debounce, autosave and pagehide flush as `vm.js`.
- [ ] File ops through `kernel.exec` (root, argv only):
  - read: `["base64","-w0","--",path]`, decoded.
  - write: `["sh","-c",'mkdir -p "$(dirname "$1")" && base64 -d > "$1" && chown user:user "$1" "$(dirname "$1")"',"_",path]` with `input` = base64.
  - ls: `["sh","-c",LS_SCRIPT,"_",path]` → `parseLs`.
  - mkdir: `mkdir -p` then `chown user:user`.
  - rm: `rm -rf --`.
  - mv: `mv --` then `chown -R`.
  Return `exitCode === 0`.
- [ ] `type(text)` → `pty.write`. `reset()` → `resetHttpDisk(key)` + delete meta. `resetDisk(k)` → same for `unkKey(k)`.
- [ ] `npm run test:unit` passes. Commit `Add the unkernel VM module.`

### Task 5: End-to-end check and latency

**Files:** Create `test/e2e-unkernel.mjs`; modify `package.json` (`test:e2e:unkernel`).

- [ ] Script (Playwright Chromium, server on :8080), using the `window.ngoding` hooks as `test/e2e.mjs` does:
  1. Open `/新/`, start a playground, wait for the `user@ngoding` prompt.
  2. `sh("echo hi")`.
  3. Write `main.c` with `vm.writeFile`, `gcc main.c -o m && ./m` prints the expected output.
  4. `python3 -c` prints, `go run`, `rustc`, `runghc` each print (log the timings).
  5. `vm.save()`, reload, the file is still there (`vm.readFile`).
  6. `/新/exercise`: run the first problem's reference command, Check → solved.
  7. `/新/learn` boots.
  8. Open `/play` (v86) and confirm `window.ngoding.vm` uses v86 (the `/v86/version.json` request was made).
- [ ] Run it; record first-run timings in the README section (Task 6). If a step fails, fix the cause.
- [ ] Also run the existing `npm run test:e2e` to confirm the v86 app is unchanged.
- [ ] Commit `Test the /新 app end to end.`

### Task 6: Docs

- [ ] README: a section "`/新`: the same app on unkernel" covering how it differs, `npm run build:image:unkernel`, `NGODING_UNKERNEL_IMAGE_DIR`, the browser requirement (JSPI) and the measured timings.
- [ ] Deploy notes: copy `public/unkernel-image/` next to the v86 image.
- [ ] Commit `Document the /新 unkernel app.`
