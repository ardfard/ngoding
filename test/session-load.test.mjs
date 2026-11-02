import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolvePlaySnapshot } from "../public/session-load.js";

describe("resolvePlaySnapshot", () => {
  it("prefers local", async () => {
    const r = await resolvePlaySnapshot({
      sessionId: "a",
      localGet: async () => ({ blob: "x", image: "state-1.bin.zst", session: "play:a", savedAt: 1 }),
      cloudGetSnapshot: async () => ({ blob: "y" }),
      signedIn: true,
    });
    assert.equal(r.source, "local");
  });

  it("falls back to cloud when signed in", async () => {
    const r = await resolvePlaySnapshot({
      sessionId: "a",
      localGet: async () => null,
      cloudGetSnapshot: async () => ({
        blob: "y",
        image: "state-1.bin.zst",
        session: "play:a",
        savedAt: 2,
      }),
      signedIn: true,
    });
    assert.equal(r.source, "cloud");
    assert.equal(r.record.blob, "y");
  });

  it("skips cloud when signed out", async () => {
    const r = await resolvePlaySnapshot({
      sessionId: "a",
      localGet: async () => null,
      cloudGetSnapshot: async () => ({ blob: "y" }),
      signedIn: false,
    });
    assert.equal(r.source, "none");
  });
});
