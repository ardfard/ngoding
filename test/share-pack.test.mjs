import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applySharePackPlan, collectSharePack, createPackFs, normalizeSharePath } from "../public/share-pack.js";

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

describe("createPackFs", () => {
  const fs = createPackFs({
    version: 1,
    root: "/home/user",
    files: [
      { path: "workspace/main.py", text: "print(1)\n" },
      { path: "workspace/src/lib.py", text: "x = 1\n" },
      { path: ".bashrc", text: "" },
    ],
  });

  it("lists files and implied directories", async () => {
    assert.deepEqual(await fs.listDir("/home/user/workspace"), [
      { type: "file", name: "main.py" },
      { type: "dir", name: "src" },
    ]);
    assert.deepEqual(await fs.listDir("/home/user/workspace/"), await fs.listDir("/home/user/workspace"));
    assert.deepEqual(await fs.listDir("/home/user"), [
      { type: "dir", name: "workspace" },
      { type: "file", name: ".bashrc" },
    ]);
  });

  it("returns null for unknown dirs and files", async () => {
    assert.equal(await fs.listDir("/home/user/nope"), null);
    assert.equal(await fs.readFile("/home/user/workspace/nope.py"), null);
  });

  it("reads file text and refuses writes", async () => {
    assert.equal(await fs.readFile("/home/user/workspace/src/lib.py"), "x = 1\n");
    assert.equal(await fs.readFile("/home/user/.bashrc"), "");
    assert.equal(await fs.writeFile("/home/user/workspace/main.py", "y"), false);
    assert.equal(await fs.readFile("/home/user/workspace/main.py"), "print(1)\n");
  });

  it("reports whether a directory exists", () => {
    assert.equal(fs.hasDir("/home/user/workspace"), true);
    assert.equal(fs.hasDir("/home/user/other"), false);
  });
});

describe("collectSharePack", () => {
  it("walks vm.listDir entries (type dir/file)", async () => {
    const fs = createPackFs({
      version: 1,
      root: "/home/user",
      files: [
        { path: "workspace/main.py", text: "print(1)\n" },
        { path: "workspace/src/lib.py", text: "x = 1\n" },
      ],
    });
    const { pack, skipped } = await collectSharePack(fs, { root: "/home/user" });
    assert.equal(skipped, 0);
    assert.deepEqual(pack.files, [
      { path: "workspace/main.py", text: "print(1)\n" },
      { path: "workspace/src/lib.py", text: "x = 1\n" },
    ]);
  });
});
