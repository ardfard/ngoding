// End-to-end check for Learn: boot the VM, Check lessons through the UI.
// Needs `npm start` running. Usage: node test/e2e-learn.mjs [chromium-path] [lesson[:lang] ...]
// With no lessons, checks hello_world (the starter fails, a solution passes,
// a wrong one fails). With lessons, writes each reference example and checks it.
import { chromium } from "playwright-core";
import { lessonById } from "../public/lessons.js";

const URL_BASE = process.env.URL ?? "http://localhost:8080";
const [exe = "/usr/bin/chromium", ...targets] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: exe });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 850 } })).newPage();
page.on("pageerror", (e) => console.error("pageerror:", e.message));

let failed = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) failed++;
};

// Wait for the VM snapshot to finish saving: leaving mid-save would restore
// an older snapshot (possibly mid-run) on the next page.
const flushVm = () => page.evaluate(() => window.ngoding?.vm?.save()).catch(() => {});

async function open(lesson, lang) {
  await flushVm();
  await page.goto(`${URL_BASE}/learn#${lesson}`);
  await page.waitForFunction(() => !document.getElementById("check").disabled, null, { timeout: 300_000 });
  await page.selectOption("#editor-lang", lang);
}

async function check(timeout = 600_000) {
  await page.click("#check");
  await page.waitForFunction(
    () => /^[✓✗]|Checker error/.test(document.getElementById("result").textContent),
    null,
    { timeout },
  );
  return page.locator("#result").textContent();
}

// The last lines of the shell, to show why a check failed.
const shellTail = () => page.evaluate(() => {
  const buf = window.ngoding.term.buffer.active;
  const lines = [];
  for (let y = 0; y < buf.length; y++) lines.push(buf.getLine(y)?.translateToString(true) ?? "");
  return lines.filter((l) => l.trim()).slice(-15).map((l) => `    | ${l}`).join("\n");
});

// Replace the editor buffer with `src`.
async function write(src) {
  await page.locator(".cm-content").click();
  await page.keyboard.press("Control+a");
  await page.keyboard.insertText(src);
}

if (!targets.length) {
  await open("hello_world", "python");
  ok((await page.locator(".cm-content").textContent()).includes("TODO"), "lesson opens a starter");
  ok(!(await page.locator(".lesson-hint").evaluate((d) => d.open)), "hint starts hidden");
  await page.click(".lesson-hint summary");
  ok((await page.locator(".lesson-example").textContent()).includes('print("Hello, world!")'), "hint shows the example");
  let r = await check();
  ok(r.startsWith("✗"), `starter fails: ${r}`);
  await write('print("Hello, world!")\n');
  r = await check();
  ok(r.startsWith("✓"), `hello_world passes: ${r}`);
  ok(await page.locator(".lesson-solved").count() === 1, "lesson shows solved");
  await write('print("Hello, there!")\n');
  r = await check();
  ok(r.startsWith("✗") && r.includes("Line 1"), `edited hello_world fails: ${r}`);
} else {
  for (const t of targets) {
    const [lesson, lang = "python"] = t.split(":");
    await open(lesson, lang);
    await write(lessonById(lesson).code[lang]);
    let r = await check().catch(async (e) => {
      await page.click("#check"); // stop waiting and move on
      return `timeout (${e.message.split("\n")[0]})`;
    });
    if (!r.startsWith("✓")) r += `\n${await shellTail()}`;
    ok(r.startsWith("✓"), `${lesson} [${lang}]: ${r}`);
  }
}

await page.screenshot({ path: "test/e2e-learn.png" });
await browser.close();
process.exit(failed ? 1 : 0);
