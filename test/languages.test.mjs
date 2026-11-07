// test/languages.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LANGUAGES, languageById, languageFromPath, playgroundTemplate, runCommand } from "../public/languages.js";

describe("languageFromPath", () => {
  it("maps .rs to rust", () => {
    assert.equal(languageFromPath("/home/user/a.rs").id, "rust");
  });
  it("maps .py to python", () => {
    assert.equal(languageFromPath("~/x.py").id, "python");
  });
  it("maps .js and .ts", () => {
    assert.equal(languageFromPath("~/a.js").id, "javascript");
    assert.equal(languageFromPath("~/b.ts").id, "typescript");
  });
});

describe("runCommand", () => {
  it("runs typescript through tsc then node", () => {
    const cmd = runCommand("/home/user/play/main.ts", languageById("typescript"));
    assert.match(cmd, /^tsc .* ~\/play\/main\.ts && node \/tmp\/ngoding-ts\/main\.js$/);
  });
});

describe("playgroundTemplate", () => {
  it("returns empty for blank", () => {
    assert.deepEqual(playgroundTemplate("blank"), { files: [], open: null });
  });

  it("seeds python main.py", () => {
    const t = playgroundTemplate("python");
    assert.equal(t.open, "main.py");
    assert.equal(t.files.length, 1);
    assert.equal(t.files[0].path, "main.py");
    assert.match(t.files[0].content, /print/);
  });

  it("seeds rust cargo project", () => {
    const t = playgroundTemplate("rust");
    assert.equal(t.open, "src/main.rs");
    assert.deepEqual(t.files.map((f) => f.path).sort(), ["Cargo.toml", "src/main.rs"]);
    assert.match(t.files.find((f) => f.path === "Cargo.toml").content, /\[package\]/);
  });

  it("covers every supported language", () => {
    for (const lang of LANGUAGES) {
      const t = playgroundTemplate(lang.id);
      assert.ok(t.files.length >= 1, lang.id);
      assert.ok(t.open, lang.id);
      assert.ok(t.files.some((f) => f.path === t.open), lang.id);
    }
  });
});
