# LinuxOnTab 2.0: how it runs Linux natively on Wasm

Date: 2026-11-07. Status: research only, no code changes.
Follows [2026-11-05-native-wasm-linux.md](2026-11-05-native-wasm-linux.md).

## Why it matters to us

LinuxOnTab 1.0 is the same stack as ngoding today: v86 + a 32-bit Linux +
xterm in a tab. 2.0 (technical preview, `linuxontab.com/2.0/`) throws the x86
emulator away and boots the Linux kernel compiled to Wasm, with userland
compiled to Wasm. It's the furthest-along public example of the migration we're
weighing, and it has solved several things the previous doc listed as blockers:
`fork()`, compilers inside the guest, pip.

Code: `kilian-ai/linuxontab`, branch `feature/linux-kernel-integration`
(138 stars, last push 2026-11-01). Kernel: `kilian-ai/linux`, branch
`wasm-linuxontab-7.1`, a fork of tombl/linux (the Lowland kernel).

## Architecture

```
browser main thread
 └─ JS runtime (shell/linux-dist-7.1/src = tombl/distro's @lowland/kernel + LoT changes)
     ├─ vmlinux.wasm       Linux 7.1, arch/wasm, NOMMU (6.1 was the previous runtime)
     │    initramfs.cpio → switch_root → ext4 rootfs on virtio-blk
     ├─ virtio: block, console, net, fs, vsock, entropy (implemented in TS)
     └─ one Web Worker per Linux task, each a separate WebAssembly.Instance
          sharing the kernel's memory (env.memory import, SharedArrayBuffer)
          syscalls = calls into the kernel's exported linux.syscall
```

- **The kernel** is a normal Linux tree with an `arch/wasm` port, built by
  LLVM 19 into `vmlinux.wasm`. The source commit is embedded as a
  `.linuxontab.source` custom section for GPL traceability.
- **Processes:** every guest binary is a Wasm module that imports the kernel's
  shared memory. That is mandatory: binaries must link with `--import-memory
  --shared-memory --export-table`, without `-pie`. A process is a worker
  instantiating that module; it has no MMU, so there is no address-space
  isolation in the hardware sense. The docs describe a single CPU token
  (one task runs kernel code at a time).
- **Blocking syscalls:** binaries and the kernel are transformed with
  `wasm-opt --asyncify`, so a blocked `read`/`accept`/`ppoll` unwinds the Wasm
  stack and resumes later instead of freezing a thread.
- **`fork()` without an MMU** (their main invention over Lowland, which has no
  fork): `fork()` is a sentinel syscall (`NR 9999`, vfork `10000`). The parent
  asyncify-*unwinds* its whole call stack into a buffer, then the kernel does a
  real clone that copies the user memory and starts a child worker with that
  buffer. The parent rewinds and gets the pid; the child rewinds from the
  copied buffer and gets 0 (`worker.ts`, `sysroot/wasm_fork.c`). Limits: no
  memory-copying fork while other threads share the address space (the kernel
  returns `-EOPNOTSUPP`), and asyncify costs ~40–50 % speed.
- **libc:** a patched wasm32 musl ("musl-sysroot-fixed"). They found and fixed
  a mallocng bug that wrote to a constant address 0x8000 in every process
  ("the CPython saga"), plus per-thread TLS, clone and dlmalloc fixes.
