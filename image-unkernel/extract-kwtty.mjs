// Copy unkernel's static guest helper (kwtty) out of the bundled Alpine
// initramfs, so our Debian image serves vm.exec()/spawn() the same way.
// Usage: node --experimental-wasm-jspi image-unkernel/extract-kwtty.mjs <out-file>
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createKernel } from "unkernel/node";

const out = resolve(process.argv[2] ?? "image-unkernel/build/kwtty");
const vm = await createKernel();
const r = await vm.exec("/bin/cat", ["/usr/bin/kwtty"], { encoding: "buffer" });
if (r.exitCode !== 0 || r.stdout.length === 0) throw new Error(`cat kwtty failed: ${r.exitCode}`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, r.stdout, { mode: 0o755 });
console.log(`kwtty: ${r.stdout.length} bytes -> ${out}`);
process.exit(0);
