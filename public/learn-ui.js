// Learn UI: pick a lesson, read about the concept, then run (and tweak) its
// example in the selected language. Each lesson is one file per language under
// ~/learn, opened in the same editor and VM as Exercise but with its own saved
// VM snapshot (vm:learn). Nothing is graded; the sidebar shows the expected
// output, and lessons you've run get a check mark.

import { FitAddon, init, Terminal } from "/vendor/ghostty-web/ghostty-web.js";
import { createEditor } from "./editor.js";
import { DEFAULT_LANG, LANG_STORAGE_KEY, LANGUAGES, languageById } from "./languages.js";
import { LESSONS, lessonById, lessonPath } from "./lessons.js";
import { createVmStatus } from "./vm-persist.js";
import { createWorkspaceLayout } from "./workspace-layout.js";

const TRIED_KEY = "ngoding.learn.tried";
const CURRENT_KEY = "ngoding.learn.current";

const $ = (id) => document.getElementById(id);
const padNum = (i) => String(i + 1).padStart(2, "0");
const home = (path) => path.replace(/^\/home\/user(?=\/|$)/, "~");

function readTried() {
  try {
    return new Set(JSON.parse(localStorage.getItem(TRIED_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

export async function startLearn(vm) {
  // The editor opens these like exercise problems: one file per language.
  const docs = new Map(LESSONS.map((lesson) => [lesson, {
    id: lesson.id,
    pathFor: (lang) => lessonPath(lesson, lang),
    templateFor: (lang) => lesson.code[lang.id],
  }]));
  const tried = readTried();
  const fromHash = () => lessonById(decodeURIComponent(location.hash.slice(1)));
  let current = fromHash() ?? lessonById(localStorage.getItem(CURRENT_KEY)) ?? LESSONS[0];
  const status = createVmStatus($("status"));
  let booted = false;
  let menuOpen = false;

  let lang = languageById(localStorage.getItem(LANG_STORAGE_KEY) ?? DEFAULT_LANG);
  let vimOn = localStorage.getItem("ngoding.vim") === "on";
  const editor = createEditor({
    vim: vimOn,
    language: lang.id,
    parent: $("editor"),
    vm,
    onStatus: (text, cls) => {
      $("editor-status").textContent = text;
      $("editor-status").className = cls;
    },
    onRun: () => {
      tried.add(current.id);
      localStorage.setItem(TRIED_KEY, JSON.stringify([...tried]));
      renderLesson();
    },
  });

  const layout = createWorkspaceLayout({
    onChange: (mode) => {
      if (mode !== "shell" && booted) editor.open(docs.get(current)).then(editor.focus);
    },
  });

  function setSidebarOpen(open) {
    document.body.classList.toggle("sidebar-open", open);
    $("sidebar-toggle").setAttribute("aria-expanded", open ? "true" : "false");
    $("sidebar-backdrop").hidden = !open;
  }

  function filtered() {
    const q = $("problem-filter").value.trim().toLowerCase();
    return LESSONS.filter((l) => !q || l.title.toLowerCase().includes(q) || l.id.includes(q));
  }

  function renderList() {
    $("tabs").replaceChildren(
      ...filtered().map((l) => {
        const b = document.createElement("button");
        b.type = "button";
        b.setAttribute("role", "option");
        b.setAttribute("aria-selected", l === current);
        b.classList.toggle("solved", tried.has(l.id));
        b.innerHTML = `<span class="problem-num">${padNum(LESSONS.indexOf(l))}</span><span class="problem-title"></span>${
          tried.has(l.id) ? '<span class="solved-mark" aria-label="tried">✓</span>' : ""
        }`;
        b.querySelector(".problem-title").textContent = l.title;
        b.onclick = () => selectLesson(l);
        return b;
      }),
    );
  }

  function closeMenu() {
    menuOpen = false;
    $("problem-menu").hidden = true;
    $("problem-select").setAttribute("aria-expanded", "false");
    $("problem-filter").value = "";
  }

  function openMenu() {
    menuOpen = true;
    $("problem-menu").hidden = false;
    $("problem-select").setAttribute("aria-expanded", "true");
    renderList();
    $("problem-filter").focus();
  }

  function renderLesson() {
    const idx = LESSONS.indexOf(current);
    $("problem-select-num").textContent = padNum(idx);
    $("problem-select-title").textContent = current.title;
    const nTried = LESSONS.filter((l) => tried.has(l.id)).length;
    $("picker-count").textContent = `${nTried} tried · ${LESSONS.length} lessons`;
    $("picker-total").textContent = `${LESSONS.length} lessons`;

    const file = home(lessonPath(current, lang));
    $("problem").innerHTML = `<h2></h2>${current.intro}
<p class="lesson-file">${lang.label} · <code></code></p>
<h3>Expected output</h3>
<pre class="lesson-output"></pre>`;
    $("problem").querySelector("h2").textContent = current.title;
    $("problem").querySelector(".lesson-file code").textContent = file;
    $("problem").querySelector(".lesson-output").textContent = current.output;
    $("problem").scrollTop = 0;

    const prev = LESSONS[idx - 1];
    const next = LESSONS[idx + 1];
    $("lesson-prev").disabled = !prev;
    $("lesson-prev-title").textContent = prev?.title ?? "";
    $("lesson-next").disabled = !next;
    $("lesson-next-title").textContent = next?.title ?? "Done!";
    if (menuOpen) renderList();
  }

  function selectLesson(lesson) {
    closeMenu();
    if (lesson === current) return;
    current = lesson;
    localStorage.setItem(CURRENT_KEY, lesson.id);
    history.replaceState(null, "", `#${lesson.id}`);
    renderLesson();
    if (booted && layout.mode !== "shell") editor.open(docs.get(current));
  }

  // Language picker (shared with Exercise via LANG_STORAGE_KEY).
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
  langSelect.onchange = async () => {
    lang = languageById(langSelect.value);
    localStorage.setItem(LANG_STORAGE_KEY, lang.id);
    renderLesson();
    await editor.setLanguage(lang.id);
    if (layout.mode !== "shell") editor.focus();
  };

  $("problem-select").onclick = () => (menuOpen ? closeMenu() : openMenu());
  $("problem-filter").oninput = renderList;
  $("problem-filter").onkeydown = (e) => {
    const first = filtered()[0];
    if (e.key === "Enter" && first) selectLesson(first);
  };
  $("lesson-prev").onclick = () => selectLesson(LESSONS[LESSONS.indexOf(current) - 1]);
  $("lesson-next").onclick = () => selectLesson(LESSONS[LESSONS.indexOf(current) + 1]);
  addEventListener("hashchange", () => {
    const lesson = fromHash();
    if (lesson) selectLesson(lesson);
  });
  $("sidebar-toggle").onclick = () => setSidebarOpen(!document.body.classList.contains("sidebar-open"));
  $("sidebar-backdrop").addEventListener("click", () => setSidebarOpen(false));
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    setSidebarOpen(false);
    closeMenu();
  });
  document.addEventListener("click", (e) => {
    if (menuOpen && !e.target.closest(".problem-picker")) closeMenu();
  });

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
  $("lesson-reset").onclick = () => {
    editor.resetToTemplate();
    editor.focus();
  };
  $("reset").onclick = async () => {
    if (!confirm("Delete all files in the VM, including your edited examples?")) return;
    localStorage.removeItem(TRIED_KEY);
    await vm.reset();
    location.reload();
  };

  let persist = { phase: "idle", savedAt: null };
  function onPersist(p) {
    persist = { phase: p.phase, savedAt: p.savedAt ?? persist.savedAt };
    status.persist(persist);
  }

  addEventListener("beforeunload", (e) => {
    if (editor.hasUnsaved() || vm.isDirty() || vm.isSaving()) e.preventDefault();
  });
  // Leaving through the brand link: flush edits and the VM first.
  for (const a of document.querySelectorAll('a[href="/"]')) {
    a.addEventListener("click", (e) => {
      if (!booted || (!editor.hasUnsaved() && !vm.isDirty() && !vm.isSaving())) return;
      e.preventDefault();
      (async () => {
        if (editor.hasUnsaved() && !(await editor.saveAll())) throw new Error("editor save failed");
        if (vm.isDirty() || vm.isSaving()) await vm.save();
      })()
        .then(() => {
          location.href = a.href;
        })
        .catch((err) => {
          console.error(err);
          status.notice("could not save session", "error");
        });
    });
  }

  if (location.hash.slice(1) !== current.id) history.replaceState(null, "", `#${current.id}`);
  renderLesson();

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
    .boot({ term, saveKey: "vm:learn", setStatus: status.progress, onPersist })
    .then(({ restored }) => {
      if (persist.phase === "idle" && restored) persist = { phase: "saved", savedAt: restored };
      if (vm.isSaving()) persist = { phase: "saving", savedAt: persist.savedAt };
      else if (vm.isDirty()) persist = { phase: "dirty", savedAt: persist.savedAt };
      status.persist(persist);
      status.ready({ restored, ms: performance.now() - t0 });
      $("editor-save").disabled = $("editor-run").disabled = $("lesson-reset").disabled = false;
      booted = true;
      if (layout.mode !== "shell") editor.open(docs.get(current));
      if (layout.mode !== "editor") term.focus();
      else editor.focus();
    })
    .catch((e) => {
      console.error(e);
      status.fail("boot failed");
      term.write(`\n\x1b[31mBoot failed: ${e.message ?? e}\x1b[0m\n`);
    });

  window.ngoding = { vm, editor, term };
}
