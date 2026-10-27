// The VM: v86 emulates a full x86 PC (JIT to WebAssembly) running a real Debian
// kernel. The root filesystem is 9p, fetched file by file over HTTP, and the
// VM resumes from a snapshot taken after boot (see image/build-state.mjs).
import { V86 } from "/vendor/v86/libv86.mjs";
import { PROBLEMS } from "./problems.js";
import { MEMORY_SIZE } from "./v86-config.js";

const encoder = new TextEncoder();
let emulator;

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

export async function boot({ term, inputs, setStatus }) {
  term.write("Restoring a booted Debian VM (downloads a snapshot on first visit)…\n");
  setStatus("downloading snapshot…");

  emulator = new V86({
    wasm_path: "/vendor/v86/v86.wasm",
    bios: { url: "/v86/bios/seabios.bin" },
    vga_bios: { url: "/v86/bios/vgabios.bin" },
    memory_size: MEMORY_SIZE,
    vga_memory_size: 2 * 1024 * 1024,
    initial_state: { url: "/v86/state.bin.zst" },
    filesystem: { baseurl: "/v86/flat/" },
    uart1: true,
    autostart: true,
    disable_keyboard: true,
    disable_mouse: true,
  });
  await new Promise((ok) => emulator.add_listener("emulator-ready", ok));
  setStatus("resuming…");

  // Batch output bytes into one xterm write per frame.
  let out = [];
  emulator.add_listener("serial0-output-byte", (b) => {
    if (out.length === 0) requestAnimationFrame(() => {
      term.write(Uint8Array.from(out));
      out = [];
    });
    out.push(b);
  });
  term.onData((s) => emulator.serial_send_bytes(0, encoder.encode(s)));
  emulator.add_listener("serial1-output-byte", onAgentByte);

  // The snapshot's clock and entropy pool are the same for everyone: fix both.
  const entropy = crypto.getRandomValues(new Uint8Array(64));
  await agent("init", Math.floor(Date.now() / 1000), toBase64(entropy));
  await agent("resize", term.rows, term.cols);
  term.onResize(({ rows, cols }) => agent("resize", rows, cols));

  setStatus("copying challenge inputs…");
  for (const p of PROBLEMS) {
    const { status } = await agent("write", p.inputFile, toBase64(encoder.encode(inputs[p.id])));
    if (status !== 0) throw new Error(`could not write ${p.inputFile}`);
  }

  // Redraw the prompt that was printed before the snapshot was taken.
  term.write("\x1b[2J\x1b[H");
  emulator.serial_send_bytes(0, encoder.encode("\n"));
}

export async function readFile(path) {
  const { status, data } = await agent("read", path);
  return status === 0 ? fromBase64(data) : null;
}

export async function reset() {
  // Nothing persisted: every visit starts from the snapshot.
}
