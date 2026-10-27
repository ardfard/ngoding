// Compare the VMs on the same tasks, each in a fresh browser profile.
// Needs `npm start` running. Usage: node test/bench.mjs [chromium-path]
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

const TASKS = [
  ["python3 startup", "python3 -c pass"],
  ["prime_sums.py (student solution)", "python3 prime_sums.py"],
  ["CPU loop (2M squares)", "python3 -c 'sum(i*i for i in range(2_000_000))'"],
  ["uv init + uv add rich", "uv init -q d && cd d && uv add -q rich; cd ~"],
  ["uv run (import rich)", "cd d && uv run -q python -c 'import rich'; cd ~"],
];

const browser = await chromium.launch({ executablePath: process.argv[2] ?? "/usr/bin/chromium" });
const results = {};
for (const vm of ["cheerpx", "v86"]) {
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 850 } })).newPage();
  const t0 = Date.now();
  await page.goto(`http://localhost:8080/?vm=${vm}`);
  await page.waitForFunction(() => document.getElementById("status").textContent.startsWith("ready"), null, { timeout: 600_000 });
  const bytes = await page.evaluate(() =>
    performance.getEntriesByType("resource").reduce((sum, e) => sum + (e.encodedBodySize || e.transferSize), 0));
  results[vm] = { "cold start to shell": `${((Date.now() - t0) / 1000).toFixed(1)}s`, "downloaded at start": `${(bytes / 2 ** 20).toFixed(1)} MiB` };
  await page.waitForFunction(() => document.querySelector(".xterm-rows").innerText.includes("$"));

  let n = 0;
  const sh = async (cmd) => {
    const tag = `__t${++n}_`;
    await page.locator(".xterm-helper-textarea").focus();
    // TIMEFORMAT prints just the wall-clock seconds, tagged so it can be found
    await page.keyboard.type(`TIMEFORMAT='${tag}%R'; time ( ${cmd} ); unset TIMEFORMAT\n`);
    const handle = await page.waitForFunction(
      (t) => document.querySelector(".xterm-rows").innerText.match(new RegExp(t + "([0-9.]+)")),
      tag, { timeout: 600_000 },
    );
    return (await handle.jsonValue())[1] + "s";
  };
  const b64 = readFileSync("test/solutions/prime_sums.py").toString("base64");
  await sh(`echo ${b64} | base64 -d > prime_sums.py`);
  for (const [name, cmd] of TASKS) results[vm][name] = await sh(cmd);
  await page.context().close();
}
await browser.close();

const rows = Object.keys(results.cheerpx);
console.log("| | CheerpX | v86 |\n|---|---|---|");
for (const r of rows) console.log(`| ${r} | ${results.cheerpx[r]} | ${results.v86[r]} |`);
