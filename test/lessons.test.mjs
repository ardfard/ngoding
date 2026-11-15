// Structure checks for Learn lessons. test/lessons-run.mjs runs the examples.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LANGUAGES, languageById } from "../public/languages.js";
import { LESSONS, lessonById, lessonFileName, lessonPath, starterCode } from "../public/lessons.js";

describe("LESSONS", () => {
  it("has unique ids that are valid file/crate names", () => {
    const ids = LESSONS.map((l) => l.id);
    assert.equal(new Set(ids).size, ids.length);
    // rustc derives the crate name from the file name: no dashes.
    for (const id of ids) assert.match(id, /^[a-z][a-z0-9_]*$/);
  });

  it("gives every lesson an example in every language", () => {
    for (const lesson of LESSONS) {
      assert.ok(lesson.title && lesson.intro, lesson.id);
      assert.deepEqual(Object.keys(lesson.code).sort(), LANGUAGES.map((l) => l.id).sort(), lesson.id);
      for (const [lang, src] of Object.entries(lesson.code)) {
        assert.ok(src.endsWith("\n") && src.trim(), `${lesson.id} [${lang}]`);
      }
    }
  });

  it("expects newline-terminated output", () => {
    for (const lesson of LESSONS) assert.ok(lesson.output.endsWith("\n"), lesson.id);
  });
});

describe("lessonPath", () => {
  it("numbers files under ~/learn so ls lists them in order", () => {
    assert.equal(lessonFileName(LESSONS[0], languageById("rust")), "01_hello_world.rs");
    assert.equal(lessonPath(LESSONS[4], languageById("python")), `/home/user/learn/05_${LESSONS[4].id}.py`);
  });
});

describe("lessonById", () => {
  it("finds lessons and returns null for unknown ids", () => {
    assert.equal(lessonById("maps").title, "Maps");
    assert.equal(lessonById("nope"), null);
    assert.equal(lessonById(null), null);
  });
});

describe("starterCode", () => {
  it("gives every lesson a starter in every language that is not the example", () => {
    for (const lesson of LESSONS) {
      for (const lang of LANGUAGES) {
        const src = starterCode(lesson, lang.id);
        assert.ok(src.endsWith("\n") && src.includes("TODO"), `${lesson.id} [${lang.id}]`);
        assert.notEqual(src, lesson.code[lang.id], `${lesson.id} [${lang.id}]`);
        // No line of the expected output appears in the starter.
        for (const line of lesson.output.split("\n").filter((l) => l.length > 3)) {
          assert.ok(!src.includes(line), `${lesson.id} [${lang.id}] gives away ${JSON.stringify(line)}`);
        }
      }
    }
  });

  it("keeps the example's imports", () => {
    const files = lessonById("files");
    assert.match(starterCode(files, "python"), /^import os$/m);
    assert.match(starterCode(files, "rust"), /^use std::fs/m);
    assert.match(starterCode(files, "go"), /^\/\/ \t"os"$/m);
    assert.equal(starterCode(lessonById("hello_world"), "python"), "# TODO: write a program that prints the expected output shown in the lesson.\n");
  });
});
