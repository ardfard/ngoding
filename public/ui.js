// Exercise UI: problem tabs, terminal, grading.
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
import { createEditor } from "./editor.js";
import { DEFAULT_LANG, LANG_STORAGE_KEY, LANGUAGES, languageById } from "./languages.js";

const $ = (id) => document.getElementById(id);

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

export async function startApp(vm) {
  const { token, seed, problems, inputs } = await post("/api/session", {
    token: localStorage.getItem("ngoding.token"),
  });
  if (token !== localStorage.getItem("ngoding.token")) {
    localStorage.setItem("ngoding.token", token);
    localStorage.removeItem("ngoding.solved");
  }
  const solved = new Set(JSON.parse(localStorage.getItem("ngoding.solved") ?? "[]"));
  let current = problems[0];
  let ready = "";
  let booted = false;

  function setStatus(text, cls = "") {
    $("status").textContent = text;
    $("status").className = `status ${cls}`;
  }

  function renderProblem() {
    $("tabs").replaceChildren(
      ...problems.map((p) => {
        const b = document.createElement("button");
        b.textContent = p.title;
        b.setAttribute("aria-selected", p === current);
        b.classList.toggle("solved", solved.has(p.id));
        b.onclick = () => {
          current = p;
          $("result").textContent = "";
          renderProblem();
          if (booted && layout !== "shell") editor.open(current);
        };
        return b;
      }),
    );
    $("problem").innerHTML = `<h2>${current.title}</h2>${current.description}`;
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
        localStorage.setItem("ngoding.solved", JSON.stringify([...solved]));
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

  // The editor works on the current problem's solution file. Layout cycles
  // split / editor / shell; vim and language are remembered per browser.
  // Language is global: every problem uses the same one.
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

  const LAYOUTS = ["split", "editor", "shell"];
  const LAYOUT_LABEL = { split: "Split", editor: "Editor", shell: "Shell" };
  // Migrate the old editor on/off flag once.
  let layout = localStorage.getItem("ngoding.layout");
  if (!LAYOUTS.includes(layout)) {
    layout = localStorage.getItem("ngoding.editor") === "off" ? "shell" : "split";
  }
  let editorShare = Number(localStorage.getItem("ngoding.split"));
  if (!(editorShare > 0.15 && editorShare < 0.85)) editorShare = 0.6;

  function setLayout(mode) {
    layout = mode;
    localStorage.setItem("ngoding.layout", mode);
    localStorage.removeItem("ngoding.editor");
    const ws = $("workspace");
    ws.classList.remove("layout-split", "layout-editor", "layout-shell");
    ws.classList.add(`layout-${mode}`);
    $("layout-toggle").textContent = LAYOUT_LABEL[mode];
    if (mode !== "shell" && booted) editor.open(current).then(editor.focus);
  }

  function setEditorShare(share) {
    editorShare = Math.min(0.85, Math.max(0.15, share));
    $("workspace").style.setProperty("--editor-share", editorShare);
  }

  $("seed").textContent = seed;
  $("check").onclick = check;
  $("reset").onclick = reset;
  $("layout-toggle").onclick = () =>
    setLayout(LAYOUTS[(LAYOUTS.indexOf(layout) + 1) % LAYOUTS.length]);
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
      const toolH = $("toolbar").offsetHeight;
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
    split.onkeydown = (e) => {
      const step = e.shiftKey ? 0.1 : 0.05;
      if (e.key === "ArrowUp") setEditorShare(editorShare - step);
      else if (e.key === "ArrowDown") setEditorShare(editorShare + step);
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
  addEventListener("beforeunload", (e) => editor.hasUnsaved() && e.preventDefault());
  renderProblem();
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
  // Refit when the window or the editor split changes the terminal's size.
  fit.observeResize();

  const onSave = ({ savedAt }) =>
    setStatus(`${ready} · saved ${new Date(savedAt).toLocaleTimeString([], { timeStyle: "short" })}`, "ready");

  const t0 = performance.now();
  vm
    .boot({ term, problems, inputs, session: token, setStatus, onSave })
    .then(({ restored }) => {
      ready = restored ? "ready (restored)" : `ready (${((performance.now() - t0) / 1000).toFixed(1)}s)`;
      setStatus(ready, "ready");
      $("check").disabled = false;
      $("editor-save").disabled = $("editor-run").disabled = false;
      booted = true;
      if (layout !== "shell") editor.open(current);
      if (layout !== "editor") term.focus();
      else editor.focus();
    })
    .catch((e) => {
      console.error(e);
      setStatus("boot failed", "error");
      term.write(`\n\x1b[31mBoot failed: ${e.message ?? e}\x1b[0m\n`);
    });

  // Handy for debugging / automated tests. term.buffer is the only way to read
  // the canvas-backed screen from Playwright.
  window.ngoding = { vm, check, inputs, seed, editor, term };
}
