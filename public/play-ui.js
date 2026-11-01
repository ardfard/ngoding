import { FitAddon, init, Terminal } from "/vendor/ghostty-web/ghostty-web.js";
import { findBuild, resolveBuild } from "./build-cmd.js";
import { createEditor } from "./editor.js";
import { createFileTree } from "./file-tree.js";
import { createFsSync } from "./fs-sync.js";
import { languageFromPath, playgroundTemplate } from "./languages.js";
import {
  LEGACY_PLAY_SAVE_KEY,
  getSession,
  migrateLegacyPlayMeta,
  playSaveKey,
  touchSession,
} from "./play-sessions.js";
import * as store from "./store.js";

const $ = (id) => document.getElementById(id);
const BUILD_KEY = "ngoding.play.build";
const WORKSPACE = "/home/user/workspace";

const LAYOUTS = ["vertical", "horizontal", "editor", "shell"];
const LAYOUT_TITLE = {
  vertical: "Layout: Vertical — editor above shell",
  horizontal: "Layout: Horizontal — editor beside shell",
  editor: "Layout: Editor only — hide the shell",
  shell: "Layout: Shell only — hide the editor",
};
/* Lucide rows-2 / columns-2 / square / square-terminal — matches design/main.pen */
const LAYOUT_ICON = {
  vertical: `<svg class="tb-icon layout-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 12h18"/></svg>`,
  horizontal: `<svg class="tb-icon layout-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 3v18"/></svg>`,
  editor: `<svg class="tb-icon layout-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/></svg>`,
  shell: `<svg class="tb-icon layout-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="m7 11 2-2-2-2"/><path d="M11 13h4"/></svg>`,
};

