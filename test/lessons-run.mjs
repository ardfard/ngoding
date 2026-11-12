// Runs every Learn example with the local toolchains and checks that it prints
// the lesson's expected output. Mirrors the VM's Run commands (languages.js).
// Usage: node test/lessons-run.mjs [lesson-id-or-lang ...]
// Missing toolchains are reported and skipped. TypeScript uses $TSC, else
// `npx -p typescript@4.8 tsc` (the VM ships tsc 4.8).
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LESSONS, lessonFileName } from "../public/lessons.js";
import { LANGUAGES } from "../public/languages.js";

const filters = process.argv.slice(2);
const dir = mkdtempSync(join(tmpdir(), "ngoding-learn-"));
const bin = join(dir, "a.out");

const has = (cmd) => spawnSync("sh", ["-c", `command -v ${cmd}`]).status === 0;
const TSC = process.env.TSC ?? (has("tsc") ? "tsc" : "npx --yes -p typescript@4.8.4 tsc");

// Shell command that builds and runs `file`.
function command(lang, file) {
  switch (lang) {
    case "python": return has("python3") && `python3 ${file}`;
    case "c": return has("gcc") && `gcc -Wall -Werror -O2 -o ${bin} ${file} -lm && ${bin}`;
    case "cpp": return has("g++") && `g++ -Wall -Werror -O2 -std=c++17 -o ${bin} ${file} && ${bin}`;
    case "go": return has("go") && `cd ${dir} && GO111MODULE=off go run ${file}`;
    // Examples should compile cleanly: the learner sees every warning.
    case "rust": return has("rustc") && `rustc -D warnings -O -o ${bin} ${file} && ${bin}`;
    case "haskell": return has("runghc") && `runghc ${file}`;
    case "javascript": return has("node") && `node ${file}`;
    case "typescript":
      return `${TSC} --strict --target es2020 --module commonjs --types node --outDir ${dir}/ts ${file} && node ${dir}/ts/${file.replace(/^.*\//, "").replace(/\.ts$/, ".js")}`;
  }
}

let failed = 0, passed = 0;
const skipped = new Set();
for (const lesson of LESSONS) {
  for (const lang of LANGUAGES) {
    if (filters.length && !filters.includes(lesson.id) && !filters.includes(lang.id)) continue;
    const file = join(dir, lessonFileName(lesson, lang));
    const cmd = command(lang.id, file);
    if (!cmd) {
      skipped.add(lang.id);
      continue;
    }
    writeFileSync(file, lesson.code[lang.id]);
    const r = spawnSync("sh", ["-c", cmd], { encoding: "utf8", timeout: 180_000 });
    if (r.status === 0 && r.stdout === lesson.output) {
      passed++;
      continue;
    }
    failed++;
    console.log(`✗ ${lesson.id} [${lang.id}] exit ${r.status}`);
    if (r.stderr) console.log(r.stderr.trim().split("\n").slice(0, 15).map((l) => `    ${l}`).join("\n"));
    console.log(`  expected:\n${lesson.output.replace(/^/gm, "    | ")}\n  got:\n${r.stdout.replace(/^/gm, "    | ")}`);
  }
}
rmSync(dir, { recursive: true, force: true });
if (skipped.size) console.log(`skipped (no toolchain): ${[...skipped].join(", ")}`);
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
