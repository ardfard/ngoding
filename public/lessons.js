// Learn mode: short programming exercises on common concepts, one per lesson
// in every supported language (like Go by Example, but the student writes the
// code). Every language's reference example in `code` prints exactly the
// lesson's `output`; the student starts from starterCode() instead.
//
// Lesson: { id, title, intro (HTML), output, code: { [languageId]: source } }

import basics from "./lessons/basics.js";
import collections from "./lessons/collections.js";
import functions from "./lessons/functions.js";
import tasks from "./lessons/tasks.js";
import types from "./lessons/types.js";

export const LESSONS = [...basics, ...collections, ...functions, ...types, ...tasks];

export const LEARN_DIR = "/home/user/learn";

/** e.g. "05_loops.rs": numbered so `ls ~/learn` lists lessons in order. */
export function lessonFileName(lesson, lang) {
  const n = String(LESSONS.indexOf(lesson) + 1).padStart(2, "0");
  return `${n}_${lesson.id}.${lang.ext}`;
}

export function lessonPath(lesson, lang) {
  return `${LEARN_DIR}/${lessonFileName(lesson, lang)}`;
}

export function lessonById(id) {
  return LESSONS.find((l) => l.id === id) ?? null;
}

const TODO = "TODO: write a program that prints the expected output shown in the lesson.";

// The lines of a reference example that are setup rather than the answer:
// imports/includes (and Haskell pragmas and FFI declarations).
function headerLines(src, langId) {
  const lines = src.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    switch (langId) {
      case "python":
        if (/^(import|from)\s/.test(t)) out.push(lines[i]);
        break;
      case "c":
      case "cpp":
        if (t.startsWith("#include")) out.push(lines[i]);
        break;
      case "rust":
        if (/^use\s/.test(t)) out.push(lines[i]);
        break;
      case "haskell":
        if (/^(\{-#|import\s|foreign import\s)/.test(t)) out.push(lines[i]);
        break;
      case "javascript":
        if (/^(const|let|var)\s.*=\s*require\(/.test(t)) out.push(lines[i]);
        break;
      case "typescript":
        if (/^import\s/.test(t)) out.push(lines[i]);
        break;
      case "go":
        if (/^import\s+"/.test(t)) out.push(t.replace(/^import\s+/, ""));
        else if (/^import\s*\($/.test(t)) {
          while (++i < lines.length && lines[i].trim() !== ")") if (lines[i].trim()) out.push(lines[i].trim());
        }
        break;
    }
  }
  return out;
}

/** The file a student starts a lesson from: the example's imports and an empty main. */
export function starterCode(lesson, langId) {
  const head = headerLines(lesson.code[langId], langId);
  const top = head.length ? `${head.join("\n")}\n\n` : "";
  switch (langId) {
    case "python":
      return `${top}# ${TODO}\n`;
    case "c":
      return `${top}int main(void) {\n    /* ${TODO} */\n    return 0;\n}\n`;
    case "cpp":
      return `${top}int main() {\n    // ${TODO}\n}\n`;
    case "go": {
      // Go rejects unused imports, so list the packages as a hint instead.
      const hint = head.length
        ? `// Packages you may need:\n// import (\n${head.map((p) => `// \t${p}`).join("\n")}\n// )\n\n`
        : "";
      return `package main\n\n${hint}func main() {\n\t// ${TODO}\n}\n`;
    }
    case "rust":
      return `${top}fn main() {\n    // ${TODO}\n}\n`;
    case "haskell":
      return `${top}main :: IO ()\nmain = do\n  -- ${TODO}\n  return ()\n`;
    case "javascript":
    case "typescript":
      return `${top}// ${TODO}\n`;
  }
  throw new Error(`no starter for ${langId}`);
}
