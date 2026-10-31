// Entry point for public/codemirror.js: the parts of CodeMirror 6 the editor
// uses, bundled into one ES module by `npm run build:editor` (runs on npm install).
export { basicSetup } from "codemirror";
export { EditorView, keymap } from "@codemirror/view";
export { Compartment, EditorState, Prec } from "@codemirror/state";
export { indentWithTab } from "@codemirror/commands";
export { HighlightStyle, StreamLanguage, syntaxHighlighting, indentUnit } from "@codemirror/language";
export { completeAnyWord, completeFromList } from "@codemirror/autocomplete";
export { python } from "@codemirror/lang-python";
export { cpp, cppLanguage } from "@codemirror/lang-cpp";
export { go } from "@codemirror/lang-go";
export { rust, rustLanguage } from "@codemirror/lang-rust";
export { haskell } from "@codemirror/legacy-modes/mode/haskell";
export { tags } from "@lezer/highlight";
export { vim, Vim } from "@replit/codemirror-vim";
