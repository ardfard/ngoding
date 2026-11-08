// test/build-cmd.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectBuildInListing, findBuild, resolveBuild } from "../public/build-cmd.js";

describe("detectBuildInListing", () => {
  it("detects tsconfig.json", () => {
    assert.deepEqual(detectBuildInListing(["src", "package.json", "tsconfig.json"]), { command: "tsc -p .", marker: "tsconfig.json" });
  });

  it("prefers Cargo.toml over Makefile", () => {
    const d = detectBuildInListing(["Makefile", "Cargo.toml", "src"]);
    assert.deepEqual(d, { command: "cargo build", marker: "Cargo.toml" });
  });
  it("returns null when no marker", () => {
    assert.equal(detectBuildInListing(["main.py", "README"]), null);
  });
  it("maps uv.lock to uv sync", () => {
    assert.deepEqual(detectBuildInListing(["uv.lock"]), { command: "uv sync", marker: "uv.lock" });
  });
});

describe("resolveBuild", () => {
  it("override wins", () => {
    const r = resolveBuild({
      override: "make release",
      detected: { command: "cargo build", dir: "/home/user/app" },
    });
    assert.deepEqual(r, { command: "make release", dir: null, source: "override" });
  });
  it("uses detection when override empty", () => {
    const r = resolveBuild({
      override: "  ",
      detected: { command: "make", dir: "/home/user/p" },
    });
    assert.deepEqual(r, { command: "make", dir: "/home/user/p", source: "detected" });
  });
  it("none when neither", () => {
    assert.equal(resolveBuild({ override: "", detected: null }).source, "none");
  });
});

describe("findBuild", () => {
  it("stops at a custom root and ignores parents", async () => {
    const listings = {
      "/home/user/workspace/src": ["main.go"],
      "/home/user/workspace": ["src"],
      "/home/user": ["workspace", "go.mod"],
    };
    const hit = await findBuild("/home/user/workspace/src", async (d) => listings[d] ?? [], "/home/user/workspace");
    assert.equal(hit, null);
  });
  it("finds a marker inside the custom root", async () => {
    const listings = {
      "/home/user/workspace/src": ["main.go"],
      "/home/user/workspace": ["src", "go.mod"],
    };
    const hit = await findBuild("/home/user/workspace/src", async (d) => listings[d] ?? [], "/home/user/workspace");
    assert.deepEqual(hit, { command: "go build .", dir: "/home/user/workspace", marker: "go.mod" });
  });
});
