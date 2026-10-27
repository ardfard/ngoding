// Boot the v86 Debian image headless in Node and save a memory snapshot, so
// the browser restores a running system instead of booting Linux (minutes).
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { zstdCompressSync, constants } from "node:zlib";
import { V86 } from "v86";
import { MEMORY_SIZE } from "../public/v86-config.js";

const root = resolve(import.meta.dirname, "..");
const out = resolve(root, "public/v86");
const v86dir = resolve(root, "node_modules/v86/build");

const emulator = new V86({
  wasm_path: resolve(v86dir, "v86.wasm"),
  bios: { url: resolve(out, "bios/seabios.bin") },
  vga_bios: { url: resolve(out, "bios/vgabios.bin") },
  memory_size: MEMORY_SIZE,
  vga_memory_size: 2 * 1024 * 1024,
  autostart: true,
  uart1: true,
  bzimage_initrd_from_filesystem: true,
  // init_on_free zeroes freed pages, which makes the snapshot compress far better
  cmdline: [
    "rw root=host9p init=/sbin/ngoding-init console=ttyS0 quiet loglevel=3",
    "spectre_v2=off pti=off mitigations=off init_on_free=on tsc=reliable",
  ].join(" "),
  filesystem: {
    basefs: { url: resolve(out, "fs.json") },
    baseurl: out + "/flat/",
  },
  screen_dummy: true,
});

const started = Date.now();
const elapsed = () => `${((Date.now() - started) / 1000).toFixed(0)}s`;
let tty0 = "";
let tty1 = "";
const waiters = [];
const waitFor = (pred) => new Promise((ok) => waiters.push({ pred, ok }));
const poke = () => {
  for (const w of [...waiters]) if (w.pred()) waiters.splice(waiters.indexOf(w), 1) && w.ok();
};
emulator.add_listener("serial0-output-byte", (b) => {
  process.stdout.write(String.fromCharCode(b));
  tty0 += String.fromCharCode(b);
  poke();
});
emulator.add_listener("serial1-output-byte", (b) => {
  tty1 += String.fromCharCode(b);
  poke();
});

const timeout = setTimeout(() => {
  console.error(`\nTimed out after ${elapsed()}`);
  process.exit(1);
}, 20 * 60 * 1000);

console.error("Booting (this takes a few minutes)…");
await waitFor(() => tty1.includes("READY"));
console.error(`\n[agent ready after ${elapsed()}]`);
await waitFor(() => tty0.includes("user@ngoding"));
console.error(`[shell ready after ${elapsed()}]`);

// Leading space keeps it out of bash history. Drop caches to shrink the snapshot.
const mark = tty0.length;
emulator.serial0_send(" sudo sh -c 'sync; echo 3 > /proc/sys/vm/drop_caches'; clear\n");
await waitFor(() => tty0.slice(mark).includes("user@ngoding"));
await new Promise((ok) => setTimeout(ok, 2000));

const state = new Uint8Array(await emulator.save_state());
emulator.stop();
const zst = zstdCompressSync(state, { params: { [constants.ZSTD_c_compressionLevel]: 15 } });
writeFileSync(resolve(out, "state.bin.zst"), zst);
console.error(`[saved state: ${(state.length / 2 ** 20).toFixed(0)} MiB → ${(zst.length / 2 ** 20).toFixed(1)} MiB zstd, ${elapsed()} total]`);
clearTimeout(timeout);
process.exit(0);
