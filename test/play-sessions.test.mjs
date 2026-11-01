const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  SESSIONS_KEY,
  playSaveKey,
  listSessions,
  createSession,
  touchSession,
  removeSession,
  getSession,
  migrateLegacyPlayMeta,
} from "../public/play-sessions.js";

beforeEach(() => {
  localStorage.clear();
});

describe("playSaveKey", () => {
  it("namespaces by id", () => {
    assert.equal(playSaveKey("abc"), "vm:play:abc");
  });
});

describe("createSession + listSessions", () => {
  it("creates Session 1 then Session 2, newest first", () => {
    const a = createSession(1000);
    const b = createSession(2000);
    assert.equal(a.name, "Session 1");
    assert.equal(b.name, "Session 2");
    assert.deepEqual(
      listSessions().map((s) => s.id),
      [b.id, a.id],
    );
  });
});

describe("touchSession", () => {
  it("bumps updatedAt and re-sorts", () => {
    const a = createSession(1000);
    const b = createSession(2000);
    touchSession(a.id, 3000);
    assert.equal(listSessions()[0].id, a.id);
    assert.equal(getSession(a.id).updatedAt, 3000);
  });
});

describe("removeSession", () => {
  it("drops meta", () => {
    const a = createSession(1000);
    assert.equal(removeSession(a.id), true);
    assert.equal(listSessions().length, 0);
    assert.equal(getSession(a.id), null);
  });
});

describe("migrateLegacyPlayMeta", () => {
  it("creates one session when list empty and legacy blob exists", () => {
    const s = migrateLegacyPlayMeta(true, 5000);
    assert.ok(s);
    assert.equal(listSessions().length, 1);
    assert.equal(s.createdAt, 5000);
  });
  it("no-ops when list non-empty", () => {
    createSession(1);
    assert.equal(migrateLegacyPlayMeta(true, 2), null);
    assert.equal(listSessions().length, 1);
  });
  it("no-ops without legacy blob", () => {
    assert.equal(migrateLegacyPlayMeta(false), null);
  });
});
