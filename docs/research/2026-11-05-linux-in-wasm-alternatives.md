# Linux in WebAssembly: alternatives to v86

Date: 2026-11-05. Status: research only, no code changes.

## Question

Is there anything that should replace v86 as the in-browser Linux for ngoding,
and if so, when and how hard would the switch be?

## What the current setup depends on

v86 is used narrowly, which keeps a swap cheap. Everything lives in
`public/vm.js`, `public/v86-config.js`, `image/Dockerfile`, `image/build.sh` and
`image/build-state.mjs`. The emulator API surface we touch is:

| Need | How v86 provides it today |
|---|---|
| Real Debian userland: gcc/g++, Go, rustc, GHC, Python + numpy, uv, git, nvim | i386 Debian bookworm, unmodified packages |
| Lazy root filesystem (761 MB of files, most never read) | 9p over virtio, `fs.json` + `flat/<sha>.bin.zst` fetched per file |
| Instant start | `save_state` after boot (`state-<hash>.bin.zst`, 16 MB), resumed with `initial_state` |
| Student work survives reloads | whole-VM `save_state` → gzip → IndexedDB (`vm:play:<id>`, `vm:exercise`) |
| Terminal | `ttyS0` ⇄ ghostty-web via `serial_send_bytes` / `serial0-output-byte` |
| File tree, run, grade I/O | line protocol to `image/agent.sh` on `ttyS1` |
| No server compute | all of the above is static files |

So any replacement needs: unmodified Linux toolchains (Go, rustc and GHC rule out
"recompile everything to Wasm"), lazy file loading, persistence, and a second
channel for the agent. Memory snapshots are nice to have, but only needed if
booting is slow.

### Known pain points with v86

- **32-bit only.** No long mode upstream (latest release 2026-09-14 still has
  none). Go, Rust and GHC on i386 are second-class and some crates/wheels lack
  i686 builds.
- **The i386 Debian line is ending.** Debian 13 (trixie) ships no i386 kernel or
  installer. Bookworm LTS, which we build on, ends **2028-06-30**. That date is
  the real deadline for this decision.
