# Native Wasm Linux: a kernel compiled to WebAssembly, with Wasm userspace

Date: 2026-11-05. Status: research only, no code changes.
Companion to [2026-11-05-linux-in-wasm-alternatives.md](2026-11-05-linux-in-wasm-alternatives.md),
which covers emulators (v86, QEMU, CheerpX).

> **Update 2026-11-07:** LinuxOnTab 2.0, built on the same tombl kernel, already
> runs clang, rustc and cargo inside the guest and has `fork()` and pip. The
> "no compiler runs inside the guest" blocker below is out of date. See
> [2026-11-07-linuxontab-2.md](2026-11-07-linuxontab-2.md).

## Question

Instead of emulating an x86 PC, could ngoding run the Linux kernel itself
compiled to Wasm, with every program in the sandbox compiled to Wasm (ported
ourselves, or taken from existing Wasm builds)? What works, what's missing, and
how much work is it?

## How this differs from v86

v86 runs unmodified i386 Debian binaries by JIT-translating x86 to Wasm, so every
instruction pays an emulation cost but any Debian package just works. A native
Wasm kernel removes the emulator: the kernel and each program are Wasm modules
the browser runs directly, close to native speed. The cost moves to porting,
because **every binary, including every compiler, must be rebuilt for the new
target**, and the platform lacks things Linux programs assume.

Platform constraints that apply to both ports below:

- **No MMU (NOMMU Linux).** Wasm has no page tables. That means no `fork()`
  (programs must use `posix_spawn()` / `clone`+`execve`), no `mmap()` family,
  no copy-on-write and no demand paging. The memory-control proposal could
  change this one day.
- **No preemption inside Wasm.** Each process or thread gets its own virtual
  CPU, backed by a Web Worker, and is never preempted. A tight loop that makes no
  syscalls can't receive a signal; the only way to stop it is to kill the worker
  from JS.
- **No dynamic linking yet.** Everything is static, so there's no `dlopen`.
  That rules out Python `ctypes`/C extensions loaded at runtime, rustc
  proc-macros as dylibs, and so on.
- **Needs `SharedArrayBuffer`**, so every page must send COOP/COEP headers.
- **No whole-machine snapshot.** Worker and Wasm instance state can't be
  serialized. Boot is fast (under a second claimed), so we don't need one;
  persistence becomes a writable disk (ext4 on OPFS) instead of v86's 50–200 MB
  memory snapshots.

## The kernel ports

### Lowland: tombl/linux + tombl/distro (low.land)

The most complete effort, and under active development (last commits Oct 2026).

- **Kernel:** `arch/wasm` port, rebased to Linux 7.1, SMP (one Web Worker per
  CPU). Virtio block, console, fs, net, vsock and entropy devices are
  implemented in the JS host.
- **Userspace:** target triple `wasm32-unknown-linux-musl`, built with Nix and
  a patched LLVM. Packages become real APKs; images are EROFS (immutable) or
  ext4 (writable), built with `apk`.
- **Host SDK:** `@lowland/kernel` (machine, devices) and `@lowland/guest` (guest
  agent over vsock: run commands, stream I/O, file operations). Block devices can
  live on OPFS through a filesystem worker, and virtio-fs can share a browser
  File System Access directory with the guest. There's also a userspace IPv4
  stack with TCP/DNS and a host `connectTcp` adapter.
- **Ported packages:** bash, busybox, coreutils, findutils, grep, sed, gawk,
  diffutils, patch, tar, xz, zstd, bzip2, less, vim, make, git, curl, openssl,
  sqlite3, jq, file, util-linux, e2fsprogs, dropbear, lua, quickjs, ncurses,
  readline, **Python 3.13**, apk-tools; LTP and kselftests run in CI.
- **Python caveats:** no pip (it imports `mmap`), no `ctypes`, no `mmap`
  module, and `subprocess` is patched to use `posix_spawn`.
- **Compilers:** clang/LLVM and rustc are packaged only as **host cross
  compilers** (they run on the build machine and emit `wasm32-unknown-linux-musl`).
  **No compiler runs inside the guest.** A self-hosting toolchain is listed as
  "eventually".
- **Maturity:** one maintainer, 14 stars, breaking ABI changes in the unreleased
  changelog. The npm packages are 0.0.0 placeholders, so for now we'd have to
  build from source with Nix.
