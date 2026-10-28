// Python editor (CodeMirror 6) for the current problem's solution file. The file
// lives in the VM and is read and written through the VM agent, so the editor
// and the terminal work on the same file. Autocomplete comes from CodeMirror's
// Python support: keywords, builtins, and names defined in the file.
import {
  EditorState, EditorView, HighlightStyle, basicSetup, indentUnit, indentWithTab,
  keymap, Prec, python, syntaxHighlighting, tags as t,
} from "./codemirror.js";

const theme = EditorView.theme({
  "&": { height: "100%", color: "#dfe3d6", backgroundColor: "#0b0d09" },
  ".cm-scroller": { fontFamily: '"IBM Plex Mono", ui-monospace, monospace', fontSize: "13px", lineHeight: "1.5" },
  ".cm-content": { caretColor: "#b5e655" },
  ".cm-cursor": { borderLeftColor: "#b5e655" },
  ".cm-gutters": { backgroundColor: "#0b0d09", color: "#5d6554", border: "none" },
  ".cm-activeLine": { backgroundColor: "#ffffff08" },
  ".cm-activeLineGutter": { backgroundColor: "#ffffff08", color: "#8b937f" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "#b5e65530 !important" },
  ".cm-matchingBracket": { backgroundColor: "#b5e65526", outline: "none" },
  ".cm-tooltip": { backgroundColor: "#1a1e17", border: "1px solid #2c3326", color: "#dfe3d6" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "#b5e655", color: "#10140b" },
  ".cm-completionDetail": { color: "#8b937f" },
}, { dark: true });

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword], color: "#c792ea" },
  { tag: [t.string, t.special(t.string)], color: "#b5e655" },
  { tag: [t.number, t.bool, t.null], color: "#f9a86b" },
  { tag: t.comment, color: "#6c7563", fontStyle: "italic" },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName))], color: "#7fc8f8" },
  { tag: [t.className, t.definition(t.className)], color: "#ffd479" },
  { tag: [t.self, t.standard(t.variableName)], color: "#ff9e8a" },
  { tag: t.invalid, color: "#ff7a6b" },
]);

// What a new solution file starts with.
const templateFor = (p) => `# ${p.title}: read the input file, write your answer to the output file.
from pathlib import Path

input_path = Path.home() / "${p.inputFile.replace("/home/user/", "")}"
output_path = Path.home() / "${p.outputFile.replace("/home/user/", "")}"

text = input_path.read_text()

answer = ""  # your code here

output_path.write_text(answer)
`;

const home = (path) => path.replace(/^\/home\/user(?=\/|$)/, "~");

// ctx: { parent, vm, onStatus(text, cls) }. Call open(problem) to show a
// problem's file; until then (and while the VM boots) the editor is read-only.
export function createEditor({ parent, vm, onStatus }) {
  // path -> { state, saved, template }: one buffer per file, so switching
  // problems keeps unsaved edits. saved is the text in the VM, or null if the
  // file doesn't exist yet.
  const files = new Map();
  let current = null; // { path, problem }
  let opening = 0;

  const view = new EditorView({ parent, state: makeState("", true) });

  function makeState(doc, readOnly = false) {
    return EditorState.create({
      doc,
      extensions: [
        basicSetup,
        python(),
        indentUnit.of("    "),
        // Highest precedence: basicSetup binds Mod-Enter to "insert blank line".
        Prec.highest(keymap.of([
          { key: "Mod-s", run: () => (save(), true), preventDefault: true },
          { key: "Mod-Enter", run: () => (run(), true), preventDefault: true },
          indentWithTab,
        ])),
        theme,
        syntaxHighlighting(highlight),
        EditorState.readOnly.of(readOnly),
        EditorView.updateListener.of((u) => u.docChanged && report()),
      ],
    });
  }

  // A file's current text: the view holds the open one, files the others.
  const textOf = (path) => (path === current?.path ? view.state : files.get(path).state).doc.toString();
  // Edited since the last save (or, for a new file, since the template)?
  const isDirty = (path) => {
    const f = files.get(path);
    return f !== undefined && textOf(path) !== (f.saved ?? f.template);
  };

  function report(note) {
    if (!current) return onStatus("", "");
    const dirty = isDirty(current.path);
    const state = note ?? (dirty ? "modified" : files.get(current.path).saved === null ? "new file, not saved yet" : "saved");
    onStatus(`${home(current.path)} · ${state}`, dirty ? "dirty" : "");
  }

  // Show a problem's solution file. It's (re)loaded from the VM unless it has
  // unsaved edits, so changes made in the terminal (e.g. with vim) show up.
  async function open(problem) {
    const path = problem.solutionFile;
    const id = ++opening;
    if (!isDirty(path)) {
      if (current?.path !== path) onStatus(`${home(path)} · loading…`, "");
      const saved = await vm.readFile(path);
      if (id !== opening) return;
      if (!isDirty(path)) {
        const template = templateFor(problem);
        files.set(path, { state: makeState(saved ?? template), saved, template });
        if (current?.path === path) view.setState(files.get(path).state);
      }
    }
    if (current?.path !== path) {
      if (current) files.get(current.path).state = view.state;
      current = { path, problem };
      view.setState(files.get(path).state);
    }
    report();
  }

  async function save() {
    if (!current) return false;
    const { path } = current;
    const text = view.state.doc.toString();
    report("saving…");
    const ok = await vm.writeFile(path, text);
    if (ok) files.get(path).saved = text;
    report(ok ? undefined : "save failed");
    return ok;
  }

  // Save, then run the file in the terminal (Ctrl-U first clears whatever is
  // typed at the prompt).
  async function run() {
    if (current && (await save())) vm.type(`\x15python3 ${home(current.path)}\n`);
  }

  const hasUnsaved = () => [...files.keys()].some(isDirty);

  return { open, save, run, hasUnsaved, view, focus: () => view.focus() };
}