- **Three binary ABIs on one kernel**, chosen per module at exec:
  1. native `wasm32-unknown-linux-musl` (C/C++ via clang);
  2. **WALI** (`wasm32-wali-linux-musl`, Rust's tier-3 Linux-on-Wasm target):
     `wali-bridge.js` translates x86-64 syscall numbers and LP64 struct
     layouts to the 32-bit asm-generic kernel and emulates mmap/brk with
     `memory.grow`;
  3. **WASI preview1** (`wasi-bridge.js`): any `wasi_snapshot_preview1`
     module, mainly Go `GOOS=wasip1`, with WASI calls served by the process's
     real Linux syscalls (kernel fds, pipes, ttys, sockets).
- **x86-64 escape hatch:** Blink (jart's x86-64 user-mode emulator) is built
  as a guest binary and registered with `binfmt_misc`, so unmodified Alpine
  x86_64 binaries exec transparently and mix with Wasm ones in pipelines.
  It is **~165–235× slower than native Wasm** (software page tables plus
  asyncify). Node 24 + npm run this way: `npm -v` takes ~21 s, and a 2-package
  `npm install` takes ~2 min.
- **Networking:** WispSlirp (TCP over WebSocket to a Wisp relay) behind
  virtio-net, so curl, git and pip reach the internet.
- **Persistence:** ext4 rootfs with a "block-delta overlay" saved to browser
  storage, so changes survive reloads. Large images (x86-node, chromium,
  libreoffice) are extra read-only ext4 disks served from Cloudflare R2.
- **Headers:** COOP/COEP required. GitHub Pages can't send them, so they use
  `coi-serviceworker.js`.

## Userland relevant to ngoding

| Need | LinuxOnTab 2.0 | How |
|---|---|---|
| shells, coreutils, git, less | ✅ busybox, bash, zsh, hush; git via libgit2 | native musl |
| editors | ✅ nano 8.3, vim (busybox vi); Neovim via third-party `ernsoylu/linuxontab-apps` | native |
| **Python** | ✅ CPython 3.11.14 **with pip** (pure-Python wheels) | native, static; ctypes off; their recipe stubs `fork` in `_posixsubprocess` to ENOSYS, so `subprocess` can't spawn yet |
| numpy | ❌ not packaged | — |
| **C / C++** | ✅ **clang 19, wasm-ld, wasm-opt run inside the guest** (`clang hello.c -o hello`); a C++ exceptions sysroot exists | clang cross-built to run on the guest (`local/build-wasm-toolchain.sh`) |
| **Rust** | ✅ **rustc 1.99 (~93 MB) and cargo run inside the guest** (`lot-rustc`, `cargo new/build/run`) | WALI binaries; output is WALI too |
| **Go** | ⚠️ Go *programs* run (GOOS=wasip1 + patched stdlib for real sockets); the Go compiler isn't shipped in the guest | wasi-bridge. No `os/exec`, fork or signal handlers. The compiler itself builds for wasip1, but `go build` needs `os/exec`, so we'd call `compile`/`link` directly |
| **Haskell** | ❌ | only via Blink + x86 GHC, which at ~200× is unusable; MicroHs would be the native option |
| Node.js | ⚠️ native QuickJS-ish build; real Node only under Blink (slow) | — |
| Ctrl-C | not documented; asyncify yields only at syscalls, so a pure CPU loop likely needs worker termination | — |

## What this changes in our assessment

The previous doc's blocker was "no compiler runs inside a Wasm Linux guest."
**That is no longer true:** LinuxOnTab shows clang and rustc/cargo in-guest on
the same tombl kernel. C, C++, Rust and Python are covered; Go is half-covered
(runtime yes, compiler not yet shipped); Haskell isn't.

It also shows the cost:

- **A heavily patched, single-team stack:** a custom fork ABI, patched musl,
  three syscall bridges, asyncify on every binary, and per-package recipes with
  hand patches (sshd's re-exec removed, Python's fork stubbed, and so on).
  Every package we add needs this treatment; there's no `apt install`.
- **Unstable to build from source:** issue #4 says a fresh clone doesn't boot,
  because committed artifacts lag the deployed build. The docs still
  half-describe the 6.1 runtime, and binaries come from Nix-store paths on the
  author's machine.
- **No license on the LinuxOnTab repo** (GitHub reports none). We can't copy
  its code (bridges, fork, recipes) without permission. The kernel fork is
  GPL-2.0 and tombl/distro is MIT; those parts we could use.
- 2.0 is labelled a technical preview, and 1.0 (v86) stays their stable default.

## Feasibility for ngoding

- **Technically feasible now** for Python + C/C++ + Rust exercises. Go needs
  extra work (ship `compile`/`link` as wasip1 and replace `go build` with a
  wrapper). Haskell would need MicroHs or would stay on v86.
- **Practically:** we'd be adopting an unlicensed preview with a fragile build.
  The responsible path:
  1. **Ask the LinuxOnTab author about a license** (MIT/Apache, like
     tombl/distro), or plan to reimplement fork and the WALI/WASI bridges
     ourselves on top of Lowland (MIT). The bridges are ~25 KB of JS each and
     well commented.
  2. **Spike against the hosted build first** (`linuxontab.com/2.0/`) before
     building anything: in the browser, time `clang` on a typical exercise,
     `cargo build` on a small crate, `python3` on a CPU loop and Ctrl-C on a
     runaway loop. Compare with ngoding on v86. This costs about an hour and
     needs no build.
  3. If numbers win clearly, prototype a **Python + C mode** on a Lowland or
     LinuxOnTab runtime with our ghostty-web terminal and our agent protocol over
     vsock, keeping v86 for Go/Haskell until those land.
- **Keep v86 as the default** until (1) the license question is answered and
  (2) a from-source build reproduces the hosted one.

## Sources

- LinuxOnTab 2.0 page: https://linuxontab.com/2.0/ ; 1.0: https://linuxontab.com/
- Repo: https://github.com/kilian-ai/linuxontab (branch `feature/linux-kernel-integration`)
  - kernel notes: `kernels/README.md`, `.github/agents/lot-kernel.agent.md`
  - fork: `shell/linux-dist-7.1/src/kernel/worker.ts`
  - bridges: `shell/linux-dist-7.1/src/lot/wali-bridge.js`, `wasi-bridge.js`
  - Go: `toolchain/go-lot/README.md`; Python: `packages/recipes/python3.sh`
  - x86: `spikes/x86-blink/README.md`, `spikes/x86-node/README.md`
  - package index: `packages/index.json` (clang, wasm-ld, wasm-opt, rustc, cargo)
- Issue #4 (fresh clone doesn't boot): https://github.com/kilian-ai/linuxontab/issues/4
- Kernel fork: https://github.com/kilian-ai/linux ; upstream port https://github.com/tombl/linux ; https://github.com/tombl/distro
- Third-party apps: https://github.com/ernsoylu/linuxontab-apps
- WALI: https://github.com/arjunr2/WALI ; Blink: https://github.com/jart/blink
