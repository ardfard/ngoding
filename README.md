# ngoding — coding exercises in an in-browser Linux sandbox (PoC)

Students get a coding problem and a real Debian shell running **in their browser**.
They write and run Python in `~`, their program writes an answer file, and the page
reads that file out of the VM and grades it.

The VM is [v86](https://github.com/copy/v86), a BSD-licensed emulator of a full x86 PC
that JIT-compiles to WebAssembly. It runs a real Debian kernel. The root filesystem is
served over 9p, one file at a time over HTTP, and the browser resumes from a memory
snapshot taken after boot, so students never wait for Linux to start.

```
┌──────────── browser tab ──────────────────────────────────────────────────┐
│ ui.js: problems, [Check], grade()  │  xterm.js ⇄ serial port 1 (ttyS0)     │
│                                    │                                       │
│ vm.js: boot / readFile  ───────────┼─► serial port 2 ⇄ root agent in the   │
│                                    │   guest: write inputs, read outputs   │
│ v86 (wasm) ── 9p root fs ── fetches /v86/flat/<hash>.bin.zst on demand     │
└───────────────────────────────────────────────────────────────────────────┘
```

## Run it

```sh
npm install
npm run build:image   # docker + node: public/v86/{fs.json,flat/,state.bin.zst} (~300 MB)
npm start             # http://localhost:8080
npm test              # checks the JS reference solvers against Python solutions
npm run test:e2e      # with the server running: boots the VM in headless Chromium,
                      # solves both problems in the shell, grades them, runs uv,
                      # and checks that Ctrl-C works
```

Starting a shell takes about 1 s and downloads about 18 MiB (mostly the snapshot).
Files are then fetched as they're used. CPU-bound Python runs about 20× slower than
native, which is fine for exercises.

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
  memory snapshot (45 MiB → 15 MiB zstd). The memory size is shared with the browser
  via `public/v86-config.js`, because a snapshot only restores into a VM with the same
  memory size.
- `agent.sh` runs as root on the second serial port and accepts a fixed set of verbs:
  - `write`: push a challenge input file
  - `read`: fetch an output file for grading
  - `resize`: match the tty to xterm.js
  - `init`: set the clock and add fresh entropy, since every visitor restores the
    same snapshot

## How grading works

- Each browser gets a random seed (stored in `localStorage`). Every problem generates its
  input from that seed, so students can't share answers.
- On start, the inputs are written to `~/challenge/<problem>/input.txt` through the agent.
- **Check** reads the output file through the agent and compares it line by line with
  the reference solver's output, ignoring trailing whitespace.

Add a problem by appending to `PROBLEMS` in `public/problems.js` (`generate(rng)` and
`solve(input)`), then add a Python solution and a test case under `test/`.

## Limits and next steps for production

- **Persistence:** none yet. A reload restarts from the snapshot, so the student's files
  are lost. The simplest fix is to `save_state()` into IndexedDB (~15 MB compressed) on
  Check and every minute or so, then restore from it on the next visit.
- **Trust:** grading runs client-side, so the expected answer is visible in devtools.
  For real assessments, send the submission (and maybe the student's `.py` files) to a
  server that keeps the seed and the solver. Alternatively, have the server re-run the
  student's code on hidden inputs in a native sandbox.
- Serve over HTTPS outside localhost. Any static file host works; no special headers
  are needed.
