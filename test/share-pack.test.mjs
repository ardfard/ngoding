import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applySharePackPlan, normalizeSharePath } from "../public/share-pack.js";

describe("normalizeSharePath", () => {
  it("joins under root", () => {
    assert.equal(normalizeSharePath("/home/user", "workspace/a.py"), "/home/user/workspace/a.py");
  });
  it("rejects ..", () => {
    assert.equal(normalizeSharePath("/home/user", "../etc/passwd"), null);
  });
});

describe("applySharePackPlan", () => {
  it("strips root prefix and rejects ..", () => {
    const files = applySharePackPlan({
      version: 1,
      root: "/home/user",
      files: [
        { path: "workspace/a.py", text: "x" },
        { path: "../etc/passwd", text: "no" },
      ],
    });
    assert.deepEqual(files, [{ path: "/home/user/workspace/a.py", text: "x" }]);
  });
});
