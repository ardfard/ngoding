// CheerpX VM: x86 → WebAssembly JIT with Linux syscall emulation (no kernel).
// Same interface as vm.js (v86); selected with /?vm=cheerpx.
import * as CheerpX from "https://cxrtnc.leaningtech.com/1.4.0/cx.esm.js";
import { PROBLEMS } from "./problems.js";

// Bump when the disk image changes so stale IndexedDB overlays are discarded.
const DISK_VERSION = "v5";
const DISK_DB = `ngoding-disk-${DISK_VERSION}`;
const FILES_DB = "ngoding-files";
const USER_ENV = [
  "HOME=/home/user",
  "USER=user",
  "SHELL=/bin/bash",
  "TERM=xterm-256color",
  "LANG=C.UTF-8",
  "PATH=/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin",
];
const AS_USER = { env: USER_ENV, cwd: "/home/user", uid: 1000, gid: 1000 };
const AS_ROOT = { env: USER_ENV, cwd: "/", uid: 0, gid: 0 };

let cx, filesDevice;

export async function boot({ term, inputs, setStatus }) {
  if (!crossOriginIsolated) throw new Error("page must be served with COOP/COEP headers (use `npm start`)");
  term.write("Booting Linux in your browser (first boot streams the disk image)…\n");

  setStatus("fetching disk…");
  const blockDevice = await CheerpX.HttpBytesDevice.create("/disk/ngoding.ext2");
  // Writes go to IndexedDB, so the student's home directory survives reloads.
  const overlay = await CheerpX.OverlayDevice.create(blockDevice, await CheerpX.IDBDevice.create(DISK_DB));
  // A separate IDB-backed directory is the bridge for reading files out of the VM.
  filesDevice = await CheerpX.IDBDevice.create(FILES_DB);
  // An in-memory directory for pushing generated inputs into the VM.
  const dataDevice = await CheerpX.DataDevice.create();

  setStatus("booting…");
  cx = await CheerpX.Linux.create({
    mounts: [
      { type: "ext2", path: "/", dev: overlay },
      { type: "dir", path: "/files", dev: filesDevice },
      { type: "dir", path: "/data", dev: dataDevice },
      { type: "devs", path: "/dev" },
      { type: "proc", path: "/proc" },
    ],
  });

  const send = cx.setCustomConsole((buf) => term.write(new Uint8Array(buf)), term.cols, term.rows);
  term.onData((s) => {
    for (const b of new TextEncoder().encode(s)) send(b);
  });

  // Place this student's inputs in ~/challenge/<id>/input.txt.
  // (`cat >` rather than `cp`: cp from a DataDevice hung in CheerpX 1.2.8.)
  setStatus("copying challenge inputs…");
  for (const p of PROBLEMS) {
    await dataDevice.writeFile(`/${p.id}.txt`, inputs[p.id]);
    await cx.run("/bin/sh", ["-c", `mkdir -p "$(dirname ${p.inputFile})" && cat /data/${p.id}.txt > ${p.inputFile}`], AS_USER);
  }

  // Keep a shell alive: if the student types `exit`, start a fresh one.
  (async () => {
    for (;;) {
      await cx.run("/bin/bash", ["--login"], AS_USER);
      term.write("\n[shell exited — starting a new one]\n");
    }
  })();
}

export async function readFile(path) {
  // Copy the file into the IDB bridge and read it from JS. Runs as root
  // alongside the student's interactive shell.
  await cx.run("/bin/sh", ["-c", `rm -f /files/submission; [ -f ${path} ] && cat ${path} > /files/submission; true`], AS_ROOT);
  const blob = await filesDevice.readFileAsBlob("/submission");
  return blob ? await blob.text() : null;
}

export async function reset() {
  await Promise.all(
    [DISK_DB, FILES_DB].map(
      (name) => new Promise((ok) => {
        const req = indexedDB.deleteDatabase(name);
        req.onsuccess = req.onerror = req.onblocked = ok;
      }),
    ),
  );
}
