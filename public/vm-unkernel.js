// The VM for the unkernel app (/新): the same exports as vm.js, on unkernel
// (Linux compiled to WebAssembly, riscv64 programs on a JIT) instead of v86.
//
// The root file system is a Debian trixie riscv64 ext4 disk
// (image-unkernel/), read lazily with HTTP Range requests. Writes go to a
// copy-on-write overlay that the SDK keeps in IndexedDB, so the student's work
// survives reloads without whole-VM snapshots; the VM boots fresh each time.
//
// The page reaches the guest through kwtty (vsock): the student's shell is a
// pty session and file operations are exec() calls, run as root.
import { checkSupport, createKernel, openHttpDisk, resetHttpDisk } from "/unkernel/web.mjs";
import * as store from "./store.js";
import { chooseBootImage } from "./vm-image.js";
import { LS_SCRIPT, parseLs, unkKey } from "./vm-shared.js";

const IMAGE_BASE = "/unkernel-image/";
const CMDLINE = "console=hvc0 root=/dev/wda rw init=/sbin/ngoding-init quiet";
const AUTOSAVE_MS = 60_000;
const DEBOUNCE_MS = 5_000;

const encoder = new TextEncoder();
let kernel;
let pty = null;
let stopped = false;
let key = "unk:vm:problems";
let disk, session;
let dirty = false;
let saving = null;
let debounceTimer = null;
let lastSavedAt = null;
let onSave = () => {};
let onPersist = () => {};

const metaKey = (k) => `${k}:meta`;

function markDirty() {
  const wasClean = !dirty;
  dirty = true;
  if (wasClean) onPersist({ phase: "dirty", savedAt: lastSavedAt });
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    if (dirty) save();
  }, DEBOUNCE_MS);
}

export const isDirty = () => dirty;
export const isSaving = () => saving != null;

const toBase64 = (bytes) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromBase64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));

// Run a program as root; argv only, so paths never pass through a shell parser.
async function run(file, args, input) {
  try {
    return await kernel.exec(file, args, input == null ? {} : { input });
  } catch (e) {
    console.error(`exec ${file} failed`, e);
    return { exitCode: null, stdout: "", stderr: String(e) };
  }
}
const ok = (r) => r.exitCode === 0;

async function diskExists(name) {
  try {
    return (await fetch(IMAGE_BASE + name, { method: "HEAD", cache: "no-cache" })).ok;
  } catch {
    return false;
  }
}

// The student's shell: a login shell as `user` on a pty, started again if it exits.
async function startShell(term) {
  pty = await kernel.spawn("/bin/su", ["-l", "user"], { cols: term.cols, rows: term.rows });
  const current = pty;
  const reader = current.output.getReader();
  let out = [];
  (async () => {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      // Batch output into one terminal write per frame.
      if (out.length === 0) requestAnimationFrame(() => {
        for (const chunk of out) term.write(chunk);
        out = [];
      });
      out.push(value);
    }
  })().catch((e) => console.error(e));
  current.ended
    .catch(() => null)
    .then(() => {
      if (pty !== current || stopped) return;
      term.write("\r\n[shell exited; starting a new one]\r\n");
      startShell(term).catch((e) => console.error(e));
    });
}

