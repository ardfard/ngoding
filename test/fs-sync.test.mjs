// test/fs-sync.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyDiskChange,
  dirSignature,
  createFsSync,
} from "../public/fs-sync.js";

describe("dirSignature", () => {
  it("is stable for the same entries in any order", () => {
    const a = dirSignature([
      { type: "file", name: "b.py" },
      { type: "dir", name: "a" },
    ]);
    const b = dirSignature([
      { type: "dir", name: "a" },
      { type: "file", name: "b.py" },
    ]);
    assert.equal(a, b);
  });

  it("changes when a file is added", () => {
    const before = dirSignature([{ type: "file", name: "a.py" }]);
    const after = dirSignature([
      { type: "file", name: "a.py" },
      { type: "dir", name: "pkg" },
    ]);
    assert.notEqual(before, after);
  });
});

describe("classifyDiskChange", () => {
  it("is unchanged when disk matches saved", () => {
    assert.equal(
      classifyDiskChange({ saved: "hi", dirty: false, disk: "hi" }),
      "unchanged",
    );
  });

  it("reloads when clean buffer and disk changed", () => {
    assert.equal(
      classifyDiskChange({ saved: "old", dirty: false, disk: "new" }),
      "reload",
    );
  });

  it("conflicts when dirty buffer and disk changed", () => {
    assert.equal(
      classifyDiskChange({ saved: "old", dirty: true, disk: "new" }),
      "conflict",
    );
  });

  it("is deleted when disk file is gone", () => {
    assert.equal(
      classifyDiskChange({ saved: "old", dirty: false, disk: null }),
      "deleted",
    );
  });

  it("conflicts when dirty buffer and disk file is gone", () => {
    assert.equal(
      classifyDiskChange({ saved: "old", dirty: true, disk: null }),
      "conflict",
    );
  });
});

function mockTimers() {
  const timers = [];
  return {
    timers,
    setTimeout: (fn) => {
      const id = { fn };
      timers.push(id);
      return id;
    },
    clearTimeout: () => {},
  };
}

describe("createFsSync", () => {
  it("notifies tree when a watched dir listing changes", async () => {
    let listings = {
      "/ws": [{ type: "file", name: "a.py" }],
    };
    const treeChanges = [];
    const { timers, setTimeout, clearTimeout } = mockTimers();
    const sync = createFsSync({
      intervalMs: 10,
      listDir: async (path) => listings[path] ?? [],
      readFile: async () => null,
      getWatchedDirs: () => ["/ws"],
      getOpenFiles: () => [],
      shouldRefreshTree: () => true,
      onTreeChange: () => treeChanges.push(true),
      onFileEvent: () => {},
      setTimeout,
      clearTimeout,
    });

    sync.start();
    await timers.at(-1).fn();
    assert.equal(treeChanges.length, 0);

    listings["/ws"] = [
      { type: "file", name: "a.py" },
      { type: "dir", name: "pkg" },
    ];
    await timers.at(-1).fn();
    assert.equal(treeChanges.length, 1);
    sync.stop();
  });

  it("skips tree refresh when shouldRefreshTree is false", async () => {
    let listings = { "/ws": [{ type: "file", name: "a.py" }] };
    const treeChanges = [];
    const { timers, setTimeout, clearTimeout } = mockTimers();
    const sync = createFsSync({
      intervalMs: 10,
      listDir: async (path) => listings[path] ?? [],
      readFile: async () => null,
      getWatchedDirs: () => ["/ws"],
      getOpenFiles: () => [],
      shouldRefreshTree: () => false,
      onTreeChange: () => treeChanges.push(true),
      onFileEvent: () => {},
      setTimeout,
      clearTimeout,
    });

    sync.start();
    await timers.at(-1).fn();
    listings["/ws"] = [{ type: "dir", name: "pkg" }];
    await timers.at(-1).fn();
    assert.equal(treeChanges.length, 0);
    sync.stop();
  });

  it("alignDirs updates signatures so UI refresh does not miss later deletes", async () => {
    let listings = { "/ws": [{ type: "file", name: "a.py" }] };
    const treeChanges = [];
    const { timers, setTimeout, clearTimeout } = mockTimers();
    const sync = createFsSync({
      intervalMs: 10,
      listDir: async (path) => listings[path] ?? [],
      readFile: async () => null,
      getWatchedDirs: () => ["/ws"],
      getOpenFiles: () => [],
      shouldRefreshTree: () => true,
      onTreeChange: () => treeChanges.push(true),
      onFileEvent: () => {},
      setTimeout,
      clearTimeout,
    });

    sync.start();
    await timers.at(-1).fn(); // seed empty of a.py? seeds with a.py
    listings["/ws"] = [
      { type: "file", name: "a.py" },
      { type: "file", name: "b.py" },
    ];
    // UI refreshed to show b.py without going through sync — align to match.
    await sync.alignDirs();
    listings["/ws"] = [{ type: "file", name: "a.py" }];
    await timers.at(-1).fn();
    assert.equal(treeChanges.length, 1);
    sync.stop();
  });

  it("emits reload for a clean open file when disk changes", async () => {
    let disk = "v1";
    const fileEvents = [];
    const { timers, setTimeout, clearTimeout } = mockTimers();
    const sync = createFsSync({
      intervalMs: 10,
      listDir: async () => [],
      readFile: async () => disk,
      getWatchedDirs: () => [],
      getOpenFiles: () => [{ path: "/ws/a.py", saved: "v1", dirty: false }],
      shouldRefreshTree: () => false,
      onTreeChange: () => {},
      onFileEvent: (ev) => fileEvents.push(ev),
      setTimeout,
      clearTimeout,
    });

    sync.start();
    await timers.at(-1).fn();
    disk = "v2";
    await timers.at(-1).fn();
    assert.deepEqual(fileEvents, [
      { path: "/ws/a.py", kind: "reload", disk: "v2" },
    ]);
    sync.stop();
  });

  it("emits reload on first poll when disk already differs from saved", async () => {
    const fileEvents = [];
    const { timers, setTimeout, clearTimeout } = mockTimers();
    const sync = createFsSync({
      intervalMs: 10,
      listDir: async () => [],
      readFile: async () => "from-disk",
      getWatchedDirs: () => [],
      getOpenFiles: () => [{ path: "/ws/a.py", saved: "from-editor", dirty: false }],
      shouldRefreshTree: () => false,
      onTreeChange: () => {},
      onFileEvent: (ev) => fileEvents.push(ev),
      setTimeout,
      clearTimeout,
    });

    sync.start();
    await timers.at(-1).fn();
    assert.deepEqual(fileEvents, [
      { path: "/ws/a.py", kind: "reload", disk: "from-disk" },
    ]);
    sync.stop();
  });

  it("emits conflict for a dirty open file when disk changes", async () => {
    let disk = "v1";
    const fileEvents = [];
    const { timers, setTimeout, clearTimeout } = mockTimers();
    const sync = createFsSync({
      intervalMs: 10,
      listDir: async () => [],
      readFile: async () => disk,
      getWatchedDirs: () => [],
      getOpenFiles: () => [{ path: "/ws/a.py", saved: "v1", dirty: true }],
      shouldRefreshTree: () => false,
      onTreeChange: () => {},
      onFileEvent: (ev) => fileEvents.push(ev),
      setTimeout,
      clearTimeout,
    });

    sync.start();
    await timers.at(-1).fn();
    disk = "from-shell";
    await timers.at(-1).fn();
    assert.deepEqual(fileEvents, [
      { path: "/ws/a.py", kind: "conflict", disk: "from-shell" },
    ]);
    sync.stop();
  });
});
