const MAX_FILE_BYTES = 1_000_000;

export function normalizeSharePath(root, rel) {
  if (typeof rel !== "string" || !rel || rel.includes("\0")) return null;
  const parts = rel.split("/").filter((p) => p && p !== ".");
  if (parts.some((p) => p === "..")) return null;
  const base = root.replace(/\/+$/, "");
  return `${base}/${parts.join("/")}`;
}

export function applySharePackPlan(pack) {
  if (!pack || pack.version !== 1 || !Array.isArray(pack.files)) return [];
  const root = typeof pack.root === "string" && pack.root ? pack.root : "/home/user";
  const out = [];
  for (const f of pack.files) {
    if (!f || typeof f.path !== "string" || typeof f.text !== "string") continue;
    const path = normalizeSharePath(root, f.path);
    if (!path) continue;
    out.push({ path, text: f.text });
  }
  return out;
}

/**
 * A read-only stand-in for the VM's file calls (listDir/readFile/writeFile),
 * backed by a share pack. Lets the file tree and editor show a share without booting.
 */
export function createPackFs(pack) {
  const files = new Map();
  /** dir path -> Map(name -> "dir" | "file"), in pack order */
  const dirs = new Map();
  const trim = (path) => path.replace(/\/+$/, "") || "/";

  for (const { path, text } of applySharePackPlan(pack)) {
    files.set(path, text);
    let child = path;
    let type = "file";
    while (child !== "/") {
      const i = child.lastIndexOf("/");
      const dir = child.slice(0, i) || "/";
      if (!dirs.has(dir)) dirs.set(dir, new Map());
      const entries = dirs.get(dir);
      const name = child.slice(i + 1);
      if (entries.has(name)) break;
      entries.set(name, type);
      child = dir;
      type = "dir";
    }
  }

  return {
    hasDir: (path) => dirs.has(trim(path)),
    async listDir(path) {
      const entries = dirs.get(trim(path));
      return entries ? [...entries].map(([name, type]) => ({ type, name })) : null;
    },
    async readFile(path) {
      return files.get(path) ?? null;
    },
    async writeFile() {
      return false;
    },
  };
}

/**
 * Recursively collect text files under root via vm listDir/readFile.
 */
export async function collectSharePack(vm, { root = "/home/user" } = {}) {
  const files = [];
  let skipped = 0;

  async function walk(dir, relBase) {
    const entries = await vm.listDir(dir);
    if (!entries) return;
    for (const e of entries) {
      const rel = relBase ? `${relBase}/${e.name}` : e.name;
      const path = `${dir.replace(/\/+$/, "")}/${e.name}`;
      if (e.type === "dir") {
        await walk(path, rel);
      } else if (e.type === "file") {
        const text = await vm.readFile(path);
        if (text == null || text.slice(0, 8192).includes("\0")) continue;
        if (new TextEncoder().encode(text).length > MAX_FILE_BYTES) {
          skipped++;
          continue;
        }
        files.push({ path: rel, text });
      }
    }
  }

  await walk(root, "");
  return { pack: { version: 1, root, files }, skipped };
}
