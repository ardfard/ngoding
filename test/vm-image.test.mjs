import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chooseBootImage } from "../public/vm-image.js";

describe("chooseBootImage", () => {
  it("fresh boot uses current image", () => {
    const r = chooseBootImage({
      saved: null,
      currentImage: "state-new.bin.zst",
      imageExists: () => true,
    });
    assert.deepEqual(r, { kind: "fresh", image: "state-new.bin.zst" });
  });

  it("restores when saved image matches current", () => {
    const r = chooseBootImage({
      saved: { image: "state-new.bin.zst", session: "play:a" },
      currentImage: "state-new.bin.zst",
      session: "play:a",
      imageExists: () => true,
    });
    assert.deepEqual(r, { kind: "restore", image: "state-new.bin.zst" });
  });

  it("restores older image when file still exists", () => {
    const r = chooseBootImage({
      saved: { image: "state-old.bin.zst", session: "play:a" },
      currentImage: "state-new.bin.zst",
      session: "play:a",
      imageExists: (img) => img === "state-old.bin.zst",
    });
    assert.deepEqual(r, { kind: "restore", image: "state-old.bin.zst" });
  });

  it("reports missing-image when old state file gone", () => {
    const r = chooseBootImage({
      saved: { image: "state-old.bin.zst", session: "play:a" },
      currentImage: "state-new.bin.zst",
      session: "play:a",
      imageExists: () => false,
    });
    assert.deepEqual(r, { kind: "missing-image", image: "state-new.bin.zst" });
  });

  it("rejects session mismatch", () => {
    const r = chooseBootImage({
      saved: { image: "state-new.bin.zst", session: "other" },
      currentImage: "state-new.bin.zst",
      session: "play:a",
      imageExists: () => true,
    });
    assert.deepEqual(r, { kind: "fresh", image: "state-new.bin.zst" });
  });
});
