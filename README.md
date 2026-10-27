# ngoding — coding exercises in an in-browser Linux sandbox (PoC)

Students get a coding problem and a real Debian shell running **in their browser**.
They write and run Python in `~`, their program writes an answer file, and the page
reads that file out of the VM and grades it.

> **Branch `cheerpx`:** this branch adds a second VM, [CheerpX](https://cheerpx.io), for
> comparison. Switch VMs in the page header or with `/?vm=cheerpx`. See
> [CheerpX comparison](#cheerpx-comparison-this-branch) below. `main` is v86 only.

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
npm run build:image-cheerpx  # docker: public/disk/ngoding.ext2 (~1 GB) for /?vm=cheerpx
npm start             # http://localhost:8080
npm test              # checks the JS reference solvers against Python solutions
npm run test:e2e      # with the server running, for each VM: boots it in headless
                      # Chromium, solves both problems in the shell, grades them,
                      # runs uv, and checks that Ctrl-C works
npm run bench         # side-by-side timings of both VMs
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
- Serve over HTTPS outside localhost. v86 needs no special headers; CheerpX needs
  COOP/COEP (see `server.mjs`).

## CheerpX comparison (this branch)

CheerpX is the engine behind WebVM, made by Leaning Technologies. It JIT-compiles x86
to WebAssembly and **emulates Linux system calls instead of running a kernel**. Its
disk is a 1 GB ext2 image (`image-cheerpx/`), streamed with HTTP Range requests, with
writes kept in IndexedDB. `public/vm-cheerpx.js` implements the same
`boot`/`readFile`/`reset` interface as `public/vm.js`:

- Inputs are pushed into the VM through a `DataDevice`.
- Outputs are read by running `cat <file> > /files/submission` as root, where `/files`
  is an `IDBDevice` that JS reads with `readFileAsBlob`.

Measured with `npm run bench` (headless Chromium, fresh profile, same tasks):

| | CheerpX 1.4.0 | v86 0.5.472 | native |
|---|---|---|---|
| cold start to shell | ~1.3 s | ~1.2 s | |
| downloaded at start | 14 MiB | 18 MiB | |
| `python3 -c pass` | 0.6 s | 0.9 s | 0.006 s |
| `prime_sums.py` (a student solution) | 1.0 s | 1.3 s | |
| CPU loop, 2M squares | 1.3 s (~8×) | 3.2 s (~20×) | 0.16 s |
| `uv init` + `uv add rich` | 4.8 s | 6.8 s | |
| `uv run python -c 'import rich'` | 2.9 s | 1.2 s | |

| | CheerpX | v86 |
|---|---|---|
| License | proprietary; commercial use (a school, a paid course) needs a license | BSD-2, self-hostable |
| Linux | syscall emulation, no kernel | real Debian 6.1 kernel |
| Compatibility | needed the workarounds below | everything unmodified |
| Persistence | disk overlay in IndexedDB, so `~` survives reloads | none yet |
| Network | Tailscale | websocket relay |
| Server requirements | COOP/COEP, Range, ETag/Last-Modified | plain static files |

### CheerpX quirks worked around

| Symptom | Workaround |
| --- | --- |
| `python3` (3.11) hangs on CheerpX 1.2.8, the version in the quickstart docs | use CheerpX **1.4.0** |
| glibc `uv` aborts: *futex facility returned an unexpected error code* | ship the **musl** uv build |
| uv unpacks wheels into empty dirs → *Missing .dist-info directory* | uv's cache is **pre-extracted at image build time**; `uv init` defaults to `--no-package` via a wrapper (`image-cheerpx/uv-wrapper.sh`) so there is no project wheel to unpack. Packages outside the warm cache, and `uv init --package`, still hit this; `pip` in a venv works for them. |
| `cp` from a `DataDevice` hangs on larger files | inputs are copied with `cat >` |
| `HttpBytesDevice` refuses servers without `ETag`/`Last-Modified` | `server.mjs` sends both |
