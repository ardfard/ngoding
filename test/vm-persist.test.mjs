import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatPersistStatus, persistPillClass } from "../public/vm-persist.js";

describe("formatPersistStatus", () => {
  it("shows unsaved while dirty", () => {
    assert.equal(
      formatPersistStatus({ ready: "ready", phase: "dirty", savedAt: 1_700_000_000_000 }),
      "ready · unsaved",
    );
  });

  it("shows saving while a snapshot is in flight", () => {
    assert.equal(
      formatPersistStatus({ ready: "ready (restored)", phase: "saving", savedAt: null }),
      "ready (restored) · saving…",
    );
  });

  it("shows saved time after a successful snapshot", () => {
    const savedAt = Date.UTC(2026, 0, 15, 8, 5, 0);
    const text = formatPersistStatus({ ready: "ready", phase: "saved", savedAt });
    assert.match(text, /^ready · saved /);
  });

  it("falls back to ready alone when idle with no save yet", () => {
    assert.equal(
      formatPersistStatus({ ready: "ready (1.2s)", phase: "idle", savedAt: null }),
      "ready (1.2s)",
    );
  });

  it("reports save failures", () => {
    assert.equal(
      formatPersistStatus({ ready: "ready", phase: "error", savedAt: null }),
      "ready · save failed",
    );
  });
});

describe("persistPillClass", () => {
  it("maps phases to status-pill classes", () => {
    assert.equal(persistPillClass("dirty"), "unsaved");
    assert.equal(persistPillClass("saving"), "unsaved");
    assert.equal(persistPillClass("error"), "error");
    assert.equal(persistPillClass("saved"), "ready");
    assert.equal(persistPillClass("idle"), "ready");
  });
});
