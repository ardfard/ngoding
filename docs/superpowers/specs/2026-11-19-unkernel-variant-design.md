# ngoding on unkernel, mounted at /新

Date: 2026-11-19. Status: approved design.
Background: [docs/research/2026-11-17-unkernel.md](../../research/2026-11-17-unkernel.md).

## Goal

A second copy of the app, served under `/新`, that runs the same UI on
[unkernel](https://github.com/pithings/unkernel) (Linux 7.x compiled to Wasm,
riscv64 user space with a JIT) and not on v86. The v86 app at `/` stays as it is.

## Scope

- In: `/新` (home), `/新/play`, `/新/exercise`, `/新/learn`, with the same pages,
  editor, file tree, Run, Build, Check and grading.
- Out for now: cloud sync of play sessions, shares and anything that uploads a
  VM snapshot. These controls are hidden under `/新`. Local IndexedDB
  persistence works.
- No guest network, same as the v86 default.

## Architecture

```
/新/*.html  ──(same HTML, base-prefixed links)──► existing page modules
                                                   │ import "./vm.js"
/新/vm.js   ──served from──► public/vm-unkernel.js │ (same exports as vm.js)
                                                   ▼
                          unkernel SDK (/unkernel/*) ── kernel wasm
                                │ openHttpDisk(/unkernel-image/debian-<hash>.ext4)
                                │   reads: HTTP Range, writes: IndexedDB overlay
                                ├── pty session (vm.spawn) ⇄ ghostty-web
                                └── vm.exec(...) for file ops (kwtty over vsock)
```

### Routing (`src/main.rs`)

- `/新`, `/新/play`, `/新/exercise`, `/新/learn` serve the existing HTML files.
- `/新/<name>.js` (and `/新/lessons/*`) serve the same file as `/<name>.js`,
  except `/新/vm.js`, which serves `public/vm-unkernel.js`.
- Pages hard-code absolute paths (`<script src="/play.js">`, `href="/"`,
  `location.href = "/play?s=…"`, `/style.css`). Script tags become relative
  where that works for both trees. Navigation goes through a small helper
  (`public/base.js`: `base()` returns `"/新"` or `""` from `location.pathname`;
  `href(path)` prefixes it). Shared assets (`/style.css`, `/fonts/*`,
  `/vendor/*`, `/api/*`) stay absolute.
- `/unkernel/*` serves the SDK's browser entry and kernel wasm from
  `node_modules/unkernel`, embedded like the other vendor files.
- `/unkernel-image/*` serves files from the image directory
  (`public/unkernel-image/` in dev, `$NGODING_IMAGE_DIR/unkernel/` in prod)
  and answers `Range` requests with 206. Hashed image files are immutable.

### VM module (`public/vm-unkernel.js`)

Same exports and semantics as `public/vm.js`: `boot`, `save`, `isDirty`,
`isSaving`, `readFile`, `writeFile`, `listDir`, `mkdir`, `rm`, `mv`, `type`,
`reset`.

- **boot(ctx)**: fetch `/unkernel-image/version.json` → `{ disk: "debian-<hash>.ext4" }`.
  The overlay key is the mode's save key with a `unk:` prefix
  (`unk:vm:play:<id>`, `unk:vm:exercise`, `unk:vm:learn`). If the stored
  overlay belongs to another image hash, delete it and write the same "files
  were reset" notice as today. Open the disk with `openHttpDisk(url, { store })`,
  `createKernel({ disks, cmdline: "console=hvc0 root=/dev/wda rw init=/sbin/ngoding-init", memoryMiB })`.
  Then, once kwtty answers: set the clock and entropy, write exercise inputs
  (fresh overlay only), and spawn the student's shell (`su -l user` on a pty).
  ghostty `onData` goes to the pty, pty output goes to ghostty batched per
  frame, and `term.onResize` goes to `session.resize`. Resolves `{ restored }`
  with the overlay's last save time, or `null`.
- **save()**: `vm.sync()`; record `savedAt` with the overlay so `restored` and the
  status row keep working. Same debounce, autosave and pagehide flush as
  `vm.js`.
- **File ops**: `vm.exec` as root with fixed argv, no shell string building
  from user input: `base64 -w0 -- PATH` for read; `sh -c 'mkdir -p "$(dirname "$1")" && base64 -d > "$1" && chown user:user "$1"' _ PATH`
  with base64 on stdin for write; `find` for `ls`, with the same output format
  as `agent.sh` so the parser is shared. Same for mkdir, rm and mv.
- **type(text)**: write to the pty.
- **reset()**: delete the overlay store.
- No memory snapshots: every load cold boots.

### Image (`image-unkernel/`)

- `Dockerfile`: `--platform=linux/riscv64 debian:trixie`, the same package
  list as `image/Dockerfile` minus the kernel, initramfs and 9p bits; uv's
  riscv64 build; `@types/node`; offline wheelhouse; `profile.sh`; user `user`.
- `kwtty`: static riscv64 musl binary, built from unkernel's
  `kernel/guest/kwtty.c` with `zig cc -target riscv64-linux-musl`, or taken from
  the npm package's bundled initramfs if it is shipped there. Installed as
  `/usr/bin/kwtty`.
- `/sbin/ngoding-init` (bash, PID 1), adapted from unkernel's `kw-init`: mount
  `/proc`, `/sys`, `/dev`, `/dev/pts`, `/dev/shm` and `/run`, set the hostname,
  start `kwtty serve` and respawn it, reap children, and handle
  poweroff/reboot. The console runs no login shell; the student's shell comes
  from a pty session.
- `build.sh`: `docker build --output` → rootfs tar → `mke2fs -t ext4 -d` into
  a sparse image (size: the used space plus 2 GiB of headroom) → owner/mode fix-up
  (`tools/ext4-owners.py` approach, or a privileged tar extract inside Docker)
  → `public/unkernel-image/debian-<sha256-prefix>.ext4` + `version.json`.
- npm script: `build:image:unkernel`.

## Error handling

- `checkSupport()` before boot. If JSPI is missing, the status row says
  "this browser can't run the unkernel VM (needs JSPI)" and links to `/`.
- Boot failure, a kernel trap (`vm.exited` with kind trap or fatal) or a kwtty
  timeout puts the status row in its error state with the reason. Overlay
  writes already committed stay.
- A missing image or a server without Range support fails boot with an
  explicit message.

## Testing

- `node --test`: `base.js` prefixing, the shared `ls` parser, and the
  overlay-key/image-mismatch decision (pure function, as `vm-image.js`).
- `cargo test`: `/新` route mapping (`/新/vm.js` → vm-unkernel.js, others
  shared), Range responses (206, Content-Range, 416), immutability of hashed
  image names.
- `test/e2e-unkernel.mjs` (Playwright, server running): `/新` home → play
  session boots → shell prompt → write a C file from the editor, Run → output;
  Python run; `/新/exercise` Check grades a problem; reload restores files;
  the v86 app at `/` still boots.

## Risks, checked first

1. Debian trixie riscv64 boots on unkernel with our init: kwtty answers, and
   `vm.exec` and a pty work.
2. kwtty source: zig 0.16 toolchain, or extraction from the npm package.
3. First-run latency of gcc, go, rustc and ghc over 256 KiB range chunks from a
   ~3 GB image.

If any of these fails, stop and report rather than work around it.
