export const BUILD_MARKERS = [
  { file: "Cargo.toml", command: "cargo build" },
  { file: "go.mod", command: "go build ." },
  { file: "Makefile", command: "make" },
  { file: "uv.lock", command: "uv sync" },
  { file: "pyproject.toml", command: "uv sync" },
];

export function detectBuildInListing(names) {
  const set = new Set(names);
  for (const m of BUILD_MARKERS) {
    if (set.has(m.file)) return { command: m.command, marker: m.file };
  }
  return null;
}

export function resolveBuild({ override, detected }) {
  const o = (override ?? "").trim();
  if (o) return { command: o, dir: null, source: "override" };
  if (detected) return { command: detected.command, dir: detected.dir, source: "detected" };
  return { command: "", dir: null, source: "none" };
}

/** Walk from startDir up to /home/user inclusive. listDir(path) -> Promise<string[]>. */
export async function findBuild(startDir, listDir) {
  const root = "/home/user";
  let dir = (startDir || root).replace(/\/$/, "") || root;
  if (dir !== root && !dir.startsWith(root + "/")) dir = root;
  for (;;) {
    const names = await listDir(dir);
    const hit = detectBuildInListing(names ?? []);
    if (hit) return { command: hit.command, dir, marker: hit.marker };
    if (dir === root) return null;
    dir = dir.slice(0, dir.lastIndexOf("/")) || root;
    if (dir.length < root.length) return null;
  }
}
