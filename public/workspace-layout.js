// Editor + shell workspace shared by /exercise and /learn: the layout picker
// (editor above or beside the shell, or only one of them) and the draggable
// split between them. Expects the #workspace, #toolbar, #layout-toggle,
// #layout-menu and #split elements from those pages.

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

const $ = (id) => document.getElementById(id);

/**
 * Restores the saved layout and wires up its controls. onChange(mode) runs
 * after every layout change, including the initial one.
 * @returns {{ readonly mode: string, set(mode: string): void }}
 */
export function createWorkspaceLayout({ onChange = () => {} } = {}) {
  let mode = localStorage.getItem("ngoding.layout");
  if (mode === "split") mode = "vertical";
  if (!LAYOUTS.includes(mode)) {
    mode = localStorage.getItem("ngoding.editor") === "off" ? "shell" : "vertical";
  }
  let editorShare = Number(localStorage.getItem("ngoding.split"));
  if (!(editorShare > 0.15 && editorShare < 0.85)) editorShare = 0.6;
  let menuOpen = false;

  function closeMenu() {
    menuOpen = false;
    $("layout-menu").hidden = true;
    $("layout-toggle").setAttribute("aria-expanded", "false");
  }

  function set(next) {
    mode = next;
    localStorage.setItem("ngoding.layout", next);
    localStorage.removeItem("ngoding.editor");
    const ws = $("workspace");
    ws.classList.remove(...LAYOUTS.map((m) => `layout-${m}`), "layout-split");
    ws.classList.add(`layout-${next}`);
    $("layout-toggle").innerHTML = LAYOUT_ICON[next];
    $("layout-toggle").title = LAYOUT_TITLE[next];
    for (const btn of $("layout-menu").querySelectorAll("[data-layout]")) {
      btn.setAttribute("aria-checked", btn.dataset.layout === next);
    }
    $("split").setAttribute("aria-orientation", next === "horizontal" ? "vertical" : "horizontal");
    closeMenu();
    onChange(next);
  }

  function setEditorShare(share) {
    editorShare = Math.min(0.85, Math.max(0.15, share));
    $("workspace").style.setProperty("--editor-share", editorShare);
  }

  $("layout-toggle").onclick = (e) => {
    e.stopPropagation();
    menuOpen = !menuOpen;
    $("layout-menu").hidden = !menuOpen;
    $("layout-toggle").setAttribute("aria-expanded", menuOpen ? "true" : "false");
  };
  for (const btn of $("layout-menu").querySelectorAll("[data-layout]")) {
    btn.onclick = () => set(btn.dataset.layout);
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });
  document.addEventListener("click", (e) => {
    if (menuOpen && !e.target.closest(".layout-picker")) closeMenu();
  });

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
    const toolH = $("toolbar").offsetHeight;
    if (mode === "horizontal") {
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
  split.onkeydown = (e) => {
    const step = e.shiftKey ? 0.1 : 0.05;
    const horizontal = mode === "horizontal";
    if (e.key === (horizontal ? "ArrowLeft" : "ArrowUp")) setEditorShare(editorShare - step);
    else if (e.key === (horizontal ? "ArrowRight" : "ArrowDown")) setEditorShare(editorShare + step);
    else return;
    e.preventDefault();
    localStorage.setItem("ngoding.split", String(editorShare));
  };

  setEditorShare(editorShare);
  set(mode);
  return {
    get mode() {
      return mode;
    },
    set,
  };
}
