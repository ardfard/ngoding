// Shared-link viewer (/s/<id>): the share's files in a read-only editor, no VM.
// "Fork to edit" copies them into a new playground session.
import { forkShare } from "./cloud-api.js";
import { createEditor } from "./editor.js";
import { createFileTree } from "./file-tree.js";
import { languageFromPath } from "./languages.js";
import { createSession } from "./play-sessions.js";
import { createPackFs } from "./share-pack.js";

const $ = (id) => document.getElementById(id);
const HOME = "/home/user";
const WORKSPACE = `${HOME}/workspace`;

const shareId = location.pathname.split("/").filter(Boolean)[1] || "";

function setStatus(state, text) {
  $("status").dataset.state = state;
  $("status").querySelector(".vm-state").textContent = text;
}

function setSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", open);
  $("sidebar-toggle").setAttribute("aria-expanded", open ? "true" : "false");
  $("sidebar-backdrop").hidden = !open;
}

async function start() {
  if (!shareId) return setStatus("error", "missing share id");
  let pack;
  try {
    ({ pack } = await forkShare(shareId));
  } catch (e) {
    console.error(e);
    return setStatus("error", /not found|expired/.test(e.message) ? "share not found or expired" : "could not load share");
  }
  const fs = createPackFs(pack);

  let vimOn = localStorage.getItem("ngoding.vim") === "on";
  const editor = createEditor({
    parent: $("editor"),
    vm: fs,
    vim: vimOn,
    readOnly: true,
    onStatus: (text, cls) => {
      $("editor-status").textContent = text;
      $("editor-status").className = cls;
    },
  });

  async function open(path) {
    if (!(await editor.openPath(path))) editor.closePath(path);
    const lang = editor.currentPath() ? languageFromPath(editor.currentPath()) : null;
    $("editor-lang").textContent = lang ? lang.label : "";
    renderTabs();
  }

  function renderTabs() {
    const current = editor.currentPath();
    $("editor-tabs").replaceChildren(
      ...editor.getOpenPaths().map((path) => {
        const wrap = document.createElement("div");
        wrap.className = "editor-tab";
        if (path === current) wrap.classList.add("active");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "editor-tab-label";
        btn.textContent = path.slice(path.lastIndexOf("/") + 1);
        btn.onclick = () => open(path);
        const close = document.createElement("button");
        close.type = "button";
        close.className = "editor-tab-close";
        close.textContent = "×";
        close.title = "Close";
        close.onclick = () => {
          editor.closePath(path);
          renderTabs();
        };
        wrap.append(btn, close);
        return wrap;
      }),
    );
  }

  const tree = createFileTree({
    root: fs.hasDir(WORKSPACE) ? WORKSPACE : HOME,
    mount: $("tree"),
    vm: fs,
    onOpen: open,
    onStatus: (msg) => setStatus("error", msg),
  });
  await tree.refresh();
  setStatus("ready", "shared");

  $("vim-toggle").setAttribute("aria-pressed", vimOn);
  $("vim-toggle").onclick = () => {
    vimOn = !vimOn;
    localStorage.setItem("ngoding.vim", vimOn ? "on" : "off");
    $("vim-toggle").setAttribute("aria-pressed", vimOn);
    editor.setVim(vimOn);
    editor.focus();
  };
  $("sidebar-toggle").onclick = () => setSidebarOpen(!document.body.classList.contains("sidebar-open"));
  $("sidebar-backdrop").onclick = () => setSidebarOpen(false);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setSidebarOpen(false);
  });

  $("fork-btn").disabled = false;
  $("fork-btn").onclick = () => {
    const session = createSession(Date.now(), { template: "blank" });
    location.href = `/play?s=${encodeURIComponent(session.id)}&fork=${encodeURIComponent(shareId)}`;
  };
}

start().catch((e) => {
  console.error(e);
  setStatus("error", "could not reach the server");
});
