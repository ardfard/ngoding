// Cross-checks the in-browser reference solvers against the Python solutions a
// student would write, over many seeds.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PROBLEMS, mulberry32, grade } from "../lib/problems.js";

const here = dirname(fileURLToPath(import.meta.url));
const solutions = { "word-freq": "word_freq.py", "prime-sums": "prime_sums.py" };

for (const p of PROBLEMS) {
  test(`${p.id}: JS solver matches Python solution`, () => {
    for (let seed = 1; seed <= 20; seed++) {
      const home = mkdtempSync(join(tmpdir(), "ngoding-"));
      const input = p.generate(mulberry32(seed));
      const inPath = join(home, p.inputFile.replace("/home/user/", ""));
      mkdirSync(dirname(inPath), { recursive: true });
      writeFileSync(inPath, input);
      execFileSync("python3", ["-I", join(here, "solutions", solutions[p.id])], { env: { HOME: home } });
      const actual = readFileSync(join(home, p.outputFile.replace("/home/user/", "")), "utf8");
      const result = grade(p.solve(input), actual);
      assert.ok(result.ok, `seed ${seed}: ${result.message}`);
    }
  });

  test(`${p.id}: generation is deterministic per seed`, () => {
    assert.equal(p.generate(mulberry32(7)), p.generate(mulberry32(7)));
    assert.notEqual(p.generate(mulberry32(7)), p.generate(mulberry32(8)));
  });
}

test("grade tolerates trailing whitespace but rejects wrong lines", () => {
  assert.ok(grade("a 1\nb 2\n", "a 1  \nb 2").ok);
  assert.equal(grade("a 1\n", null).ok, false);
  assert.match(grade("a 1\nb 2\n", "a 1\nb 3\n").message, /Line 2/);
  assert.match(grade("a 1\nb 2\n", "a 1\n").message, /ends early/);
});

test("session tokens round-trip and reject forgeries", async () => {
  const { sessions } = await import("../lib/session.js");
  const s = sessions("secret");
  const { seed, token } = s.create();
  assert.equal(s.verify(token), seed);
  assert.equal(s.verify(`${seed + 1}.${token.split(".")[1]}`), null);
  assert.equal(sessions("other").verify(token), null);
  assert.equal(s.verify("garbage"), null);
  assert.equal(s.verify(undefined), null);
});
