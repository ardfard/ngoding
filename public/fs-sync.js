// Poll guest workspace listings / open-file contents so shell mutations show up
// in the explorer and editor. 9p does not support reliable inotify, so we poll.

export function dirSignature(entries) {
  return [...entries]
    .map((e) => `${e.type}\t${e.name}`)
    .sort()
    .join("\n");
}

export function classifyDiskChange({ saved, dirty, disk }) {
  if (disk === null) return dirty ? "conflict" : "deleted";
  if (disk === saved) return "unchanged";
  return dirty ? "conflict" : "reload";
}

/**
 * @param {object} opts
 * @param {number} [opts.intervalMs]
 * @param {(path: string) => Promise<Array<{type:string,name:string}>|null>} opts.listDir
 * @param {(path: string) => Promise<string|null>} opts.readFile
 * @param {() => string[]} opts.getWatchedDirs
 * @param {() => Array<{path:string,saved:string|null,dirty:boolean}>} opts.getOpenFiles
 * @param {() => boolean} opts.shouldRefreshTree
 * @param {() => void} opts.onTreeChange
 * @param {(ev: {path:string,kind:string,disk:string|null}) => void} opts.onFileEvent
 * @param {typeof setTimeout} [opts.setTimeout]
 * @param {typeof clearTimeout} [opts.clearTimeout]
 */
export function createFsSync({
  intervalMs = 1000,
  listDir,
  readFile,
  getWatchedDirs,
  getOpenFiles,
  shouldRefreshTree,
  onTreeChange,
  onFileEvent,
  setTimeout: schedule = globalThis.setTimeout.bind(globalThis),
  clearTimeout: unschedule = globalThis.clearTimeout.bind(globalThis),
}) {
  /** @type {Map<string, string>} */
  const dirSigs = new Map();
  /** @type {Map<string, string|null>} */
  const fileDisk = new Map();
  let timer = null;
  let running = false;
  let tickInFlight = false;

  async function alignDirs() {
    for (const dir of getWatchedDirs()) {
      const entries = await listDir(dir);
      if (entries) dirSigs.set(dir, dirSignature(entries));
    }
  }

  async function poll() {
    if (tickInFlight) return;
    tickInFlight = true;
    try {
      if (shouldRefreshTree()) {
        let treeChanged = false;
        for (const dir of getWatchedDirs()) {
          const entries = await listDir(dir);
          if (entries === null) continue;
          const sig = dirSignature(entries);
          if (!dirSigs.has(dir)) {
            dirSigs.set(dir, sig);
          } else if (dirSigs.get(dir) !== sig) {
            dirSigs.set(dir, sig);
            treeChanged = true;
          }
        }
        if (treeChanged) onTreeChange();
      }

      const open = getOpenFiles();
      const openPaths = new Set(open.map((f) => f.path));
      for (const path of [...fileDisk.keys()]) {
        if (!openPaths.has(path)) fileDisk.delete(path);
      }

      for (const file of open) {
        const disk = await readFile(file.path);
        // First sight: compare against the editor's last-known saved bytes so a
        // change that landed before the first poll is not missed.
        const prevDisk = fileDisk.has(file.path) ? fileDisk.get(file.path) : file.saved;
        fileDisk.set(file.path, disk);
        if (prevDisk === disk) continue;
        const kind = classifyDiskChange({
          saved: file.saved,
          dirty: file.dirty,
          disk,
        });
        if (kind === "unchanged") continue;
        onFileEvent({ path: file.path, kind, disk });
      }
    } finally {
      tickInFlight = false;
    }
  }

  function scheduleNext() {
    timer = schedule(() => {
      return poll().finally(() => {
        if (running) scheduleNext();
      });
    }, intervalMs);
  }

  return {
    start() {
      if (running) return;
      running = true;
      scheduleNext();
    },
    stop() {
      running = false;
      if (timer != null) unschedule(timer);
      timer = null;
    },
    /** Keep signatures in sync after UI-driven tree refreshes. */
    alignDirs,
  };
}
