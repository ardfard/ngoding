// Exercise UI: problem picker, terminal, grading.
//
// The VM module provides { async boot(ctx), async readFile(path), async writeFile(path, text),
// type(text), save(), async reset() }:
//  - boot() wires ctx.term to the VM, writes ctx.inputs into it (unless it
//    resumed saved work), and resolves once the student's shell is usable
//  - readFile() returns the file's text, or null if it doesn't exist
//  - writeFile() writes a file owned by the student; type() sends keystrokes to the shell
//  - save() persists the student's work in the browser
//  - reset() discards whatever the VM persisted in the browser
//
// Problems, inputs and grading come from the server (/api/session, /api/grade),
// so expected answers never reach the browser.

import { FitAddon, init, Terminal } from "/vendor/ghostty-web/ghostty-web.js";
import { putExerciseProgress } from "./cloud-api.js";
import { createEditor } from "./editor.js";
import { pickExerciseProblem } from "./exercise-progress.js";
import { DEFAULT_LANG, LANG_STORAGE_KEY, LANGUAGES, languageById } from "./languages.js";
import * as store from "./store.js";
import { createVmStatus } from "./vm-persist.js";

const $ = (id) => document.getElementById(id);

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

async function post(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

function padNum(i) {
  return String(i + 1).padStart(2, "0");
}

export async function startApp(vm) {
  const { token, seed, problems, inputs } = await post("/api/session", {
    token: localStorage.getItem("ngoding.token"),
  });
  if (token !== localStorage.getItem("ngoding.token")) {
    localStorage.setItem("ngoding.token", token);
    localStorage.removeItem("ngoding.solved");
  }
  const solved = new Set(JSON.parse(localStorage.getItem("ngoding.solved") ?? "[]"));
  let current = pickExerciseProblem(problems, solved) ?? problems[0];
  const status = createVmStatus($("status"));
  let booted = false;
  let problemFilter = "";
  let menuOpen = false;

  {
    const legacy = await store.get("vm:problems");
    if (legacy && !(await store.get("vm:exercise"))) {
      await store.put("vm:exercise", legacy);
      await store.del("vm:problems");
    }
  }

  function setSidebarOpen(open) {
    document.body.classList.toggle("sidebar-open", open);
    const btn = $("sidebar-toggle");
    if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
    const backdrop = $("sidebar-backdrop");
    if (backdrop) backdrop.hidden = !open;
  }

  function closeProblemMenu() {
    menuOpen = false;
    $("problem-menu").hidden = true;
    $("problem-select").setAttribute("aria-expanded", "false");
    problemFilter = "";
    $("problem-filter").value = "";
  }

  function openProblemMenu() {
    menuOpen = true;
    $("problem-menu").hidden = false;
    $("problem-select").setAttribute("aria-expanded", "true");
    renderProblemList();
    $("problem-filter").focus();
  }

  function selectProblem(p) {
    current = p;
    $("result").textContent = "";
    $("result").className = "";
    closeProblemMenu();
    renderProblem();
    if (booted && layout !== "shell") editor.open(current);
  }

  function renderProblemList() {
    const q = problemFilter.trim().toLowerCase();
    const rows = problems
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => !q || p.title.toLowerCase().includes(q) || p.id.toLowerCase().includes(q));
    $("tabs").replaceChildren(
      ...rows.map(({ p, i }) => {
        const b = document.createElement("button");
        b.type = "button";
        b.setAttribute("role", "option");
        b.setAttribute("aria-selected", p === current);
        b.classList.toggle("solved", solved.has(p.id));
        b.innerHTML = `<span class="problem-num">${padNum(i)}</span><span class="problem-title">${p.title}</span>${
          solved.has(p.id) ? '<span class="solved-mark" aria-label="solved">✓</span>' : ""
        }`;
        b.onclick = () => selectProblem(p);
        return b;
      }),
    );
  }

  function renderProblem() {
    const idx = problems.indexOf(current);
    $("problem-select-num").textContent = padNum(idx);
    $("problem-select-title").textContent = current.title;
    const nSolved = problems.filter((p) => solved.has(p.id)).length;
    $("picker-count").textContent = `${nSolved} solved · ${problems.length} total`;
    $("picker-total").textContent = `${problems.length} problems`;
    $("problem").innerHTML = `<h2>${current.title}</h2>${current.description}`;
    if (menuOpen) renderProblemList();
  }

  async function check() {
    const p = current;
    $("check").disabled = true;
    $("result").className = "";
    $("result").textContent = "Reading output file…";
    try {
      const output = await vm.readFile(p.outputFile);
      const result = output === null
        ? { ok: false, message: `${p.outputFile.replace("/home/user", "~")} not found.` }
        : await post("/api/grade", { token, problemId: p.id, output });
      $("result").className = result.ok ? "ok" : "fail";
      $("result").textContent = (result.ok ? "✓ " : "✗ ") + result.message;
      if (result.ok) {
        solved.add(p.id);
        const list = [...solved];
        localStorage.setItem("ngoding.solved", JSON.stringify(list));
        putExerciseProgress(list).catch((err) => console.error(err));
        renderProblem();
      }
    } catch (e) {
      $("result").className = "fail";
      $("result").textContent = `Checker error: ${e.message ?? e}`;
    } finally {
      $("check").disabled = false;
    }
    vm.save();
  }

  async function reset() {
    if (!confirm("Delete all files in the VM and generate new inputs?")) return;
    localStorage.removeItem("ngoding.token");
    localStorage.removeItem("ngoding.solved");
    await vm.reset();
    location.reload();
  }

  let vimOn = localStorage.getItem("ngoding.vim") === "on";
  let lang = languageById(localStorage.getItem(LANG_STORAGE_KEY) ?? DEFAULT_LANG);
  const langSelect = $("editor-lang");
  langSelect.replaceChildren(
    ...LANGUAGES.map((l) => {
      const o = document.createElement("option");
      o.value = l.id;
      o.textContent = l.label;
      return o;
    }),
  );
  langSelect.value = lang.id;
  const editor = createEditor({
    vim: vimOn,
    language: lang.id,
    parent: $("editor"),
    vm,
    onStatus: (text, cls) => {
      $("editor-status").textContent = text;
      $("editor-status").className = cls;
    },
  });

  let layout = localStorage.getItem("ngoding.layout");
  if (layout === "split") layout = "vertical";
  if (!LAYOUTS.includes(layout)) {
    layout = localStorage.getItem("ngoding.editor") === "off" ? "shell" : "vertical";
  }
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
    localStorage.removeItem("ngoding.editor");
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
    if (mode !== "shell" && booted) editor.open(current).then(editor.focus);
  }

  function setEditorShare(share) {
    editorShare = Math.min(0.85, Math.max(0.15, share));
    $("workspace").style.setProperty("--editor-share", editorShare);
  }

  $("seed").textContent = seed;
  $("check").onclick = check;
  $("reset").onclick = reset;
  $("problem-select").onclick = () => (menuOpen ? closeProblemMenu() : openProblemMenu());
  $("problem-filter").oninput = () => {
    problemFilter = $("problem-filter").value;
    renderProblemList();
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
      closeProblemMenu();
      closeLayoutMenu();
    }
  });
  document.addEventListener("click", (e) => {
    if (menuOpen && !e.target.closest(".problem-picker")) closeProblemMenu();
    if (layoutMenuOpen && !e.target.closest(".layout-picker")) closeLayoutMenu();
  });

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
      const toolH = $("toolbar").offsetHeight;
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
    split.onkeydown = (e) => {
      const step = e.shiftKey ? 0.1 : 0.05;
      const horizontal = layout === "horizontal";
      if (e.key === (horizontal ? "ArrowLeft" : "ArrowUp")) setEditorShare(editorShare - step);
      else if (e.key === (horizontal ? "ArrowRight" : "ArrowDown")) setEditorShare(editorShare + step);
      else return;
      e.preventDefault();
      localStorage.setItem("ngoding.split", String(editorShare));
    };
  }
  $("vim-toggle").setAttribute("aria-pressed", vimOn);
  $("vim-toggle").onclick = () => {
    vimOn = !vimOn;
    localStorage.setItem("ngoding.vim", vimOn ? "on" : "off");
    $("vim-toggle").setAttribute("aria-pressed", vimOn);
    editor.setVim(vimOn);
    editor.focus();
  };
  $("editor-save").onclick = () => editor.save();
  $("editor-run").onclick = () => editor.run();
  langSelect.onchange = async () => {
    lang = languageById(langSelect.value);
    localStorage.setItem(LANG_STORAGE_KEY, lang.id);
    await editor.setLanguage(lang.id);
    if (layout !== "shell") editor.focus();
  };
  let persist = { phase: "idle", savedAt: null };

  function onPersist(p) {
    persist = { phase: p.phase, savedAt: p.savedAt ?? persist.savedAt };
    status.persist(persist);
  }

  async function flushBeforeLeave() {
    if (editor.hasUnsaved() && !(await editor.saveAll())) {
      throw new Error("editor save failed");
    }
    if (vm.isDirty() || vm.isSaving()) await vm.save();
  }

  addEventListener("beforeunload", (e) => {
    if (editor.hasUnsaved() || vm.isDirty() || vm.isSaving()) e.preventDefault();
  });

  for (const a of document.querySelectorAll('a[href="/"]')) {
    a.addEventListener("click", (e) => {
      if (!booted) return;
      if (!editor.hasUnsaved() && !vm.isDirty() && !vm.isSaving()) return;
      e.preventDefault();
      flushBeforeLeave()
        .then(() => {
          location.href = a.href;
        })
        .catch((err) => {
          console.error(err);
          status.notice("could not save session", "error");
        });
    });
  }

  renderProblem();
  setEditorShare(editorShare);
  setLayout(layout);

  // The terminal measures its cell size once, on open; do that with Plex Mono, not a fallback.
  await Promise.all([init(), document.fonts.load('13px "IBM Plex Mono"').catch(() => {})]);
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

  const t0 = performance.now();
  vm
    .boot({ term, problems, inputs, session: token, saveKey: "vm:exercise", setStatus: status.progress, onPersist })
    .then(({ restored }) => {
      if (persist.phase === "idle" && restored) persist = { phase: "saved", savedAt: restored };
      if (vm.isSaving()) persist = { phase: "saving", savedAt: persist.savedAt };
      else if (vm.isDirty()) persist = { phase: "dirty", savedAt: persist.savedAt };
      status.persist(persist);
      status.ready({ restored, ms: performance.now() - t0 });
      $("check").disabled = false;
      $("editor-save").disabled = $("editor-run").disabled = false;
      booted = true;
      if (layout !== "shell") editor.open(current);
      if (layout !== "editor") term.focus();
      else editor.focus();
    })
    .catch((e) => {
      console.error(e);
      status.fail("boot failed");
      term.write(`\n\x1b[31mBoot failed: ${e.message ?? e}\x1b[0m\n`);
    });

  window.ngoding = { vm, check, inputs, seed, editor, term };
}
