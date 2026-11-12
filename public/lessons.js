// Learn mode: short, runnable examples of common programming concepts, one
// per lesson in every supported language (like Go by Example, but for all of
// them). Every language's example prints exactly the lesson's `output`.
//
// Lesson: { id, title, intro (HTML), output, code: { [languageId]: source } }

import basics from "./lessons/basics.js";
import collections from "./lessons/collections.js";
import functions from "./lessons/functions.js";
import types from "./lessons/types.js";

export const LESSONS = [...basics, ...collections, ...functions, ...types];

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
