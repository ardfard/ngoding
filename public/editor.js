// Solution editor (CodeMirror 6) for the current problem. The file lives in the
// VM and is read and written through the VM agent, so the editor and the
// terminal work on the same file. Language (Python, C, C++, Go, Rust, Haskell)
// is global: it picks the file extension, syntax mode, template, and Run command.
import {
  Compartment, EditorState, EditorView, HighlightStyle, StreamLanguage,
  Vim, basicSetup, completeAnyWord, completeFromList, cpp, cppLanguage, go,
  haskell, indentUnit, indentWithTab, keymap, Prec, python, rust, rustLanguage,
  syntaxHighlighting, tags as t, vim,
} from "./codemirror.js";
import { languageById, runCommand, solutionPath, templateFor } from "./languages.js";

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
  // !important: the vim plugin styles its cursor with a highest-precedence theme.
  ".cm-fat-cursor": { background: "#b5e655 !important", color: "#10140b" },
  "&:not(.cm-focused) .cm-fat-cursor": { background: "none !important", outline: "solid 1px #b5e655 !important" },
  ".cm-panels": { backgroundColor: "#1a1e17", color: "#dfe3d6" },
  ".cm-panels-bottom": { borderTop: "1px solid #2c3326" },
  ".cm-vim-panel": { fontFamily: '"IBM Plex Mono", ui-monospace, monospace', fontSize: "12px", padding: "2px 10px" },
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

const home = (path) => path.replace(/^\/home\/user(?=\/|$)/, "~");

// lang-python and lang-go ship completion sources; the others don't, so we
// attach keywords plus completeAnyWord (names already in the buffer).
const kw = (words) => completeFromList(words.map((label) => ({ label, type: "keyword" })));
const C_KW = "auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while NULL".split(" ");
const CPP_KW = [...C_KW, ..."alignas alignof and and_eq bitand bitor bool catch class compl constexpr const_cast decltype delete dynamic_cast explicit export false friend mutable namespace new noexcept not not_eq nullptr operator or or_eq private protected public reinterpret_cast static_assert static_cast template this throw true try typeid typename using virtual wchar_t xor xor_eq".split(" ")];
const RUST_KW = "as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while".split(" ");
const HS_KW = "as case class data default deriving do else forall foreign if import in infix infixl infixr instance let module newdata of qualified then type where mdo proc rec".split(" ");

function withCompletions(support, language, keywords) {
  return [
    support,
    language.data.of({ autocomplete: kw(keywords) }),
    language.data.of({ autocomplete: completeAnyWord }),
  ];
}

function modeFor(lang) {
  switch (lang.id) {
    case "python": return python();
    case "c": return withCompletions(cpp(), cppLanguage, C_KW);
    case "cpp": return withCompletions(cpp(), cppLanguage, CPP_KW);
    case "go": return go();
    case "rust": return withCompletions(rust(), rustLanguage, RUST_KW);
    case "haskell": {
      const hs = StreamLanguage.define(haskell);
      return withCompletions(hs, hs, HS_KW);
    }
    default: return python();
  }
}

// ctx: { parent, vm, onStatus(text, cls), vim, language }. Call open(problem) to
// show a problem's file; until then (and while the VM boots) the editor is read-only.
export function createEditor({ parent, vm, onStatus, vim: vimOn = false, language: languageId = "python" }) {
  // path -> { state, saved, template }: one buffer per file, so switching
  // problems or languages keeps unsaved edits. saved is the text in the VM, or
  // null if the file doesn't exist yet.
  const files = new Map();
  let current = null; // { path, problem }
  let opening = 0;
  let lang = languageById(languageId);
  // Every file's state carries this, so vim mode can be switched in all of them.
  const vimMode = new Compartment();
  const vimExtension = () => (vimOn ? vim({ status: true }) : []);
  Vim.defineEx("write", "w", () => save());

  const view = new EditorView({ parent, state: makeState("", true, lang) });

  function makeState(doc, readOnly = false, language = lang) {
    return EditorState.create({
      doc,
      extensions: [
        vimMode.of(vimExtension()), // before basicSetup, so vim sees keys first
        basicSetup,
        modeFor(language),
        indentUnit.of(language.indent),
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

  // Show a problem's solution file for the current language. It's (re)loaded
  // from the VM unless it has unsaved edits, so changes made in the terminal
  // (e.g. with vim) show up.
  async function open(problem) {
    const path = solutionPath(problem, lang);
    const id = ++opening;
    if (!isDirty(path)) {
      if (current?.path !== path) onStatus(`${home(path)} · loading…`, "");
      const saved = await vm.readFile(path);
      if (id !== opening) return;
      if (!isDirty(path)) {
        const template = templateFor(problem, lang);
        files.set(path, { state: makeState(saved ?? template, false, lang), saved, template });
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

  // Save, then compile/run the file in the terminal (Ctrl-U first clears
  // whatever is typed at the prompt).
  async function run() {
    if (current && (await save())) vm.type(`\x15${runCommand(current.path, lang)}\n`);
  }

  const hasUnsaved = () => [...files.keys()].some(isDirty);

  function setVim(on) {
    vimOn = on;
    const effects = vimMode.reconfigure(vimExtension());
    view.dispatch({ effects });
    for (const [path, f] of files) if (path !== current?.path) f.state = f.state.update({ effects }).state;
  }

  // Switch the global language and reopen the current problem under the new
  // extension (other languages' buffers stay in memory).
  async function setLanguage(id) {
    lang = languageById(id);
    if (current) await open(current.problem);
  }

  return { open, save, run, hasUnsaved, setVim, setLanguage, view, focus: () => view.focus() };
}
