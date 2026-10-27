// End-to-end check: boot the VM in headless Chromium, run the Python solutions
// inside it like a student would, and grade them through the UI.
// Needs `npm start` running. Usage: [VM=cheerpx] node test/e2e.mjs [chromium-path]
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

const VM = process.env.VM ?? "v86";
const URL = `${process.env.URL ?? "http://localhost:8080/"}?vm=${VM}`;
const browser = await chromium.launch({ executablePath: process.argv[2] ?? "/usr/bin/chromium" });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 850 } })).newPage();
page.on("pageerror", (e) => console.error("pageerror:", e.message));

const screen = () => page.locator(".xterm-rows").innerText();
let marker = 0;
// Type a shell command and wait for it to finish (detected via an echoed marker).
async function sh(cmd, timeout = 180_000) {
  const done = `__done_${++marker}__`;
  await page.locator(".xterm-helper-textarea").focus();
  // Printed from two halves so the echoed command line itself never matches.
  await page.keyboard.type(`${cmd}; printf '\\n%s%s\\n' __done_ ${marker}__\n`);
  await page.waitForFunction(
    (d) => document.querySelector(".xterm-rows").innerText.split("\n").some((l) => l.trim() === d),
    done, { timeout },
  ).catch(async (e) => {
    console.error(`timed out running: ${cmd.slice(0, 80)}\n--- terminal ---\n${await screen()}`);
    throw e;
  });
}
async function check(tab) {
  await page.getByRole("button", { name: tab }).click();
  await page.getByRole("button", { name: "Check my output" }).click();
  await page.waitForFunction(() => /^[✓✗]/.test(document.getElementById("result").textContent), null, { timeout: 60_000 });
  return page.locator("#result").innerText();
}
const put = (path, file) => sh(`echo ${readFileSync(file).toString("base64")} | base64 -d > ${path}`);

let failed = false;
const expect = (label, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
  failed ||= !ok;
};

const t0 = Date.now();
await page.goto(URL);
await page.waitForFunction(() => document.getElementById("status").textContent.startsWith("ready"), null, { timeout: 600_000 });
console.log(`[${VM}] booted in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await page.waitForFunction(() => document.querySelector(".xterm-rows").innerText.includes("$"), null, { timeout: 120_000 });

let r = await check("Word frequency");
expect("missing output is reported", r.includes("not found"), r);

await sh("ls ~/challenge/*/ && head -c 120 ~/challenge/word-freq/input.txt");
await put("word_freq.py", "test/solutions/word_freq.py");
await put("prime_sums.py", "test/solutions/prime_sums.py");
await sh("python3 word_freq.py && cat ~/output/word_freq.txt");
r = await check("Word frequency");
expect("word-freq solution accepted", r.startsWith("✓"), r);

await sh("echo 'nope 1' > ~/output/prime_sums.txt");
r = await check("Prime sums");
expect("wrong answer rejected", r.startsWith("✗"), r);

await sh("time python3 prime_sums.py");
r = await check("Prime sums");
expect("prime-sums solution accepted", r.startsWith("✓"), r);

await sh("uv init -q demo && cd demo && uv add rich && uv run python -c 'import rich; print(\"RICH\", rich.__name__)'; cd ~", 300_000);
const s = await screen();
expect("uv add + uv run work offline", s.includes("RICH rich"), s.split("\n").slice(-8).join(" | "));

// Ctrl-C must interrupt a running program (students will write infinite loops).
await page.keyboard.type("python3 -c 'while True: pass'\n");
await page.waitForTimeout(3000);
await page.keyboard.press("Control+c");
await sh("echo after-interrupt", 30_000).then(
  () => expect("Ctrl-C interrupts a running program", true),
  () => expect("Ctrl-C interrupts a running program", false),
);

await sh("clear; ls ~ ~/output && cat ~/output/word_freq.txt");
await page.screenshot({ path: `test/e2e-${VM}.png` });
await browser.close();
process.exit(failed ? 1 : 0);
