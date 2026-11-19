// Boot an ngoding unkernel disk in Node and check what the page relies on:
// kwtty answers exec(), a pty runs a login shell as `user`.
// Usage: node --experimental-wasm-jspi image-unkernel/boot-check.mjs <disk.ext4> [cmd]
import { createKernel, openDisk } from "unkernel/node";

const [disk, cmd = "id; uname -m; cat /etc/debian_version"] = process.argv.slice(2);
const t0 = performance.now();
const vm = await createKernel({
  disks: [await openDisk(disk, { snapshot: true })],
  initrd: null,
  cmdline: "console=hvc0 root=/dev/wda rw init=/sbin/ngoding-init",
  memoryMiB: 1024,
});
let log = "";
vm.onOutput((b) => (log += new TextDecoder().decode(b)));
const ms = () => `${Math.round(performance.now() - t0)} ms`;
try {
  const r = await vm.exec("/bin/sh", ["-c", cmd], { timeout: 60000 });
  console.log(`[exec after ${ms()}] exit=${r.exitCode}\n${r.stdout}${r.stderr}`);
  const pty = await vm.spawn("/bin/su", ["-l", "user"], { cols: 100, rows: 30 });
  let out = "";
  const reader = pty.output.getReader();
  (async () => { for (;;) { const { value, done } = await reader.read(); if (done) break; out += new TextDecoder().decode(value); } })();
  await pty.write("echo PTY-$(id -un)-$(tty)\n");
  for (let i = 0; i < 100 && !out.includes("PTY-user"); i++) await new Promise((r) => setTimeout(r, 100));
  console.log(`[pty after ${ms()}]`, JSON.stringify(out.slice(-200)));
} catch (e) {
  console.error("FAILED:", e, "\n--- console ---\n", log.slice(-3000));
  process.exit(1);
}
process.exit(0);
