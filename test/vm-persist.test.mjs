import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bootLabel, persistLabel, persistTone } from "../public/vm-persist.js";

describe("persistLabel", () => {
  it("shows unsaved while dirty", () => {
    assert.equal(persistLabel({ phase: "dirty", savedAt: 1_700_000_000_000 }), "unsaved");
  });

  it("shows saving while a snapshot is in flight", () => {
    assert.equal(persistLabel({ phase: "saving", savedAt: null }), "saving…");
  });

  it("shows saved time after a successful snapshot", () => {
    const savedAt = Date.UTC(2026, 0, 15, 8, 5, 0);
    assert.match(persistLabel({ phase: "saved", savedAt }), /^saved \d/);
  });

  it("is empty when idle with no save yet", () => {
    assert.equal(persistLabel({ phase: "idle", savedAt: null }), "");
  });

  it("reports save failures", () => {
    assert.equal(persistLabel({ phase: "error", savedAt: null }), "save failed");
  });
});

describe("persistTone", () => {
  it("maps phases to tones", () => {
    assert.equal(persistTone("dirty"), "unsaved");
    assert.equal(persistTone("saving"), "unsaved");
    assert.equal(persistTone("error"), "error");
    assert.equal(persistTone("saved"), "");
    assert.equal(persistTone("idle"), "");
  });
});

describe("bootLabel", () => {
  it("says restored when resuming saved work", () => {
    assert.equal(bootLabel({ restored: 1_700_000_000_000, ms: 900 }), "restored");
  });

  it("shows boot time in seconds", () => {
    assert.equal(bootLabel({ restored: null, ms: 8_340 }), "8.3s");
  });
});
