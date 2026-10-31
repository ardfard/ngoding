// The VM: v86 emulates a full x86 PC (JIT to WebAssembly) running a real Debian
// kernel. The root filesystem is 9p, fetched file by file over HTTP, and the
// VM resumes from a snapshot taken after boot (see image/build-state.mjs).
//
// The student's work is kept by saving the whole VM state (memory + 9p
// filesystem changes) to IndexedDB and resuming from it on the next visit.
import { V86 } from "/vendor/v86/libv86.mjs";
import { MEMORY_SIZE } from "./v86-config.js";
import * as store from "./store.js";

const SAVE_KEY = "snapshot";
const AUTOSAVE_MS = 60_000;

const encoder = new TextEncoder();
let emulator;
// Which image and session the running VM belongs to; a saved snapshot is only
// resumed if both still match.
let image, session;
let dirty = false;
let saving = null;
let onSave = () => {};

// Request/response channel to /usr/local/sbin/ngoding-agent on the second
// serial port (protocol documented in image/agent.sh).
const pending = new Map();
let nextId = 1;
let line = "";

function onAgentByte(byte) {
  if (byte !== 10) {
    line += String.fromCharCode(byte);
    return;
  }
  const [kind, id, value] = line.split(" ");
  line = "";
  const req = pending.get(id);
  if (!req) return;
  if (kind === "DATA") req.data = value ?? "";
  if (kind === "DONE") {
    pending.delete(id);
    req.resolve({ status: Number(value), data: req.data });
  }
}

function agent(verb, ...args) {
  const id = String(nextId++);
  return new Promise((resolve) => {
    pending.set(id, { resolve });
    emulator.serial_send_bytes(1, encoder.encode(`${id} ${verb} ${args.join(" ")}\n`));
  });
}

const toBase64 = (bytes) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromBase64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));

// Snapshots are ~50-200 MB raw but mostly zeroes; gzip shrinks them a lot.
const gzip = (buf) => new Response(new Blob([buf]).stream().pipeThrough(new CompressionStream("gzip"))).blob();
const gunzip = (blob) => new Response(blob.stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();

// Resolves to { restored: savedAt | null } once the student's shell is usable.
export async function boot(ctx) {
  const { term, problems, inputs, setStatus } = ctx;
  session = ctx.session;
  onSave = ctx.onSave ?? onSave;

  ({ state: image } = await (await fetch("/v86/version.json", { cache: "no-cache" })).json());
  let saved = await store.get(SAVE_KEY);
  if (saved && (saved.image !== image || saved.session !== session)) {
    if (saved.image !== image) term.write("The sandbox image was updated, so your previous files were reset.\n");
    await store.del(SAVE_KEY);
    saved = null;
  }

  if (saved) {
    term.write("Restoring your saved session…\n");
    setStatus("restoring your work…");
  } else {
    term.write("Restoring a booted Debian VM (downloads a snapshot on first visit)…\n");
    setStatus("downloading snapshot…");
  }

  emulator = new V86({
    wasm_path: "/vendor/v86/v86.wasm",
    bios: { url: "/v86/bios/seabios.bin" },
    vga_bios: { url: "/v86/bios/vgabios.bin" },
    memory_size: MEMORY_SIZE,
    vga_memory_size: 2 * 1024 * 1024,
    initial_state: saved ? { buffer: await gunzip(saved.blob) } : { url: `/v86/${image}` },
    filesystem: { baseurl: "/v86/flat/" },
    uart1: true,
    autostart: true,
    disable_keyboard: true,
    disable_mouse: true,
  });
  await new Promise((ok) => emulator.add_listener("emulator-ready", ok));
  setStatus("resuming…");

  // Batch output bytes into one terminal write per frame.
  let out = [];
  emulator.add_listener("serial0-output-byte", (b) => {
    if (out.length === 0) requestAnimationFrame(() => {
      term.write(Uint8Array.from(out));
      out = [];
    });
    out.push(b);
  });
  term.onData((s) => {
    dirty = true;
    emulator.serial_send_bytes(0, encoder.encode(s));
  });
  emulator.add_listener("serial1-output-byte", onAgentByte);

  // A snapshot's clock is stale and (for the base image) its entropy pool is
  // the same for everyone: fix both.
  const entropy = crypto.getRandomValues(new Uint8Array(64));
  await agent("init", Math.floor(Date.now() / 1000), toBase64(entropy));
  await agent("resize", term.rows, term.cols);
  term.onResize(({ rows, cols }) => agent("resize", rows, cols));

  // A saved session already has its inputs (and whatever the student did).
  if (!saved) {
    setStatus("copying challenge inputs…");
    for (const p of problems) {
      const { status } = await agent("write", p.inputFile, toBase64(encoder.encode(inputs[p.id])));
      if (status !== 0) throw new Error(`could not write ${p.inputFile}`);
    }
  }

  setInterval(() => dirty && save(), AUTOSAVE_MS);
  document.addEventListener("visibilitychange", () => document.hidden && dirty && save());

  // Redraw the prompt that was printed before the snapshot was taken.
  term.write("\x1b[2J\x1b[H");
  if (saved) term.write(`[restored your work from ${new Date(saved.savedAt).toLocaleString()}]\n`);
  emulator.serial_send_bytes(0, encoder.encode("\n"));
  return { restored: saved?.savedAt ?? null };
}

// Save the VM state to IndexedDB. Concurrent calls share one save.
export function save() {
  saving ??= (async () => {
    dirty = false;
    const state = await emulator.save_state();
    const blob = await gzip(state);
    const savedAt = Date.now();
    await store.put(SAVE_KEY, { image, session, savedAt, blob });
    onSave({ savedAt, bytes: blob.size });
  })().finally(() => {
    saving = null;
  });
  return saving;
}

export async function readFile(path) {
  const { status, data } = await agent("read", path);
  return status === 0 ? fromBase64(data) : null;
}

// Write a file as the student, e.g. from the editor. Resolves to true on success.
export async function writeFile(path, text) {
  dirty = true;
  const { status } = await agent("write", path, toBase64(encoder.encode(text)));
  return status === 0;
}

// Send keystrokes to the student's shell, as if typed in the terminal.
export function type(text) {
  dirty = true;
  emulator.serial_send_bytes(0, encoder.encode(text));
}

export async function reset() {
  await store.del(SAVE_KEY);
}