/** Single-quoted path for POSIX shell `cd`. */
function shellQuote(path) {
  return `'${path.replace(/'/g, `'\\''`)}'`;
}

export async function startPlay(vm) {
  const params = new URLSearchParams(location.search);
  let sessionId = params.get("s");
  const legacy = await store.get(LEGACY_PLAY_SAVE_KEY);
  const migrated = migrateLegacyPlayMeta(!!legacy);
  if (migrated && legacy) {
    await store.put(playSaveKey(migrated.id), legacy);
    await store.del(LEGACY_PLAY_SAVE_KEY);
    if (!sessionId) sessionId = migrated.id;
  }
  if (!sessionId || !getSession(sessionId)) {
    location.replace("/");
    return;
  }
  touchSession(sessionId);

  let ready = "";
  let booted = false;
  /** @type {{ command: string, dir: string } | null} */
  let detectedBuild = null;
  // Non-empty only when the user explicitly set a build override (stored in localStorage).
  let buildUserOverride = localStorage.getItem(BUILD_KEY) ?? "";

  function setStatus(text, cls = "") {
    $("status").textContent = text;
    $("status").parentElement.className = `status status-pill ${cls}`;
  }

  function setSidebarOpen(open) {
    document.body.classList.toggle("sidebar-open", open);
    const btn = $("sidebar-toggle");
    if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
    const backdrop = $("sidebar-backdrop");
    if (backdrop) backdrop.hidden = !open;
  }

  function buildOverrideForResolve() {
    return buildUserOverride.trim() ? buildUserOverride : "";
  }

  function syncBuildInput() {
    const input = $("build-cmd");
    if (document.activeElement === input) return;
    input.value = buildUserOverride.trim()
      ? buildUserOverride
      : (detectedBuild?.command ?? "");
    input.placeholder = detectedBuild ? "" : "build command";
  }

  function applyBuildControls() {
    const resolved = resolveBuild({ override: buildOverrideForResolve(), detected: detectedBuild });
    // Keep Build visible like Save once the VM is up; empty command is a no-op on click.
    $("build-btn").disabled = !booted;
    $("build-btn").title = resolved.source === "none"
      ? "Set a build command to run in the terminal"
      : "Run build in terminal";
  }

  let vimOn = localStorage.getItem("ngoding.vim") === "on";
  const editor = createEditor({
    parent: $("editor"),
    vm,
    vim: vimOn,
    onDocChange: () => renderTabs(),
    onConflictChange: () => renderConflict(),
    onStatus: (text, cls) => {
      $("editor-status").textContent = text;
      $("editor-status").className = cls;
      renderTabs();
    },
  });

  /** Set after createFsSync so tree refreshes can realign dir signatures. */
  let fsSync = null;

  const tree = createFileTree({
    root: WORKSPACE,
    mount: $("tree"),
    vm,
    onOpen: async (path) => {
      const ok = await editor.openPath(path);
      if (!ok) editor.closePath(path);
      renderTabs();
      renderConflict();
      await updateBuild();
    },
    onStatus: (msg) => setStatus(msg, "error"),
    onPathRemoved: (path) => editor.closePath(path),
    onRefresh: () => fsSync?.alignDirs(),
  });

  fsSync = createFsSync({
    intervalMs: 1000,
    listDir: (path) => vm.listDir(path),
    readFile: (path) => vm.readFile(path),
    getWatchedDirs: () => tree.getExpandedPaths(),
    getOpenFiles: () => editor.getOpenFileStates(),
    shouldRefreshTree: () => !tree.isEditing(),
    onTreeChange: () => {
      tree.refresh();
    },
    onFileEvent: (ev) => {
      editor.handleDiskEvent(ev);
      renderTabs();
      renderConflict();
      if (ev.kind === "deleted") updateBuild();
    },
  });

  function renderConflict() {
    const banner = $("editor-conflict");
    const conflict = editor.getConflict();
    if (!conflict) {
      banner.hidden = true;
      return;
    }
    const name = conflict.path.slice(conflict.path.lastIndexOf("/") + 1);
    $("editor-conflict-msg").textContent = conflict.disk == null
      ? `${name} was deleted on disk.`
      : `${name} changed on disk.`
    ;
    banner.hidden = false;
  }

  function renderTabs() {
    const tabs = $("editor-tabs");
    const paths = editor.getOpenPaths();
    const current = editor.currentPath();
    tabs.replaceChildren(
      ...paths.map((path) => {
        const wrap = document.createElement("div");
        wrap.className = "editor-tab";
        if (path === current) wrap.classList.add("active");

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "editor-tab-label";
        const name = path.slice(path.lastIndexOf("/") + 1);
        btn.textContent = name;
        btn.onclick = () => editor.openPath(path).then(async () => {
          renderTabs();
          await updateBuild();
        });
        wrap.appendChild(btn);

        if (editor.isDirtyPath(path)) {
          const mark = document.createElement("span");
          mark.className = "tab-dirty";
          mark.textContent = "•";
          wrap.insertBefore(mark, btn);
        }

        const close = document.createElement("button");
        close.type = "button";
        close.className = "editor-tab-close";
        close.textContent = "×";
        close.title = "Close";
        close.onclick = (e) => {
          e.stopPropagation();
          editor.closePath(path);
          renderTabs();
          updateBuild();
        };
        wrap.appendChild(close);
        return wrap;
      }),
    );
  }

  async function updateBuild() {
    const path = editor.currentPath();
    const dir = path ? path.slice(0, path.lastIndexOf("/")) || WORKSPACE : WORKSPACE;
    detectedBuild = await findBuild(dir, async (d) => {
      const entries = await vm.listDir(d);
      return entries?.map((e) => e.name) ?? [];
    }, WORKSPACE);
    syncBuildInput();
    applyBuildControls();
    const lang = path ? languageFromPath(path) : null;
    $("editor-lang").textContent = lang ? lang.label : "";
  }

  function runBuild() {
    const resolved = resolveBuild({ override: buildOverrideForResolve(), detected: detectedBuild });
    if (resolved.source === "none") return;
    const dir = resolved.dir ?? WORKSPACE;
    vm.type(`cd ${shellQuote(dir)} && ${resolved.command}\n`);
  }

  /** Drop problem dirs from the shared image; ensure a clean Play workspace. */
  async function prepareWorkspace() {
    await vm.rm("/home/user/challenge");
    await vm.rm("/home/user/output");
    if (!(await vm.mkdir(WORKSPACE))) throw new Error("could not create workspace");
    vm.type(`cd ${shellQuote(WORKSPACE)}\n`);
  }

  async function ensureParentDirs(absPath) {
    if (!absPath.startsWith(`${WORKSPACE}/`)) return;
    const parts = absPath.slice(WORKSPACE.length + 1).split("/");
    parts.pop();
    let cur = WORKSPACE;
    for (const part of parts) {
      cur += `/${part}`;
      const parent = cur.slice(0, cur.lastIndexOf("/")) || "/";
      const entries = await vm.listDir(parent);
      if (entries?.some((e) => e.name === part && e.type === "dir")) continue;
      if (!(await vm.mkdir(cur))) throw new Error(`could not create ${cur}`);
    }
  }

  /** Seed hello-world boilerplate once on a fresh (non-restored) session. */
  async function seedTemplate(templateId) {
    const tpl = playgroundTemplate(templateId);
    for (const file of tpl.files) {
      const abs = `${WORKSPACE}/${file.path}`;
      await ensureParentDirs(abs);
      if (!(await vm.writeFile(abs, file.content))) {
        throw new Error(`could not write ${abs}`);
      }
    }
    if (tpl.open) {
      const abs = `${WORKSPACE}/${tpl.open}`;
      await editor.openPath(abs);
      renderTabs();
    }
  }

  async function reset() {
    if (!confirm("Reset Play sandbox? This deletes your saved Play VM state.")) return;
    await vm.reset();
    location.reload();
  }

  let layout = localStorage.getItem("ngoding.layout");
  if (layout === "split") layout = "vertical";
  if (!LAYOUTS.includes(layout)) layout = "vertical";
  let editorShare = Number(localStorage.getItem("ngoding.split"));
  if (!(editorShare > 0.15 && editorShare < 0.85)) editorShare = 0.6;
  let layoutMenuOpen = false;

  function closeLayoutMenu() {
    layoutMenuOpen = false;
    $("layout-menu").hidden = true;
    $("layout-toggle").setAttribute("aria-expanded", "false");
  }

  function setLayout(mode) {
    layout = mode;
    localStorage.setItem("ngoding.layout", mode);
    const ws = $("workspace");
    ws.classList.remove(...LAYOUTS.map((m) => `layout-${m}`), "layout-split");
    ws.classList.add(`layout-${mode}`);
    $("layout-toggle").innerHTML = LAYOUT_ICON[mode];
    $("layout-toggle").title = LAYOUT_TITLE[mode];
    for (const btn of $("layout-menu").querySelectorAll("[data-layout]")) {
      btn.setAttribute("aria-checked", btn.dataset.layout === mode);
    }
    $("split").setAttribute("aria-orientation", mode === "horizontal" ? "vertical" : "horizontal");
    closeLayoutMenu();
  }

  function setEditorShare(share) {
    editorShare = Math.min(0.85, Math.max(0.15, share));
    $("workspace").style.setProperty("--editor-share", editorShare);
  }

  {
    const split = $("split");
    let dragging = false;
    split.onpointerdown = (e) => {
      dragging = true;
      split.classList.add("dragging");
      split.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    split.onpointermove = (e) => {
      if (!dragging) return;
      const ws = $("workspace").getBoundingClientRect();
      const toolH = $("toolbar").offsetHeight + $("editor-tabs").offsetHeight;
      if (layout === "horizontal") {
        const avail = ws.width - split.offsetWidth;
        if (avail > 0) setEditorShare((e.clientX - ws.left) / avail);
      } else {
        const avail = ws.height - toolH - split.offsetHeight;
        if (avail > 0) setEditorShare((e.clientY - ws.top - toolH) / avail);
      }
    };
    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      split.classList.remove("dragging");
      localStorage.setItem("ngoding.split", String(editorShare));
    };
    split.onpointerup = endDrag;
    split.onpointercancel = endDrag;
  }

  $("build-cmd").value = buildUserOverride.trim()
    ? buildUserOverride
    : "";
  $("build-cmd").oninput = () => {
    buildUserOverride = $("build-cmd").value;
    localStorage.setItem(BUILD_KEY, buildUserOverride);
    applyBuildControls();
  };
  $("build-cmd").onblur = () => syncBuildInput();

  $("reset").onclick = reset;
  $("editor-save").onclick = () => editor.save();
  $("editor-run").onclick = () => editor.run();
  $("build-btn").onclick = runBuild;
  $("vim-toggle").setAttribute("aria-pressed", vimOn);
  $("vim-toggle").onclick = () => {
    vimOn = !vimOn;
    localStorage.setItem("ngoding.vim", vimOn ? "on" : "off");
    $("vim-toggle").setAttribute("aria-pressed", vimOn);
    editor.setVim(vimOn);
    editor.focus();
  };
  $("tree-new-file").onclick = () => tree.newFile();
  $("tree-new-folder").onclick = () => tree.newFolder();
  $("tree-rename").onclick = () => tree.rename();
  $("tree-delete").onclick = () => tree.remove();
  $("conflict-keep").onclick = () => {
    editor.keepConflict();
    renderConflict();
    renderTabs();
  };
  $("conflict-reload").onclick = () => {
    editor.reloadConflict();
    renderConflict();
    renderTabs();
    updateBuild();
  };
  $("sidebar-toggle").onclick = () =>
    setSidebarOpen(!document.body.classList.contains("sidebar-open"));
  $("sidebar-backdrop")?.addEventListener("click", () => setSidebarOpen(false));
  $("layout-toggle").onclick = (e) => {
    e.stopPropagation();
    layoutMenuOpen = !layoutMenuOpen;
    $("layout-menu").hidden = !layoutMenuOpen;
    $("layout-toggle").setAttribute("aria-expanded", layoutMenuOpen ? "true" : "false");
  };
  for (const btn of $("layout-menu").querySelectorAll("[data-layout]")) {
    btn.onclick = () => setLayout(btn.dataset.layout);
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      setSidebarOpen(false);
      closeLayoutMenu();
    }
  });
  document.addEventListener("click", (e) => {
    if (layoutMenuOpen && !e.target.closest(".layout-picker")) closeLayoutMenu();
  });

  addEventListener("beforeunload", (e) => editor.hasUnsaved() && e.preventDefault());

  setEditorShare(editorShare);
  setLayout(layout);

  await init();
  const term = new Terminal({
    cursorBlink: true,
    convertEol: true,
    fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
    theme: { background: "#000000" },
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.open($("terminal"));
  fit.fit();
  fit.observeResize();

  const onSave = ({ savedAt }) =>
    setStatus(`${ready} · saved ${new Date(savedAt).toLocaleTimeString([], { timeStyle: "short" })}`, "ready");

  const t0 = performance.now();
  vm
    .boot({
      term,
      problems: [],
      inputs: {},
      session: sessionId,
      saveKey: playSaveKey(sessionId),
      setStatus,
      onSave,
    })
    .then(async ({ restored }) => {
      await prepareWorkspace();
      const session = getSession(sessionId);
      if (!restored && session?.template && session.template !== "blank") {
        await seedTemplate(session.template);
      }
      ready = restored ? "ready (restored)" : `ready (${((performance.now() - t0) / 1000).toFixed(1)}s)`;
      setStatus(ready, "ready");
      booted = true;
      for (const id of ["editor-save", "editor-run", "build-cmd", "tree-new-file", "tree-new-folder", "tree-rename", "tree-delete"]) {
        $(id).disabled = false;
      }
      await tree.refresh();
      await updateBuild();
      fsSync.start();
      term.focus();
    })
    .catch((e) => {
      console.error(e);
      setStatus("boot failed", "error");
      term.write(`\n\x1b[31mBoot failed: ${e.message ?? e}\x1b[0m\n`);
    });

  window.ngoding = { vm, term, editor, tree, fsSync };
}
