import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { languageById } from "../public/languages.js";
import { checkCommand, checkScript, compareOutput, parseStatus } from "../public/learn-check.js";

describe("checkScript", () => {
  it("tees the run command's stdout and records its exit status", () => {
    const s = checkScript("/home/user/learn/01_hello_world.py", languageById("python"));
    assert.match(s, /\{ python3 ~\/learn\/01_hello_world\.py; \} \| tee ~\/\.ngoding-check\/check\.out\n/);
    assert.match(s, /echo "\$1 \$\{PIPESTATUS\[0\]\}" > ~\/\.ngoding-check\/check\.status\n$/);
    assert.match(s, /trap 'echo "\$1 130" > ~\/\.ngoding-check\/check\.status; exit 130' INT/);
    assert.equal(checkCommand("abc123"), "bash ~/.ngoding-check/check.sh abc123");
  });
});

describe("parseStatus", () => {
  it("accepts only this check's status", () => {
    assert.equal(parseStatus("abc 0\n", "abc"), 0);
    assert.equal(parseStatus("abc 130\n", "abc"), 130);
    assert.equal(parseStatus("old 0\n", "abc"), null);
    assert.equal(parseStatus("", "abc"), null);
    assert.equal(parseStatus(null, "abc"), null);
  });
});

describe("compareOutput", () => {
  it("passes exact output", () => {
    assert.equal(compareOutput("a\nb\n", "a\nb\n", 0).ok, true);
  });
  it("reports a failed run", () => {
    assert.deepEqual(compareOutput("a\n", "", 1), { ok: false, message: "Your program exited with status 1; see the shell." });
    assert.equal(compareOutput("a\n", "a\n", 130).message, "Interrupted.");
  });
  it("points at the first differing line", () => {
    assert.equal(compareOutput("a\nb\nc\n", "a\nx\nc\n", 0).message, 'Line 2: expected "b", got "x".');
    assert.equal(compareOutput("a\nb\n", "a\n", 0).message, 'Line 2: expected "b", got (nothing).');
    assert.equal(compareOutput("a\n", "a\nb\n", 0).message, 'Line 2: expected (nothing), got "b".');
    assert.equal(compareOutput("a b\n", "a b \n", 0).message, "Line 1 has different trailing spaces.");
  });
  it("insists on the final newline", () => {
    assert.equal(compareOutput("a\n", "a", 0).message, "The output should end with exactly one newline.");
    assert.equal(compareOutput("a\n", "a\n\n", 0).ok, false);
  });
});
