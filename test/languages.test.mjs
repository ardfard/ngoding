// test/languages.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { languageFromPath } from "../public/languages.js";

describe("languageFromPath", () => {
  it("maps .rs to rust", () => {
    assert.equal(languageFromPath("/home/user/a.rs").id, "rust");
  });
  it("maps .py to python", () => {
    assert.equal(languageFromPath("~/x.py").id, "python");
  });
});
