// End-to-end check: boot the VM in headless Chromium, run the Python solutions
// inside it like a student would, and grade them through the UI.
// Needs `npm start` running. Usage: node test/e2e.mjs [chromium-path]
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

const APP_URL = process.env.URL ?? "http://localhost:8080/";
const browser = await chromium.launch({ executablePath: process.argv[2] ?? "/usr/bin/chromium" });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 850 } })).newPage();
page.on("pageerror", (e) => console.error("pageerror:", e.message));

// ghostty-web renders to canvas; read the VT buffer through the exposed term.
const screenText = () => {
  const term = window.ngoding.term;
  const buf = term.buffer.active;
  const lines = [];
  for (let y = 0; y < buf.length; y++) {
    const line = buf.getLine(y);
    lines.push(line ? line.translateToString(true) : "");
  }
  return lines.join("\n");
};
const screen = () => page.evaluate(screenText);
const screenIncludes = (s, timeout = 120_000) => page.waitForFunction(
  (needle) => {
    const term = window.ngoding?.term;
    if (!term) return false;
    const buf = term.buffer.active;
    let text = "";
    for (let y = 0; y < buf.length; y++) {
      const line = buf.getLine(y);
      text += (line ? line.translateToString(true) : "") + "\n";
    }
    return text.includes(needle);
  },
  s, { timeout },
);
let marker = 0;
// Type a shell command and wait for it to finish (detected via an echoed marker).
async function sh(cmd, timeout = 180_000) {
  const done = `__done_${++marker}__`;
  await page.locator("#terminal textarea").focus();
  // Printed from two halves so the echoed command line itself never matches.
  await page.keyboard.type(`${cmd}; printf '\\n%s%s\\n' __done_ ${marker}__\n`);
  await page.waitForFunction(
    (d) => {
      const term = window.ngoding.term;
      const buf = term.buffer.active;
      for (let y = 0; y < buf.length; y++) {
        const line = buf.getLine(y);
        if (line && line.translateToString(true).trim() === d) return true;
      }
      return false;
    },
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
await page.goto(APP_URL);
await page.waitForFunction(() => document.getElementById("status").textContent.startsWith("ready"), null, { timeout: 600_000 });
console.log(`booted in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await screenIncludes("$").catch(async (e) => {
  console.error(`no shell prompt\n--- terminal ---\n${await screen()}`);
  throw e;
});

const editorText = () => page.evaluate(() => window.ngoding.editor.view.state.doc.toString());
const editorStatus = () => page.locator("#editor-status").innerText();
await page.waitForFunction(() => document.getElementById("editor-status").textContent.includes("·") &&
  !document.getElementById("editor-status").textContent.includes("loading"));
expect("editor starts a new file from a template",
  (await editorText()).includes("challenge/word-freq/input.txt") && (await editorStatus()).includes("~/word_freq.py · new file"),
  await editorStatus());

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

// The editor shows the current problem's file, which the terminal just wrote.
await page.getByRole("button", { name: "Prime sums" }).click();
await page.waitForFunction(() => document.getElementById("editor-status").textContent.endsWith("· saved"));
expect("editor loads the file from the VM", (await editorText()) === readFileSync("test/solutions/prime_sums.py", "utf8"));

// Autocomplete offers builtins and names defined in the file.
await page.evaluate(() => {
  const { view } = window.ngoding.editor;
  const insert = 'message = "from-" + "editor"\n';
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert }, selection: { anchor: insert.length } });
});
await page.locator(".cm-content").focus();
const complete = async (typed, label) => {
  await page.keyboard.type(typed);
  await page.locator(".cm-tooltip-autocomplete li", { hasText: label }).first().waitFor({ timeout: 10_000 });
  // Pick the option by label: the first suggestion isn't necessarily the one we want.
  while (!(await page.locator(".cm-tooltip-autocomplete li[aria-selected]").innerText()).startsWith(label)) {
    await page.keyboard.press("ArrowDown");
  }
  // CodeMirror ignores Enter for 75 ms after the list opens (interactionDelay).
  await page.waitForTimeout(200);
  await page.keyboard.press("Enter");
};
await complete("pri", "print");
await complete("(mess", "message");
expect("autocomplete completes builtins and local names", (await editorText()).endsWith("print(message)"), await editorText());
expect("edits are marked unsaved", (await editorStatus()).includes("modified"));

// Ctrl-Enter saves the file and runs it in the terminal.
await page.keyboard.press("Control+Enter");
await screenIncludes("from-editor", 60_000)
  .then(() => expect("Ctrl-Enter saves and runs the file", true), () => expect("Ctrl-Enter saves and runs the file", false));
expect("saved status shown", (await editorStatus()).endsWith("· saved"), await editorStatus());

// Vim mode: normal-mode commands work and :w saves. It stays on across the
// reload (checked below).
await page.getByRole("button", { name: "Vim" }).click();
await page.locator(".cm-vim-panel").waitFor({ timeout: 10_000 });
await page.keyboard.press("Escape");
await page.keyboard.type("ggO# vim-edit");
await page.keyboard.press("Escape");
await page.keyboard.type(":w");
await page.keyboard.press("Enter");
await page.waitForFunction(() => document.getElementById("editor-status").textContent.endsWith("· saved"));
await sh("head -1 ~/prime_sums.py");
expect("vim mode edits and saves with :w", (await editorText()).startsWith("# vim-edit\n") && (await screen()).includes("\n# vim-edit"),
  (await editorText()).split("\n")[0]);

// Layout cycles Split → Editor → Shell; Shell hides the editor and is remembered.
await page.getByRole("button", { name: "Split" }).click();
expect("editor-only layout hides the terminal", !(await page.locator("#terminal").isVisible()) &&
  await page.locator("#editor").isVisible());
await page.getByRole("button", { name: "Editor" }).click();
expect("shell-only layout hides the editor", !(await page.locator("#editor").isVisible()) &&
  !(await page.locator("#editor-run").isVisible()));

// The server holds the solvers: they must not be downloadable, and grading must
// not accept a made-up session.
expect("solvers are not served", (await page.request.get(new URL("/problems.js", APP_URL).href)).status() === 404);
const forged = await page.request.post(new URL("/api/grade", APP_URL).href, {
  data: { token: "1.AAAAAAAAAAAAAAAAAAAAAA", problemId: "word-freq", output: "x" },
});
expect("forged session is rejected", forged.status() === 400);

// Work is saved in the browser and restored after a reload; cached files are
// not downloaded again.
await sh("echo persisted-marker > ~/notes.txt");
await page.evaluate(() => window.ngoding.vm.save());
await page.reload();
await page.waitForFunction(() => document.getElementById("status").textContent.startsWith("ready"), null, { timeout: 120_000 });
expect("reload restores saved work", (await page.locator("#status").innerText()).includes("restored"));
const downloaded = await page.evaluate(() =>
  performance.getEntriesByType("resource").reduce((sum, e) => sum + e.transferSize, 0));
expect("reload downloads < 1 MiB (cache)", downloaded < 2 ** 20, `${(downloaded / 2 ** 10).toFixed(0)} KiB`);
await screenIncludes("$");
await sh("cat ~/notes.txt");
expect("files survive the reload", (await screen()).includes("persisted-marker"));
r = await check("Word frequency");
expect("grading still works after restore", r.startsWith("✓"), r);

expect("shell layout stays after reload", !(await page.locator("#editor").isVisible()));
await page.getByRole("button", { name: "Prime sums" }).click();
await page.getByRole("button", { name: "Shell" }).click(); // Shell → Split
await page.waitForFunction(() => document.getElementById("editor-status").textContent.endsWith("· saved"));
expect("vim mode stays on after reload", await page.locator(".cm-vim-panel").isVisible());
await page.getByRole("button", { name: "Vim" }).click();
await page.locator(".cm-content").focus();
await page.keyboard.press("Control+End");
await page.keyboard.type("x");
expect("vim mode can be switched off", !(await page.locator(".cm-vim-panel").isVisible()) && (await editorText()).endsWith("x"),
  JSON.stringify((await editorText()).slice(-20)));
await page.keyboard.press("Backspace");
expect("file saved from the editor survives the reload", (await editorText()).endsWith("print(message)\n") ||
  (await editorText()).endsWith("print(message)"), await editorText());

await sh("clear; ls ~ ~/output && cat ~/output/word_freq.txt");
await page.screenshot({ path: "test/e2e.png" });
await browser.close();
process.exit(failed ? 1 : 0);