// Resolves to { restored: savedAt | null } once the student's shell is usable.
export async function boot(ctx) {
  const { term, problems = [], inputs = {}, setStatus } = ctx;
  key = unkKey(ctx.saveKey);
  session = ctx.session;
  onSave = ctx.onSave ?? (() => {});
  onPersist = ctx.onPersist ?? (() => {});
  dirty = false;
  saving = null;
  lastSavedAt = null;

  const support = await checkSupport();
  if (!support.ok) throw new Error(`This browser can't run the unkernel VM: ${support.problems.join("; ")}`);

  const { disk: currentDisk } = await (await fetch(`${IMAGE_BASE}version.json`, { cache: "no-cache" })).json();
  let meta = (await store.get(metaKey(key))) ?? null;
  const exists = meta ? meta.disk === currentDisk || (await diskExists(meta.disk)) : false;
  const choice = chooseBootImage({
    saved: meta && { image: meta.disk, session: meta.session },
    currentImage: currentDisk,
    session,
    imageExists: () => exists,
  });
  disk = choice.image;
  if (choice.kind !== "restore" && meta) {
    if (choice.kind === "missing-image") {
      term.write("The sandbox image for this save is no longer on the server, so your previous files were reset.\r\n");
    }
    await resetHttpDisk(key);
    await store.del(metaKey(key));
    meta = null;
  }

  term.write(meta ? "Restoring your saved files…\r\n" : "Booting Debian on unkernel (Linux in WebAssembly)…\r\n");
  setStatus("downloading kernel…");
  const device = await openHttpDisk(IMAGE_BASE + disk, {
    name: key,
    onError: (e) => onPersist({ phase: "error", savedAt: lastSavedAt, error: e }),
  });
  kernel = await createKernel({
    initrd: null,
    disks: [device],
    cmdline: CMDLINE,
    memoryMiB: 1024,
    memoryFallbackMiB: [768, 512],
    onProgress: (p) => p?.stage && setStatus(`${p.stage}…`),
  });
  stopped = false;
  kernel.exited.then((r) => {
    stopped = true;
    term.write(`\r\n[the VM stopped: ${r?.reason ?? r?.kind ?? "unknown"}; reload the page to start it again]\r\n`);
    setStatus("VM stopped");
  });
  setStatus("starting…");

  // Fresh boots share one image: give each session the time and its own entropy.
  const entropy = toBase64(crypto.getRandomValues(new Uint8Array(64)));
  await run("/bin/sh", ["-c", 'date -s "@$1" >/dev/null; base64 -d > /dev/urandom', "_", String(Math.floor(Date.now() / 1000))], entropy);

  if (!meta && problems.length) {
    setStatus("copying challenge inputs…");
    for (const p of problems) {
      if (!(await writeFile(p.inputFile, inputs[p.id]))) throw new Error(`could not write ${p.inputFile}`);
    }
  }

  term.onData((s) => {
    markDirty();
    pty?.write(s);
  });
  term.onResize(({ rows, cols }) => pty?.resize(cols, rows));
  term.write("\x1b[2J\x1b[H");
  if (meta) term.write(`[restored your work from ${new Date(meta.savedAt).toLocaleString()}]\r\n`);
  await startShell(term);

  lastSavedAt = meta?.savedAt ?? null;
  // A fresh disk with inputs written is worth keeping right away.
  if (!meta) await save();
  setInterval(() => dirty && save(), AUTOSAVE_MS);
  const flush = () => {
    if (dirty || saving) save();
  };
  document.addEventListener("visibilitychange", () => document.hidden && flush());
  addEventListener("pagehide", flush);
  return { restored: meta?.savedAt ?? null };
}

// Flush the guest's file systems into the IndexedDB overlay. Concurrent calls share one save.
export function save() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  saving ??= (async () => {
    onPersist({ phase: "saving", savedAt: lastSavedAt });
    try {
      do {
        dirty = false;
        await run("/bin/sync", []);
        await kernel.sync();
        const savedAt = Date.now();
        await store.put(metaKey(key), { disk, session, savedAt });
        lastSavedAt = savedAt;
        onSave({ savedAt, bytes: 0 });
      } while (dirty);
      onPersist({ phase: "saved", savedAt: lastSavedAt });
    } catch (e) {
      dirty = true;
      onPersist({ phase: "error", savedAt: lastSavedAt, error: e });
      throw e;
    }
  })().finally(() => {
    saving = null;
    if (dirty) save();
  });
  return saving;
}

export async function readFile(path) {
  const r = await run("/usr/bin/base64", ["-w0", "--", path]);
  return ok(r) ? fromBase64(r.stdout.trim()) : null;
}

// Write a file as the student, e.g. from the editor. Resolves to true on success.
export async function writeFile(path, text) {
  markDirty();
  const script = 'mkdir -p "$(dirname "$1")" && base64 -d > "$1" && chown user:user "$1" "$(dirname "$1")"';
  return ok(await run("/bin/sh", ["-c", script, "_", path], toBase64(encoder.encode(text ?? ""))));
}

// Send keystrokes to the student's shell, as if typed in the terminal.
export function type(text) {
  markDirty();
  pty?.write(text);
}

export async function listDir(path) {
  const r = await run("/bin/sh", ["-c", LS_SCRIPT, "_", path]);
  return ok(r) ? parseLs(r.stdout) : null;
}

export async function mkdir(path) {
  markDirty();
  return ok(await run("/bin/sh", ["-c", 'mkdir -p -- "$1" && chown user:user -- "$1"', "_", path]));
}

export async function rm(path) {
  markDirty();
  return ok(await run("/bin/rm", ["-rf", "--", path]));
}

export async function mv(from, to) {
  markDirty();
  return ok(await run("/bin/sh", ["-c", 'mv -- "$1" "$2" && chown -R user:user -- "$2"', "_", from, to]));
}

// Forget a save (by its app save key), e.g. when a play session is deleted.
export async function resetDisk(saveKey) {
  const k = unkKey(saveKey);
  await resetHttpDisk(k);
  await store.del(metaKey(k));
}

export async function reset() {
  await resetDisk(key);
}
