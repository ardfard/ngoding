// End-to-end check of the unkernel app (/新): playground, toolchains,
// persistence, Exercise grading and Learn, in headless Chromium.
// Needs `npm start` running and `npm run build:image:unkernel` done.
// Usage: node test/e2e-unkernel.mjs [chromium-path]
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

const ORIGIN = process.env.URL ?? "http://localhost:8080";
const UNK = `${ORIGIN}/新`;
const browser = await chromium.launch({ executablePath: process.argv[2] ?? "/usr/bin/chromium" });
const context = await browser.newContext({ viewport: { width: 1400, height: 850 } });
let page = await context.newPage();
page.on("pageerror", (e) => console.error("pageerror:", e.message));

let failed = false;
const expect = (label, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
  failed ||= !ok;
};

const screen = () => page.evaluate(() => {
  const buf = window.ngoding.term.buffer.active;
  const lines = [];
  for (let y = 0; y < buf.length; y++) lines.push(buf.getLine(y)?.translateToString(true) ?? "");
  return lines.join("\n");
});
async function ready(label) {
  const t0 = Date.now();
  await page.waitForFunction(() => /^(ready|boot failed|VM stopped)/.test(document.getElementById("status")?.textContent ?? ""), null, { timeout: 600_000 });
  const status = await page.locator("#status").innerText();
  expect(`${label} boots`, status.startsWith("ready"), status.replace(/\n/g, " "));
  console.log(`  ${label}: ready after ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await page.waitForFunction(() => {
    const buf = window.ngoding?.term?.buffer.active;
    for (let y = 0; buf && y < buf.length; y++) if (buf.getLine(y)?.translateToString(true).includes("user@ngoding")) return true;
    return false;
  }, null, { timeout: 120_000 });
}
let marker = 0;
// Type a command in the student's shell; resolve with its output and seconds taken.
async function sh(cmd, timeout = 600_000) {
  const done = `__done_${++marker}__`;
  const before = (await screen()).length;
  const t0 = Date.now();
  await page.evaluate((s) => window.ngoding.vm.type(s), `${cmd}; printf '\\n%s%s\\n' __done_ ${marker}__\n`);
  await page.waitForFunction((d) => {
    const buf = window.ngoding.term.buffer.active;
    for (let y = 0; y < buf.length; y++) if (buf.getLine(y)?.translateToString(true).trim() === d) return true;
    return false;
  }, done, { timeout }).catch(async (e) => {
    console.error(`timed out running: ${cmd.slice(0, 80)}\n--- terminal ---\n${await screen()}`);
    throw e;
  });
  return { out: (await screen()).slice(before), secs: (Date.now() - t0) / 1000 };
}
async function run(label, cmd, want) {
  const { out, secs } = await sh(cmd);
  expect(`${label} (${secs.toFixed(1)}s)`, out.includes(want), out.includes(want) ? "" : out.slice(-300));
}

// Home and a playground session
await page.goto(`${UNK}/`);
await page.locator("#open-editor").click();
await page.getByRole("button", { name: /^C main\.c/ }).click();
await page.getByRole("button", { name: "Create session" }).click();
await page.waitForURL(/%E6%96%B0\/play\?s=|新\/play\?s=/);
expect("session opens under /新", decodeURI(page.url()).includes("/新/play?s="), page.url());
await ready("play");
expect("brand links to /新 home", (await page.locator('a.brand[href="/新/"]').count()) === 1);
expect("share is hidden", !(await page.locator("#share-btn").isVisible()));
expect("cloud save is hidden", !(await page.locator("#cloud-save").isVisible()));

// Toolchains, first runs (cold disk reads)
const files = {
  "/home/user/t/hello.go": 'package main\nimport "fmt"\nfunc main() { fmt.Println("go ok") }\n',
  "/home/user/t/hello.rs": 'fn main() { println!("rust ok"); }\n',
  "/home/user/t/Hello.hs": 'main = putStrLn "haskell ok"\n',
  "/home/user/t/hello.ts": 'const n: number = 1; console.log(`ts ok ${n}`);\n',
};
for (const [path, text] of Object.entries(files)) await page.evaluate(([p, t]) => window.ngoding.vm.writeFile(p, t), [path, text]);
await run("C template builds and runs", "cd ~/workspace && gcc main.c -o main && ./main", "Hello, ngoding!");
await run("python3 + numpy", "python3 -c 'import numpy; print(\"py ok\", numpy.arange(3).sum())'", "py ok 3");
await run("go run", "cd ~/t && go run hello.go", "go ok");
await run("rustc", "cd ~/t && rustc hello.rs -o hello && ./hello", "rust ok");
await run("runghc", "cd ~/t && runghc Hello.hs", "haskell ok");
await run("node + tsc", "cd ~/t && tsc --target es2020 --module commonjs --types node --typeRoots /usr/local/lib/node_modules/@types hello.ts && node hello.js", "ts ok 1");
await run("uv offline", "cd ~ && uv init -q demo && cd demo && uv add -q rich && uv run python -c 'import rich; print(\"RICH\", rich.__name__)'; cd ~", "RICH rich");
await run("go run, warm", "cd ~/t && go run hello.go", "go ok");

// Persistence across a reload
await page.evaluate(() => window.ngoding.vm.writeFile("/home/user/workspace/kept.txt", "kept\n"));
await page.evaluate(() => window.ngoding.vm.save());
await page.reload();
await ready("play after reload");
expect("status says restored", (await page.locator("#status").innerText()).includes("restored"));
expect("file survives reload", (await page.evaluate(() => window.ngoding.vm.readFile("/home/user/workspace/kept.txt"))) === "kept\n");

// The v86 app keeps its own session list
const v86Sessions = await page.evaluate(() => localStorage.getItem("ngoding.play.sessions"));
expect("v86 session list untouched", !v86Sessions || !v86Sessions.includes(new URL(location.href).searchParams.get("s")));

// Exercise: grading through the server
await page.goto(`${UNK}/exercise`);
await ready("exercise");
const put = (path, file) => page.evaluate(([p, t]) => window.ngoding.vm.writeFile(p, t), [path, readFileSync(file, "utf8")]);
await put("/home/user/word_freq.py", "test/solutions/word_freq.py");
await sh("cd ~ && python3 word_freq.py");
await page.locator("#problem-select").click();
await page.getByRole("option", { name: "Word frequency" }).click();
await page.getByRole("button", { name: "Check my output" }).click();
await page.waitForFunction(() => /^[✓✗]/.test(document.getElementById("result").textContent), null, { timeout: 60_000 });
const result = await page.locator("#result").innerText();
expect("word-freq graded", result.startsWith("✓"), result);

// Learn
await page.goto(`${UNK}/learn`);
await ready("learn");

await browser.close();
console.log(failed ? "FAILED" : "all passed");
process.exit(failed ? 1 : 0);