- **Single core, ~512 MB RAM** (`MEMORY_SIZE`); heavy compiles (rustc, ghc) are slow.
- Snapshots are 50–200 MB raw, so saving is expensive (hence the debounce in `vm.js`).
- 9p performance has an open upstream issue (copy/v86#1451).

## Alternatives

### 1. CheerpX / WebVM (Leaning Technologies)

x86 → Wasm JIT plus a Linux **syscall** emulator (no guest kernel). Block-level
ext2 disks streamed with HTTP range requests (`HttpBytesDevice`), with an
`OverlayDevice` over an `IDBDevice` for local writes. Processes are started from
JS with `cx.run(path, args, opts)`; the terminal is hooked with `setCustomConsole`.

- **Speed:** claims 2–3× native on well-optimised code, 5–10× on complex apps,
  and "much better" than v86 (no published numbers). It is likely the fastest
  option here.
- **Arch:** **32-bit x86 only**, same as v86. 64-bit is on the roadmap with no date.
- **License:** proprietary. Free for individuals and open-source projects; any
  organisational use needs a commercial licence, and self-hosting the CheerpX
  build is not allowed without one. That conflicts with how ngoding ships today
  (one binary that serves everything from our own origin).
- **Fit:** good. The ext2 + overlay model replaces 9p + whole-VM snapshots, and
  `cx.run` could replace `agent.sh`. We would lose memory snapshots: a reload
  restarts the shell, though files persist.
- **Verdict:** technically attractive, but blocked by the licence and it doesn't
  fix the 32-bit problem. Revisit if it gains x86-64 and we accept the licence.

### 2. QEMU compiled to Wasm (qemu-wasm / container2wasm)

ktock's QEMU fork adds a TCG backend that emits Wasm modules for hot blocks
(hot after about 1000–1500 runs; everything else runs in the TCI interpreter),
with multi-threaded TCG. Guests: **x86_64, aarch64, riscv64**. container2wasm
(CNCF Sandbox) uses it from v0.8 for its browser target (`--to-js`) and turns any
Docker image into a browser bundle.

- **Speed:** below v86 on 32-bit workloads; the JIT is newer and more
  conservative. A community fork measured TCI at ~33 M guest instr/s, with the
  JIT about 1.75× faster than that. v86's JIT is a few hundred MIPS. Expect it to
  be noticeably slower for gcc/rustc, but multiple vCPUs partly make up for it.
- **Upstream:** Emscripten builds landed in QEMU 10.1 and TCI for 32-bit guests
  is merged. TCI for 64-bit guests and the Wasm TCG JIT were still patches under
  review at last check.
- **Requirements:** threads → `SharedArrayBuffer` → COOP/COEP headers on every
  page (easy for us, since we serve everything). Up to ~2.3 GB of Wasm memory.
- **Fit:** good. It is a real kernel with virtio-9p (`--enable-virtfs`), serial
  ports and QEMU migration for snapshots, so `agent.sh`, the 9p initramfs and the
  ghostty wiring carry over almost unchanged. The Dockerfile could switch to
  `debian:trixie` amd64 and drop the i386 workarounds.
- **License:** GPL-2.0 (QEMU). We already serve it unmodified, so it's fine,
  but we'd have to publish the source of whatever fork we ship.
- **Verdict:** **the most credible long-term replacement**, because it is the only
  open, maintained path to 64-bit Debian. Not yet: speed and upstream status
  need to mature. Worth a timeboxed spike (see below).

### 3. v86 64-bit forks (portlandhodl/v86_64, debugdoctor/v64)

Forks that add long mode, 64-bit page tables and a 64-bit JIT. v86_64 reports
~550–590 MIPS on its 64-bit bench after JIT work in Oct 2026.

- **Fit:** best possible, since it is the same API (`save_state`, 9p, serial) and
  would be a near drop-in.
- **Risk:** young, single-maintainer forks, not merged upstream; v64 says
  32-bit support isn't re-verified.
- **Verdict:** watch. If either is merged upstream or stabilises, it beats
  every other option on migration cost.

### 4. JSLinux / TinyEMU (Fabrice Bellard)

JSLinux gained x86_64 (plus AVX-512 and APX) around March 2026.

- **Blocker:** the x86/x86_64 emulator source isn't published. Only the old
  RISC-V TinyEMU (2019) is open. It is an interpreter, not a JIT.
- **Verdict:** not usable as a dependency.

### 5. Bochs-to-Wasm (container2wasm's older backend)

Open source and x86_64, but an interpreter, so it is several times slower than
v86. Apptron's author (who uses v86) says Bochs-class 64-bit emulation isn't
fast enough to be useful for most work. **Verdict:** no.

### 6. Wasm-native Linux kernel (Joel Severin's linux-wasm, Nov 2025)

See [2026-11-05-native-wasm-linux.md](2026-11-05-native-wasm-linux.md) for a
deeper look, including tombl's Lowland, which is further along than the summary
below.

Linux ported to a `wasm` architecture, with userspace compiled to Wasm
(musl + BusyBox). It boots in under 1s, but the author calls it an unstable
proof of concept. **Every program must be recompiled to Wasm**: no gcc, Go
toolchain, rustc or GHC. **Verdict:** interesting, irrelevant for years.

### 7. BrowserPod (Leaning Technologies)

A Wasm-native "Linux-like" kernel (shares syscall code with CheerpX). Programs
are compiled to `wasm32-browserpod-linux`. Node.js and Rust are supported, and
bash, git and curl were added in 2.0. Python is in preview; Go and Ruby are
promised for "2026". CheerpX-backed x86 binaries were on the roadmap for Nov 2026.

- **Gaps:** no gcc/rustc/GHC toolchains running *inside* the sandbox, so it can't
  run "compile your C/Rust/Haskell here". There is a paid tier, and the free tier
  only allows network access to whitelisted domains.
- **Verdict:** wrong shape for a polyglot compile-and-run sandbox.

### 8. Wasmer JS SDK (WASIX)

Runs WASIX packages (python, clang ≈ 100 MB, php, …) in the browser with a
terminal API. Not a Linux: each tool must exist as a WASIX package. There's no
Go/rustc/GHC/apt, and the filesystem is per-sandbox.

- **Verdict:** could back a lightweight "Python/C only" fast path, but can't
  replace the VM.

### 9. Wanix / Apptron (tractordev)

A Plan 9-style browser runtime whose `<wanix-vm>` uses **v86** to boot Alpine.
It doesn't replace v86; it is a neighbour project. It is useful as a reference
for Alpine-on-v86 (a 32-bit distro with a future past 2028) and for running Wasm
binaries inside the guest via binfmt_misc.

## Comparison

| Option | Arch | Runs unmodified Debian toolchains | Speed vs v86 | Snapshot / persistence | License | Maturity | Migration cost |
|---|---|---|---|---|---|---|---|
| **v86 (current)** | i386 | yes (bookworm until 2028-06) | baseline | full VM state | BSD-2 | stable | — |
| v86 64-bit forks | i386 + x86_64 | yes, incl. trixie amd64 | ≈ same | full VM state | BSD-2 | experimental | **low** |
| qemu-wasm / c2w | x86_64, arm64, rv64 | yes | slower, SMP | QEMU migration | GPL-2 | experimental, upstreaming | medium |
| CheerpX / WebVM | i386 | yes (32-bit) | faster | disk overlay only | proprietary | stable | medium–high |
| JSLinux x86_64 | x86_64 | yes | slower | — | closed | demo | n/a |
| Bochs-wasm | x86_64 | yes | much slower | — | LGPL | stable | medium |
| linux-wasm | wasm | no | — | — | GPL-2 | PoC | n/a |
| BrowserPod | wasm | no (no gcc/go/ghc) | fast for supported | disk | proprietary/paid | early | high |
| Wasmer WASIX | wasm | no (per-package) | fast for supported | per sandbox | MIT | stable | high, partial |

## Recommendation

1. **Keep v86 for now.** Nothing available today is both open and better on
   our workloads.
2. **Plan around 2028-06-30 (bookworm LTS end).** Before then, pick one of:
   - **a. v86 + 64-bit** if a long-mode fork stabilises or merges upstream,
     which is the cheapest move;
   - **b. qemu-wasm x86_64** if its JIT lands in upstream QEMU and performance
     is acceptable;
   - **c. stay 32-bit on Alpine x86** (as Apptron does) as a fallback, if
     Alpine still ships x86 then. Check this before relying on it.
3. **Spike qemu-wasm now (timeboxed, ~2 days)** to get real numbers rather
   than relying on claims: build our Dockerfile as `linux/amd64`, boot it in
   qemu-wasm with virtio-9p, and time `gcc hello.c`, `go build`,
   `cargo build` (small crate), `ghc Main.hs` and `python -c 'import numpy'`
   against v86. Also measure the snapshot size and resume time. Keep the agent
   protocol and ghostty wiring unchanged so only `vm.js`'s V86 block changes.
4. **Do not adopt CheerpX/BrowserPod** unless we decide to buy a licence; they
   also don't fix the 32-bit problem.
5. Cheap v86 wins in the meantime: try the `virtio-v86fs` / growable-memory
   work in aperturerobotics/v86 for the 9p and RAM limits, and follow
   copy/v86#1451.

### What a swap would touch

- `public/vm.js`: the `new V86({...})` block, serial listeners and `save_state`.
  The agent protocol, persistence keys and terminal batching stay.
- `public/v86-config.js`, `image/build-state.mjs`: emulator-specific config and
  snapshot builder.
- `image/Dockerfile`: platform (`linux/386` → `linux/amd64`), kernel package, and
  9p initramfs (same idea for QEMU; replaced by an ext2 image for CheerpX).
- `src/main.rs`: COOP/COEP headers if the emulator needs `SharedArrayBuffer`.
- `NOTICE`, licence files.

## Sources

- CheerpX 1.0: https://labs.leaningtech.com/blog/cx-10
- CheerpX npm (32-bit only, licence): https://www.npmjs.com/package/@leaningtech/cheerpx
- WebVM 64-bit issue: https://github.com/leaningtech/webvm/issues/165
- qemu-wasm: https://github.com/ktock/qemu-wasm
- container2wasm: https://github.com/container2wasm/container2wasm
- container2wasm KubeCon EU 2026 slides: https://hosted-files.sched.co/kccnceu2026/b8/container2wasm.pdf
- FOSDEM 2025, Running QEMU inside browser: https://archive.fosdem.org/2025/events/attachments/fosdem-2025-6290-running-qemu-inside-browser/slides/238760/slides_1dDtpcS.pdf
- qemu-wasm JIT numbers (community fork): https://github.com/brianzhouzc/qemu-wasm/pull/22
- v86_64 fork: https://github.com/portlandhodl/v86_64/pull/1, perf: https://github.com/portlandhodl/v86_64/pull/5
- v64 fork: https://github.com/debugdoctor/v64
- aperturerobotics/v86: https://github.com/aperturerobotics/v86
- JSLinux x86_64: https://bellard.org/ , https://news.ycombinator.com/item?id=47311484
- linux-wasm: https://lwn.net/Articles/1044786/ , https://www.phoronix.com/news/Linux-Kernel-WebAssembly
- BrowserPod: https://labs.leaningtech.com/blog/browserpod-deep-dive , https://labs.leaningtech.com/blog/browserpod-20 , https://github.com/leaningtech/browserpod-meta
- Wasmer JS SDK: https://github.com/wasmerio/wasmer-js , https://wasmer.io/posts/clang-in-browser
- Apptron / Wanix: https://github.com/tractordev/apptron , https://github.com/tractordev/wanix
- Debian bookworm LTS: https://www.debian.org/News/2026/20260712 ; trixie i386 status: https://linuxiac.com/debian-13-trixie-released-this-is-whats-new/
