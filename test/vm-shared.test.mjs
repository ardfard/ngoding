import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseLs, unkKey } from "../public/vm-shared.js";

describe("parseLs", () => {
  it("reads the agent's d/f listing", () => {
    assert.deepEqual(parseLs("d\tsrc\nf\ta.c\n"), [
      { type: "dir", name: "src" },
      { type: "file", name: "a.c" },
    ]);
  });
  it("is empty for an empty directory", () => {
    assert.deepEqual(parseLs(""), []);
  });
  it("keeps tabs-free names with spaces", () => {
    assert.deepEqual(parseLs("f\tmy notes.txt"), [{ type: "file", name: "my notes.txt" }]);
  });
});

describe("unkKey", () => {
  it("prefixes a save key once", () => {
    assert.equal(unkKey("vm:learn"), "unk:vm:learn");
    assert.equal(unkKey("unk:vm:play:x"), "unk:vm:play:x");
  });
});
