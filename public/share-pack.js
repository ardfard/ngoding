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
      if (e.type === "d") {
        await walk(path, rel);
      } else if (e.type === "f") {
        const text = await vm.readFile(path);
        if (text == null) continue;
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