- **License:** distro MIT, kernel GPL-2.0.

### Joel Severin's linux-wasm

Announced on LKML in Nov 2025, now rebased to Linux 7.0, with wasm32 and
wasm64 NOMMU variants.

- Userspace is BusyBox + musl in an initramfs only. There's no virtio or block
  device yet, so it has no persistent disk.
- `.wasm` executables run through a `binfmt_wasm` patch. The author describes
  running existing Wasm programs through a syscall proxy as a possible design,
  not as something that is implemented.
- The author calls it "not very stable and will crash sooner or later".
- **Verdict:** a reference implementation, not a base to build on. Lowland
  already has what it lacks (virtio, disks, networking, a package set).

## What we need inside the guest, and where it stands

ngoding's image today (see `image/Dockerfile`) ships gcc/g++, Go, rustc, GHC,
Python + numpy, uv, git, nano/nvim. "Existing Wasm version" means a build
someone already ships. Nearly all of those are **WASI** binaries (`wasm32-wasip1`)
that emit WASI programs. Neither kernel can run WASI binaries today, so using
them means either adding a WASI→Linux syscall shim to the kernel or running
them outside the kernel in a separate worker.

| Need | On Lowland today | Existing Wasm build elsewhere | Path to having it in the guest | Effort |
|---|---|---|---|---|
| bash, coreutils, git, less, make | ✅ packaged | — | — | none |
| Editor (nano / nvim) | vim ✅ | — | port nano (small C); nvim needs libuv, so harder | low |
| **Python 3** | ✅ 3.13, stdlib only | Pyodide (Emscripten ABI, incompatible), CPython WASI | already there | none |
| numpy | ❌ | Pyodide's numpy (Emscripten ABI only) | cross-compile numpy statically into CPython; it may avoid mmap | medium |
| pip / uv / wheels | ❌ (pip imports `mmap`) | — | patch pip or ship a wheelhouse unpacker; uv is Rust with mmap/threads | medium–high |
| **C / C++ compiler** | ❌ (host clang only) | YoWASP clang 21/22 (WASI, archived Mar 2026, ~21 MB brotli / 105 MB unpacked, no C++ exceptions); Wasmer `clang/clang` (WASIX, ~100 MB) | cross-build LLVM clang + lld *for* `wasm32-unknown-linux-musl` with Lowland's toolchain, and ship musl sysroot + headers. LLVM already builds for Wasm (whitequark's RFC), but its file `mmap` use must be patched out | **medium–high** (weeks) |
| gcc | ❌ | none usable | not realistic; clang only | — |
| **Go** | ❌ | official `cmd/compile` + `cmd/link` build for `GOOS=wasip1`; one site runs Go 1.27 this way in the browser | either a new `GOOS=linux GOARCH=wasm` port of the Go runtime and syscalls (very large), or run the wasip1 compiler and its wasip1 output outside the kernel | **high** |
| **Rust** | ❌ (host rustc only) | rubrc and Mearman/wasm-rustc (rustc as `wasm32-wasip1-threads`, ~224 MB, wasm-rustc can't link yet) | build rustc to *run* on wasm32-linux-musl: needs mmap removed from metadata loading, and proc-macros as dylibs won't load without dynamic linking (so no `serde` derive and similar) | **very high** |
| **Haskell** | ❌ | GHC in browser (draft MR, bytecode interpreter only, can't call a C compiler); MicroHs (1.8 MB, Haskell 2010 + extensions, no Template Haskell) | MicroHs is plain C, so it should cross-compile easily; GHC is not realistic | low (MicroHs) / no (GHC) |
| Ctrl-C on runaway programs | partial: signals work at syscall boundaries | — | JS-side "kill the worker" fallback for `while(1);` | low–medium |
| Agent (fs ops, grading I/O) | ✅ `@lowland/guest` agent over vsock | — | would replace `image/agent.sh` + ttyS1 | low |
| Terminal | ✅ virtio console with PTY resize | — | wire to ghostty-web as today | low |
| Persistence | ✅ ext4 on OPFS block device | — | replaces VM snapshots in IndexedDB; share/cloud packs need new code | medium |

## Feasibility verdict

**As a full replacement for v86: not feasible today, and not within months.**
The kernel side is good enough, and Lowland already provides a usable shell,
Python, git and vim. The blocker is that **no compiler runs inside a Wasm Linux
guest yet**, and three of our five compiled languages (Go, Rust, GHC) need
either a new language port or features the platform deliberately lacks (mmap,
dynamic linking).

**As a partial replacement: feasible for Python and shell exercises now, C/C++
after a clang port.** Rough tiers:

1. **Now:** Python (stdlib), shell, git and vim on Lowland. This would likely
   start faster and run Python much faster than v86, and drop the 761 MB
   file tree and snapshot pipeline for these modes.
2. **+ weeks:** C/C++ via clang + lld cross-built to run in the guest, and
   Haskell via MicroHs. This is the highest-leverage piece and could be
   contributed upstream to Lowland.
3. **Unlikely:** Go and Rust inside the guest. If we want them in the browser
   without an emulator, the realistic route is the existing WASI compilers
   running in a separate worker next to the kernel, not inside it. That's a
   hybrid that no longer gives one consistent Linux.

### Risks

- Single-maintainer project, pre-release, with frequent breaking ABI changes,
  and we'd likely need to carry patches.
- NOMMU semantics leak into teaching material: no `fork()` (C exercises using
  `fork` won't work), no `mmap`, no `/proc`-heavy tricks.
- The kernel host leaks memory on repeated process spawns (an open Lowland item),
  which matters for a "Run" button pressed hundreds of times per session.
- Wasm32 caps each process at 4 GB of address space; large C++/LLVM builds may
  need wasm64, which is experimental in both ports.
- Shares/cloud saves are built around whole-VM snapshots today, so those formats
  would change.

## Recommendation

- **Don't replace v86 with a native Wasm kernel now.** Keep tracking Lowland;
  it's the one to watch.
- **Optional spike (~2–3 days):** build Lowland's site image with Nix, boot it
  from a page served by our Rust server (adding COOP/COEP), and wire its console
  to ghostty-web. Measure cold start, `python -c` latency and a CPU-heavy Python
  loop against v86, Ctrl-C on `while True: pass`, and OPFS persistence across
  reloads. If it wins clearly, a **Python-only mode on Lowland** is a reasonable
  first product step while v86 keeps the compiled languages.
- **Go/no-go for a full switch:** clang/lld running inside the guest. Until that
  exists (upstream or by us), a native Wasm Linux can't cover C/C++, which is
  the core of the exercises.

## Sources

- Lowland distro (packages, CHANGELOG, todo, architecture docs): https://github.com/tombl/distro ; site https://low.land
- Lowland kernel: https://github.com/tombl/linux ; syscall ABI PR https://github.com/tombl/linux/pull/59 ; virtio reset PR https://github.com/tombl/linux/pull/61
- Lowland Python package notes: https://github.com/tombl/distro/blob/main/distro/python/package.nix
- Lowland rustc (host-only build): https://github.com/tombl/distro/blob/main/distro/rustc/package.nix
- LinuxOnTab fork of tombl/linux: https://github.com/kilian-ai/linux
- linux-wasm: https://github.com/joelseverin/linux-wasm ; demo https://joelseverin.github.io/linux-wasm/ ; LWN https://lwn.net/Articles/1044786/ ; HN https://news.ycombinator.com/item?id=45783074
- Clang in Wasm: https://www.npmjs.com/package/@yowasp/clang ; LLVM RFC https://discourse.llvm.org/t/rfc-building-llvm-for-webassembly/79073 ; https://github.com/exp-ouroborous/wasm-dives/pull/5 ; Wasmer clang https://wasmer.io/posts/clang-in-browser
- Clang + Go compiler in browser (wasip1): https://dev.to/avinashkori/how-i-run-clang-and-the-real-go-compiler-entirely-in-the-browser-1akb
- rustc in Wasm: https://github.com/oligamiq/rubrc ; https://github.com/Mearman/wasm-rustc
- GHC in browser: https://discourse.haskell.org/t/ghc-now-runs-in-your-browser/13169 ; MicroHs in browser https://github.com/live-codes/browser-haskell ; GHC Wasm backend https://ghc.gitlab.haskell.org/ghc/doc/users_guide/wasm.html
