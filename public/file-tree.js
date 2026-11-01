// Playground file tree (VM-backed).

const join = (parent, name) => `${parent.replace(/\/$/, "")}/${name.replace(/^\//, "")}`;

/* Lucide folder / folder-open / file-code — matches design/main.pen tree */
const ICON_ATTR = `class="tree-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`;
const ICON_FOLDER = `<svg ${ICON_ATTR}><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9l-.81-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>`;
const ICON_FOLDER_OPEN = `<svg ${ICON_ATTR}><path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/></svg>`;
const ICON_FILE = `<svg ${ICON_ATTR}><path d="M10 12.5 8 15l2 2.5"/><path d="m14 12.5 2 2.5-2 2.5"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/></svg>`;

function parentDir(path, root) {
  if (!path || path === root) return root;
  const i = path.lastIndexOf("/");
  return i <= 0 ? root : path.slice(0, i) || root;
}

function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function createFileTree({ root, mount, vm, onOpen, onStatus, onPathRemoved }) {
  const expanded = new Set([root]);
  /** @type {{ path: string, type: "dir"|"file" } | null} */
  let selected = { path: root, type: "dir" };
  let renderGen = 0;

  function setStatus(msg) {
    onStatus?.(msg);
  }

  function select(entry) {
    selected = entry;
    mount.querySelectorAll(".tree-item.selected").forEach((el) => el.classList.remove("selected"));
    const el = mount.querySelector(`[data-path="${CSS.escape(entry.path)}"]`);
    el?.classList.add("selected");
  }

  async function render() {
    const gen = ++renderGen;
    mount.replaceChildren();
    const ul = document.createElement("ul");
    ul.className = "tree-root";
    mount.appendChild(ul);
    await renderDir(ul, root, gen);
  }

  async function renderDir(ul, dirPath, gen) {
    const entries = await vm.listDir(dirPath);
    if (gen !== renderGen) return;
    if (entries === null) {
      setStatus(`Could not list ${dirPath.replace(/^\/home\/user/, "~")}`);
      return;
    }
    for (const ent of sortEntries(entries)) {
      const path = join(dirPath, ent.name);
      const li = document.createElement("li");
      li.className = "tree-item";
      li.dataset.path = path;
      li.dataset.type = ent.type;
      if (selected?.path === path) li.classList.add("selected");

      const row = document.createElement("div");
      row.className = "tree-row";

      if (ent.type === "dir") {
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "tree-toggle";
        toggle.setAttribute("aria-expanded", expanded.has(path) ? "true" : "false");
        toggle.textContent = expanded.has(path) ? "▾" : "▸";
        toggle.onclick = (e) => {
          e.stopPropagation();
          if (expanded.has(path)) expanded.delete(path);
          else expanded.add(path);
          render();
        };
        row.appendChild(toggle);
      } else {
        const spacer = document.createElement("span");
        spacer.className = "tree-toggle-spacer";
        row.appendChild(spacer);
      }

      const icon = document.createElement("span");
      icon.className = "tree-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.innerHTML = ent.type === "dir"
        ? (expanded.has(path) ? ICON_FOLDER_OPEN : ICON_FOLDER)
        : ICON_FILE;
      row.appendChild(icon);

      const label = document.createElement("button");
      label.type = "button";
      label.className = "tree-label";
      label.textContent = ent.name;
      label.onclick = () => {
        select({ path, type: ent.type });
        if (ent.type === "file") onOpen(path);
      };
      row.appendChild(label);
      li.appendChild(row);

      if (ent.type === "dir" && expanded.has(path)) {
        const childUl = document.createElement("ul");
        li.appendChild(childUl);
        await renderDir(childUl, path, gen);
      }
      ul.appendChild(li);
    }
  }

  async function refresh() {
    await render();
  }

  function targetParent() {
    if (!selected) return root;
    return selected.type === "dir" ? selected.path : parentDir(selected.path, root);
  }

  async function newFile() {
    const parent = targetParent();
    const name = prompt("New file name");
    if (!name?.trim()) return;
    const path = join(parent, name.trim());
    if (!(await vm.writeFile(path, ""))) {
      setStatus("Could not create file");
      return;
    }
    expanded.add(parent);
    await refresh();
    select({ path, type: "file" });
    onOpen(path);
  }

  async function newFolder() {
    const parent = targetParent();
    const name = prompt("New folder name");
    if (!name?.trim()) return;
    const path = join(parent, name.trim());
    if (!(await vm.mkdir(path))) {
      setStatus("Could not create folder");
      return;
    }
    expanded.add(parent);
    expanded.add(path);
    await refresh();
    select({ path, type: "dir" });
  }

  async function rename() {
    if (!selected) {
      setStatus("Select a file or folder");
      return;
    }
    const base = selected.path.slice(selected.path.lastIndexOf("/") + 1);
    const name = prompt("Rename to", base);
    if (!name?.trim() || name.trim() === base) return;
    const dest = join(parentDir(selected.path, root), name.trim());
    if (!(await vm.mv(selected.path, dest))) {
      setStatus("Rename failed");
      return;
    }
    onPathRemoved?.(selected.path);
    expanded.delete(selected.path);
    expanded.add(dest);
    selected = { path: dest, type: selected.type };
    await refresh();
  }

  async function remove() {
    if (!selected || selected.path === root) {
      setStatus("Select a file or folder to delete");
      return;
    }
    const label = selected.path.replace(/^\/home\/user/, "~");
    if (!confirm(`Delete ${label}?`)) return;
    const path = selected.path;
    const parent = parentDir(path, root);
    if (!(await vm.rm(path))) {
      setStatus("Delete failed");
      return;
    }
    onPathRemoved?.(path);
    selected = { path: parent, type: "dir" };
    await refresh();
  }

  return { refresh, newFile, newFolder, rename, remove };
}
