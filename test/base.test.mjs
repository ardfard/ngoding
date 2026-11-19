import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { UNK_PREFIX, basePath } from "../public/base.js";

describe("basePath", () => {
  it("is the unkernel prefix under /新, decoded or not", () => {
    assert.equal(UNK_PREFIX, "/新");
    assert.equal(basePath("/新/play"), "/新");
    assert.equal(basePath("/新/"), "/新");
    assert.equal(basePath("/%E6%96%B0/play"), "/新");
  });
  it("is empty for the v86 app", () => {
    assert.equal(basePath("/play"), "");
    assert.equal(basePath("/"), "");
    assert.equal(basePath("/新x/play"), "");
  });
});
