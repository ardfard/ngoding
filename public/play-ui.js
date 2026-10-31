import { FitAddon, init, Terminal } from "/vendor/ghostty-web/ghostty-web.js";
import { findBuild, resolveBuild } from "./build-cmd.js";
import { createEditor } from "./editor.js";
import { createFileTree } from "./file-tree.js";
import { languageFromPath } from "./languages.js";

const $ = (id) => document.getElementById(id);
const BUILD_KEY = "ngoding.play.build";

/** Single-quoted path for POSIX shell `cd`. */
function shellQuote(path) {
  return `'${path.replace(/'/g, `'\\''`)}'`;
}

export async function startPlay(vm) {
  let ready = "";
  let booted = false;
  /** @type {{ command: string, dir: string } | null} */
  let detectedBuild = null;
  // Non-empty only when the user explicitly set a build override (stored in localStorage).
  let buildUserOverride = localStorage.getItem(BUILD_KEY) ?? "";

  function setStatus(text, cls = "") {
    $("status").textContent = text;
    $("status").className = `status ${cls}`;
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
    $("build-btn").disabled = !booted || resolved.source === "none";
  }

  let vimOn = localStorage.getItem("ngoding.vim") === "on";
  const editor = createEditor({
    parent: $("editor"),
    vm,
    vim: vimOn,
    onDocChange: () => renderTabs(),
    onStatus: (text, cls) => {
      $("editor-status").textContent = text;
      $("editor-status").className = cls;
      renderTabs();
    },
  });

  const tree = createFileTree({
    root: "/home/user",
    mount: $("tree"),
    vm,
    onOpen: async (path) => {
      const ok = await editor.openPath(path);
      if (!ok) editor.closePath(path);
      renderTabs();
      await updateBuild();
    },
    onStatus: (msg) => setStatus(msg, "error"),
    onPathRemoved: (path) => editor.closePath(path),
  });

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
    const dir = path ? path.slice(0, path.lastIndexOf("/")) || "/home/user" : "/home/user";
    detectedBuild = await findBuild(dir, async (d) => {
      const entries = await vm.listDir(d);
      return entries?.map((e) => e.name) ?? [];
    });
    syncBuildInput();
    applyBuildControls();
    const lang = path ? languageFromPath(path) : null;
    $("editor-lang").textContent = lang ? lang.label : "";
  }

  function runBuild() {
    const resolved = resolveBuild({ override: buildOverrideForResolve(), detected: detectedBuild });
    if (resolved.source === "none") return;
    const dir = resolved.dir ?? "/home/user";
    vm.type(`cd ${shellQuote(dir)} && ${resolved.command}\n`);
  }

  async function reset() {
    if (!confirm("Reset Play sandbox? This deletes your saved Play VM state.")) return;
    await vm.reset();
    location.reload();
  }

  let editorShare = Number(localStorage.getItem("ngoding.split"));
  if (!(editorShare > 0.15 && editorShare < 0.85)) editorShare = 0.6;

  function setEditorShare(share) {
    editorShare = Math.min(0.85, Math.max(0.15, share));
    $("workspace").style.setProperty("--editor-share", editorShare);
  }

  {
    const split = $("split");
    let dragging = false;
    split.onpointerdown = (e) => {
      dragging = true;
      split.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    split.onpointermove = (e) => {
      if (!dragging) return;
      const ws = $("workspace").getBoundingClientRect();
      const toolH = $("toolbar").offsetHeight + $("editor-tabs").offsetHeight;
      const avail = ws.height - toolH - split.offsetHeight;
      if (avail > 0) setEditorShare((e.clientY - ws.top - toolH) / avail);
    };
    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
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

  addEventListener("beforeunload", (e) => editor.hasUnsaved() && e.preventDefault());

  setEditorShare(editorShare);

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
    .boot({ term, problems: [], inputs: {}, session: "play", saveKey: "vm:play", setStatus, onSave })
    .then(async ({ restored }) => {
      ready = restored ? "ready (restored)" : `ready (${((performance.now() - t0) / 1000).toFixed(1)}s)`;
      setStatus(ready, "ready");
      booted = true;
      for (const id of ["editor-save", "editor-run", "build-cmd", "tree-new-file", "tree-new-folder", "tree-rename", "tree-delete"]) {
        $(id).disabled = false;
      }
      await tree.refresh();
      await updateBuild();
      term.focus();
    })
    .catch((e) => {
      console.error(e);
      setStatus("boot failed", "error");
      term.write(`\n\x1b[31mBoot failed: ${e.message ?? e}\x1b[0m\n`);
    });

  window.ngoding = { vm, term, editor, tree };
}
