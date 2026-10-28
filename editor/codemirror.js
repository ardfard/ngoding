// Entry point for public/codemirror.js: the parts of CodeMirror 6 the editor
// uses, bundled into one ES module by `npm run build:editor` (runs on npm install).
export { basicSetup } from "codemirror";
export { EditorView, keymap } from "@codemirror/view";
export { EditorState, Prec } from "@codemirror/state";
export { indentWithTab } from "@codemirror/commands";
export { HighlightStyle, syntaxHighlighting, indentUnit } from "@codemirror/language";
export { python } from "@codemirror/lang-python";
export { tags } from "@lezer/highlight";
