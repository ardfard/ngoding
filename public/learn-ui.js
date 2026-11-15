// Learn UI: pick a lesson, read about the concept, then write a program for it
// in the selected language, starting from a starter file (no solution). Each lesson is one file per language under
// ~/learn, opened in the same editor and VM as Exercise but with its own saved
// VM snapshot (vm:learn). The sidebar shows the expected output (and, behind
// "Show hint", the reference example); Check runs the
// student's program and compares (see learn-check.js), and lessons that pass get a check mark.

import { FitAddon, init, Terminal } from "/vendor/ghostty-web/ghostty-web.js";
import { createEditor } from "./editor.js";
import { CHECK_OUT, CHECK_SCRIPT, CHECK_STATUS, checkCommand, checkScript, compareOutput, parseStatus } from "./learn-check.js";
import { DEFAULT_LANG, LANG_STORAGE_KEY, LANGUAGES, languageById } from "./languages.js";
import { LESSONS, lessonById, lessonPath, starterCode } from "./lessons.js";
import { createVmStatus } from "./vm-persist.js";
import { createWorkspaceLayout } from "./workspace-layout.js";

const SOLVED_KEY = "ngoding.learn.solved";
const POLL_MS = 500;
const CURRENT_KEY = "ngoding.learn.current";

const $ = (id) => document.getElementById(id);
const padNum = (i) => String(i + 1).padStart(2, "0");
const home = (path) => path.replace(/^\/home\/user(?=\/|$)/, "~");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readSolved() {
  // Before Check existed, running a lesson marked it "tried"; that isn't solved.
  localStorage.removeItem("ngoding.learn.tried");
  try {
    return new Set(JSON.parse(localStorage.getItem(SOLVED_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

export async function startLearn(vm) {
  // The editor opens these like exercise problems: one file per language.
  const docs = new Map(LESSONS.map((lesson) => [lesson, {
    id: lesson.id,
    pathFor: (lang) => lessonPath(lesson, lang),
    templateFor: (lang) => starterCode(lesson, lang.id),
  }]));
  const solved = readSolved();
  // The check in progress ({} identity token), or null.
  let checking = null;
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
        b.classList.toggle("solved", solved.has(l.id));
        b.innerHTML = `<span class="problem-num">${padNum(LESSONS.indexOf(l))}</span><span class="problem-title"></span>${
          solved.has(l.id) ? '<span class="solved-mark" aria-label="solved">✓</span>' : ""
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
    const nSolved = LESSONS.filter((l) => solved.has(l.id)).length;
    $("picker-count").textContent = `${nSolved} solved · ${LESSONS.length} lessons`;
    $("picker-total").textContent = `${LESSONS.length} lessons`;

    const file = home(lessonPath(current, lang));
    $("problem").innerHTML = `<h2></h2>${current.intro}
<p class="lesson-file">${lang.label} · <code></code>${solved.has(current.id) ? ' · <span class="lesson-solved">✓ solved</span>' : ""}</p>
<h3>Expected output</h3>
<pre class="lesson-output"></pre>
<details class="lesson-hint">
  <summary>Stuck? Show hint</summary>
  <p>One way to write it in ${lang.label}. Try it yourself first; type it out rather than copying.</p>
  <pre class="lesson-example"></pre>
</details>`;
    $("problem").querySelector("h2").textContent = current.title;
    $("problem").querySelector(".lesson-file code").textContent = file;
    $("problem").querySelector(".lesson-output").textContent = current.output;
    $("problem").querySelector(".lesson-example").textContent = current.code[lang.id];
    $("problem").scrollTop = 0;

    const prev = LESSONS[idx - 1];
    const next = LESSONS[idx + 1];
    $("lesson-prev").disabled = !prev;
    $("lesson-prev-title").textContent = prev?.title ?? "";
    $("lesson-next").disabled = !next;
    $("lesson-next-title").textContent = next?.title ?? "Done!";
    if (menuOpen) renderList();
  }

  function setResult(cls, text) {
    $("result").className = cls;
    $("result").textContent = text;
  }

  function setChecking(on) {
    $("check-label").textContent = on ? "Stop waiting" : "Check my output";
    $("check").classList.toggle("checking", on);
  }

  function cancelCheck(message = "") {
    if (!checking) return;
    checking = null;
    setChecking(false);
    setResult("", message);
  }

  // Make sure the lesson file in the VM is what the student sees: save the
  // editor, or write the starter if it was never opened.
  async function ensureLessonFile(path) {
    if (editor.currentPath() === path) return editor.save();
    if ((await vm.readFile(path)) !== null) return true;
    return vm.writeFile(path, starterCode(current, lang.id));
  }

  async function check() {
    if (checking) return cancelCheck("Stopped waiting. Press Ctrl-C in the shell if it's still running.");
    const run = {};
    checking = run;
    const lesson = current;
    const path = lessonPath(lesson, lang);
    setChecking(true);
    setResult("", "Running your program in the shell…");
    try {
      if (!(await ensureLessonFile(path))) throw new Error("could not save the lesson file");
      if (!(await vm.writeFile(CHECK_SCRIPT, checkScript(path, lang)))) throw new Error("could not write the check script");
      await vm.rm(CHECK_STATUS);
      if (checking !== run) return;
      const nonce = Math.random().toString(36).slice(2, 10);
      vm.type(`\x15${checkCommand(nonce)}\n`);
      let status = null;
      while (status === null) {
        await sleep(POLL_MS);
        if (checking !== run) return;
        status = parseStatus(await vm.readFile(CHECK_STATUS), nonce);
      }
      const output = (await vm.readFile(CHECK_OUT)) ?? "";
      if (checking !== run) return;
      const result = compareOutput(lesson.output, output, status);
      setResult(result.ok ? "ok" : "fail", (result.ok ? "✓ " : "✗ ") + result.message);
      if (result.ok) {
        solved.add(lesson.id);
        localStorage.setItem(SOLVED_KEY, JSON.stringify([...solved]));
        renderLesson();
      }
    } catch (e) {
      if (checking === run) setResult("fail", `Checker error: ${e.message ?? e}`);
    } finally {
      if (checking === run) {
        checking = null;
        setChecking(false);
      }
    }
  }

  function selectLesson(lesson) {
    closeMenu();
    if (lesson === current) return;
    cancelCheck();
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
    cancelCheck();
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
  $("check").onclick = check;
  $("lesson-reset").onclick = () => {
    editor.resetToTemplate();
    editor.focus();
  };
  $("reset").onclick = async () => {
    if (!confirm("Delete all files in the VM, including your lesson files?")) return;
    localStorage.removeItem(SOLVED_KEY);
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
      $("editor-save").disabled = $("editor-run").disabled = $("lesson-reset").disabled = $("check").disabled = false;
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

  window.ngoding = { vm, editor, term, check };
}
