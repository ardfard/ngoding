# ngoding — coding exercises in an in-browser Linux sandbox (PoC)

Students get a coding problem and a real Debian shell running **in their browser**.
They write and run Python in `~`, their program writes an answer file, and the page
reads that file out of the VM and grades it.

The VM is [v86](https://github.com/copy/v86), a BSD-licensed emulator of a full x86 PC
that JIT-compiles to WebAssembly. It runs a real Debian kernel. The root filesystem is
served over 9p, one file at a time over HTTP, and the browser resumes from a memory
snapshot taken after boot, so students never wait for Linux to start.

**All compute happens in the student's browser.** The server only serves static files
and does two cheap JSON calls: starting a session and grading a submitted output file.

```
┌──────────── browser tab ──────────────────────────────────────────────────┐
│ ui.js: problems, [Check]           │  xterm.js ⇄ serial port 1 (ttyS0)     │
│                                    │                                       │
│ vm.js: boot / readFile / save  ────┼─► serial port 2 ⇄ root agent in the   │
│   save → IndexedDB snapshot        │   guest: write inputs, read outputs   │
│ v86 (wasm) ── 9p root fs ── fetches /v86/flat/<hash>.bin.zst on demand     │
└──────────────┬────────────────────────────────────────────────────────────┘
               │ POST /api/session → token, problems, inputs
               │ POST /api/grade   {token, problemId, output} → ok / message
┌──────────────┴──────────────── server.mjs ────────────────────────────────┐
│ static files (cached) + lib/problems.js (solvers) + lib/session.js (HMAC)  │
└───────────────────────────────────────────────────────────────────────────┘
```

## Run it

```sh
npm install
npm run build:image   # docker + node: public/v86/{fs.json,flat/,state-<hash>.bin.zst} (~300 MB)
npm start             # http://localhost:8080
npm test              # checks the JS reference solvers against Python solutions
npm run test:e2e      # with the server running: boots the VM in headless Chromium,
                      # solves both problems in the shell, grades them, runs uv,
                      # checks Ctrl-C, server-side grading, saving + restoring work,
                      # and that a reload is served from cache
```

Starting a shell takes about 1 s and downloads about 18 MiB (mostly the snapshot).
Files are then fetched as they're used: ~22 MiB after the first `python3`, ~78 MiB after
`uv add` (uv itself is ~50 MB). CPU-bound Python runs about 20× slower than native,
which is fine for exercises.

## Server load and caching

The server does no emulation and no student code execution. Per student it serves
static files and answers a couple of tiny JSON requests, so a cheap static host or a CDN
in front of `server.mjs` handles a whole class.

- Files under `/v86/flat/` are named by content hash, and the snapshot is
  `state-<hash>.bin.zst`. Both are served with `Cache-Control: immutable` (one year).
  `version.json` points at the current snapshot and is always revalidated.
- Everything else gets an `ETag` and `no-cache`, so unchanged files cost a 304.
- A returning student downloads about 17 KiB.

## What's in the VM

i386 Debian bookworm with a 6.1 kernel, `python3` 3.11, `pip`, `venv`, `numpy`,
**`uv`**, `git`, `nano`, `vim`, `sudo` (passwordless), and user `user`.

The VM has **no network** by default. So that the package-manager workflow still works,
`/opt/wheels` contains a few wheels (`rich`, `requests`, `pytest`, `tabulate`), and
`uv`/`pip` are configured to install from that directory offline:

```sh
uv init demo && cd demo && uv add rich && uv run python -c "import rich; rich.print('[green]hi')"
```

Add more packages on the `pip download` line in `image/Dockerfile`. Internet access is
possible through v86's websocket relay (the `network_relay_url` option), but it isn't
enabled.

## How the image is built (`image/`)

- `Dockerfile` builds i386 Debian with `linux-image-686`, and an initramfs that mounts
  the root filesystem from 9p. v86's `tools/fs2json.py` and `copy-to-sha256.py`
  (vendored in `image/tools/`) turn it into a file index plus content-addressed,
  zstd-compressed files. The result is exported as a single tar, because Docker's
  local exporter hangs on tens of thousands of files.
- `init.sh` is PID 1 (under `tini`) instead of systemd. It mounts the usual
  filesystems, starts the agent, and autologs `user` in on `ttyS0`. agetty runs under
  `setsid` so the shell gets a controlling terminal; without it, Ctrl-C doesn't work.
- `build-state.mjs` boots the image in Node (~15 s), waits for the shell, and saves a
  memory snapshot (45 MiB → 15 MiB zstd) as `state-<hash>.bin.zst`, plus
  `version.json`. The memory size is shared with the browser via
  `public/v86-config.js`, because a snapshot only restores into a VM with the same
  memory size.
- `agent.sh` runs as root on the second serial port and accepts a fixed set of verbs:
  - `write`: push a challenge input file
  - `read`: fetch an output file for grading
  - `resize`: match the tty to xterm.js
  - `init`: set the clock and add fresh entropy, since every visitor restores the
    same snapshot

## How grading works

- `POST /api/session` gives each browser a token of the form `<seed>.<HMAC>`, kept in
  `localStorage`. Every problem generates its input from the seed, so students can't
  share answers. The token is signed, so they can't pick someone else's seed. The
  server stores nothing: it regenerates inputs and expected answers from the seed.
- The browser receives the problem text and its inputs, which are written to
  `~/challenge/<problem>/input.txt` through the agent. The reference solvers live in
  `lib/problems.js` and are never served.
- **Check** reads the output file through the agent and posts it to `/api/grade`. The
  server compares it line by line with the expected output, ignoring trailing
  whitespace, and returns only pass/fail and a hint about the first wrong line.
- The signing secret comes from `NGODING_SECRET`, or `.ngoding-secret`, which is
  created on first start. Keep it stable, or every token becomes invalid.

Add a problem by appending to `PROBLEMS` in `lib/problems.js` (`generate(rng)` and
`solve(input)`), then add a Python solution and a test case under `test/`.

## Saving work

The whole VM is saved to IndexedDB: memory plus every file the student changed, which
v86 keeps in its 9p filesystem state. The browser's `CompressionStream` gzips it. A
reload resumes exactly where the student was, including running programs, in about
0.6 s.

- **When it saves:** after every Check, every minute if there was terminal input, and
  when the tab is hidden.
- **Size:** 16 MiB for a fresh session, about 40 MiB after `uv add` and some Python
  work. A save takes 1–3 s.
- **When a save is discarded:** if the image is rebuilt (the snapshot name changes) or
  the session changes (**Reset**), so restored work always matches the student's inputs.

## Limits and next steps for production

- **Work lives in one browser.** Clearing site data or switching devices loses it.
  Uploading the gzipped snapshot to object storage would fix that, at ~15–40 MB per
  student.
- **Grading checks output, not code.** A student could compute the answer some other
  way, for example by hand. If that matters, also submit the `.py` files and re-run
  them server-side on hidden inputs in a native sandbox.
- **Progress isn't recorded centrally.** The "solved" ticks are in `localStorage`. For a
  real course, `/api/grade` should record results per student, which needs a login.
- Serve over HTTPS outside localhost. Any static file host works; no special headers
  are needed.
