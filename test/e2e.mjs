// End-to-end check: boot the VM in headless Chromium, run the Python solutions
// inside it like a student would, and grade them through the UI.
// Needs `npm start` running. Usage: node test/e2e.mjs [chromium-path]
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

const APP_URL = process.env.URL ?? "http://localhost:8080/exercise";
const HOME_URL = new URL("/", APP_URL).href;
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
const screenIncludesOn = (p, s, timeout = 120_000) => p.waitForFunction(
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
const screenIncludes = (s, timeout = 120_000) => screenIncludesOn(page, s, timeout);
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
async function selectProblem(tab, p = page) {
  await p.locator("#problem-select").click();
  await p.getByRole("option", { name: tab }).click();
}
async function setLayoutMode(mode, p = page) {
  await p.locator("#layout-toggle").click();
  await p.getByRole("menuitemradio", { name: mode }).click();
}
async function check(tab) {
  await selectProblem(tab);
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

{
  const home = await browser.newPage();
  await home.goto(HOME_URL);
  expect("home has new session", await home.locator("#new-session").isVisible());
  expect("home has exercise CTA", await home.locator("#start-exercise").isVisible());
  const bounced = await home.goto(new URL("/problems", APP_URL).href, { waitUntil: "domcontentloaded" });
  expect("/problems redirects to /exercise", home.url().includes("/exercise"), `url=${home.url()} status=${bounced?.status()}`);
  await home.close();
}

const t0 = Date.now();
await page.goto(APP_URL);
await page.waitForFunction(() => document.getElementById("status").textContent.startsWith("ready"), null, { timeout: 600_000 });
console.log(`booted in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await screenIncludes("$").catch(async (e) => {
  console.error(`no shell prompt\n--- terminal ---\n${await screen()}`);
  throw e;
});
expect("exercise has no mode toggle", (await page.locator(".mode-segment").count()) === 0);
expect("exercise brand links home", await page.locator('a.brand[href="/"]').count() === 1);

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
await selectProblem("Prime sums");
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

// Layout picker: Editor only / Shell only; Shell hides the editor and is remembered.
await setLayoutMode("Editor only");
expect("editor-only layout hides the terminal", !(await page.locator("#terminal").isVisible()) &&
  await page.locator("#editor").isVisible());
await setLayoutMode("Shell only");
expect("shell-only layout hides the editor", !(await page.locator("#editor").isVisible()) &&
  !(await page.locator("#editor-run").isVisible()));

// The server holds the solvers: they must not be downloadable, and grading must
// not accept a made-up session.
expect("solvers are not served", (await page.request.get(new URL("/src/problems.rs", APP_URL).href)).status() === 404);
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
await selectProblem("Prime sums");
await setLayoutMode("Vertical");
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

// --- Play IDE (/play), separate context so IndexedDB keys do not collide mid-suite ---
await page.evaluate(async () => {
  await window.ngoding.vm.writeFile("/home/user/problems-marker", "x");
  await window.ngoding.vm.save();
});
await page.reload();
await page.waitForFunction(() => document.getElementById("status").textContent.startsWith("ready"), null, { timeout: 120_000 });
await page.waitForFunction(async () => (await window.ngoding.vm.readFile("/home/user/problems-marker")) === "x", null, { timeout: 60_000 });
await screenIncludes("$", 60_000);

const playCtx = await browser.newContext({ viewport: { width: 1400, height: 850 } });
const playPage = await playCtx.newPage();
playPage.on("pageerror", (e) => console.error("play pageerror:", e.message));

await playPage.goto(HOME_URL);
await playPage.locator("#new-session").click();
await playPage.locator("#session-template-dialog").waitFor({ state: "visible" });
await playPage.locator('#session-template-dialog [data-template="blank"]').click();
await playPage.locator("#session-template-create").click();
await playPage.waitForURL(/\/play\?s=/);
expect("new session opens /play?s=", /\/play\?s=/.test(playPage.url()));
expect("play has no mode toggle", (await playPage.locator(".mode-segment").count()) === 0);
expect("play brand links home", await playPage.locator('a.brand[href="/"]').count() === 1);
await playPage.waitForFunction(() => document.getElementById("status")?.textContent.startsWith("ready"), null, { timeout: 600_000 });
await screenIncludesOn(playPage, "$", 120_000).catch(async (e) => {
  console.error(`play: no shell prompt\n--- terminal ---\n${await playPage.evaluate(screenText)}`);
  throw e;
});
await playPage.waitForFunction(() => {
  const t = document.getElementById("status")?.textContent ?? "";
  return /· (unsaved|saving…|saved )/.test(t);
}, null, { timeout: 30_000 })
  .then(
    () => expect("play shows VM persist status", true),
    async () => expect("play shows VM persist status", false, await playPage.locator("#status").innerText()),
  );

const homeNames = await playPage.evaluate(async () => {
  const entries = await window.ngoding.vm.listDir("/home/user");
  return entries?.map((e) => e.name) ?? null;
});
expect("play has workspace", Array.isArray(homeNames) && homeNames.includes("workspace"));
expect("play has no challenge dir", Array.isArray(homeNames) && !homeNames.includes("challenge"));
expect("play has no output dir", Array.isArray(homeNames) && !homeNames.includes("output"));

const wsNames = await playPage.evaluate(async () => {
  const entries = await window.ngoding.vm.listDir("/home/user/workspace");
  return entries?.map((e) => e.name) ?? null;
});
expect("play lists workspace", Array.isArray(wsNames));

await playPage.evaluate(() => window.ngoding.vm.type("pwd\n"));
await screenIncludesOn(playPage, "/home/user/workspace", 60_000)
  .then(() => expect("play shell starts in workspace", true), () => expect("play shell starts in workspace", false));

await playPage.getByRole("button", { name: "New file" }).click();
await playPage.locator(".tree-name-edit").fill("from-ui.py");
await playPage.locator(".tree-name-edit").press("Enter");
await playPage.waitForFunction(() => window.ngoding.editor.currentPath() === "/home/user/workspace/from-ui.py", null, { timeout: 30_000 });
expect(
  "play new-file button creates from-ui.py",
  (await playPage.evaluate(() => window.ngoding.editor.currentPath())) === "/home/user/workspace/from-ui.py",
);
await playPage.evaluate(async () => {
  await window.ngoding.vm.rm("/home/user/workspace/from-ui.py");
  window.ngoding.editor.closePath("/home/user/workspace/from-ui.py");
});
await playPage.waitForFunction(
  () => !document.querySelector('[data-path="/home/user/workspace/from-ui.py"]'),
  null,
  { timeout: 10_000 },
).then(() => expect("play sync removes deleted file from tree", true), () => expect("play sync removes deleted file from tree", false));

// Shell mkdir should appear in the explorer without a manual refresh.
await playPage.evaluate(() => window.ngoding.vm.type("mkdir /home/user/workspace/fromshell && echo MKDIR_OK\n"));
await screenIncludesOn(playPage, "MKDIR_OK", 30_000)
  .then(() => expect("play shell mkdir ran", true), () => expect("play shell mkdir ran", false));
await playPage.waitForFunction(
  () => !!document.querySelector('[data-path="/home/user/workspace/fromshell"]'),
  null,
  { timeout: 10_000 },
).then(() => expect("play sync shows shell mkdir in tree", true), () => expect("play sync shows shell mkdir in tree", false));

await playPage.evaluate(async () => {
  await window.ngoding.vm.writeFile("/home/user/workspace/hello.py", "print(42)\n");
});
await playPage.waitForFunction(
  () => !!document.querySelector('[data-path="/home/user/workspace/hello.py"]'),
  null,
  { timeout: 10_000 },
).then(() => expect("play sync shows new file in tree", true), () => expect("play sync shows new file in tree", false));
await playPage.evaluate(() => window.ngoding.editor.openPath("/home/user/workspace/hello.py"));
await playPage.waitForFunction(() => window.ngoding.editor.currentPath() === "/home/user/workspace/hello.py");
await playPage.evaluate(async () => {
  await window.ngoding.editor.save();
});
expect("play opens hello.py", (await playPage.evaluate(() => window.ngoding.editor.currentPath())) === "/home/user/workspace/hello.py");

// External write to a clean open buffer reloads the editor.
await playPage.evaluate(async () => {
  await window.ngoding.vm.writeFile("/home/user/workspace/hello.py", "print('synced')\n");
});
await playPage.waitForFunction(
  () => window.ngoding.editor.view.state.doc.toString() === "print('synced')\n",
  null,
  { timeout: 10_000 },
).then(() => expect("play sync reloads clean editor from disk", true), () => expect("play sync reloads clean editor from disk", false));

// Dirty buffer + disk change → conflict banner; Keep preserves buffer.
await playPage.evaluate(() => {
  const view = window.ngoding.editor.view;
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "print('local')\n" } });
});
await playPage.evaluate(async () => {
  await window.ngoding.vm.writeFile("/home/user/workspace/hello.py", "print('disk')\n");
});
await playPage.waitForFunction(
  () => !document.getElementById("editor-conflict").hidden,
  null,
  { timeout: 10_000 },
).then(() => expect("play sync shows conflict banner", true), () => expect("play sync shows conflict banner", false));
await playPage.getByRole("button", { name: "Keep buffer" }).click();
expect(
  "play conflict keep preserves buffer",
  (await playPage.evaluate(() => window.ngoding.editor.view.state.doc.toString())) === "print('local')\n",
);
expect(
  "play conflict keep hides banner",
  await playPage.evaluate(() => document.getElementById("editor-conflict").hidden),
);

// Reload choice takes disk contents.
await playPage.evaluate(() => {
  const view = window.ngoding.editor.view;
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "print('local2')\n" } });
});
await playPage.evaluate(async () => {
  await window.ngoding.vm.writeFile("/home/user/workspace/hello.py", "print('disk2')\n");
});
await playPage.waitForFunction(() => !document.getElementById("editor-conflict").hidden, null, { timeout: 10_000 });
await playPage.getByRole("button", { name: "Reload from disk" }).click();
expect(
  "play conflict reload takes disk",
  (await playPage.evaluate(() => window.ngoding.editor.view.state.doc.toString())) === "print('disk2')\n",
);

await playPage.evaluate(async () => {
  await window.ngoding.vm.mv("/home/user/workspace/hello.py", "/home/user/workspace/hi.py");
  window.ngoding.editor.closePath("/home/user/workspace/hello.py");
});
await playPage.waitForFunction(
  () => !!document.querySelector('[data-path="/home/user/workspace/hi.py"]'),
  null,
  { timeout: 10_000 },
);
await playPage.evaluate(() => window.ngoding.editor.openPath("/home/user/workspace/hi.py"));
await playPage.evaluate(async () => {
  await window.ngoding.vm.rm("/home/user/workspace/hi.py");
  window.ngoding.editor.closePath("/home/user/workspace/hi.py");
});

await playPage.evaluate(async () => {
  await window.ngoding.vm.writeFile("/home/user/workspace/hi.py", "print('play-ok')\n");
  await window.ngoding.editor.openPath("/home/user/workspace/hi.py");
  await window.ngoding.editor.run();
});
await screenIncludesOn(playPage, "play-ok", 120_000)
  .then(() => expect("play run prints output", true), () => expect("play run prints output", false));

// VM image has go but not make/cargo; exercise detected build via go.mod.
await playPage.evaluate(async () => {
  await window.ngoding.vm.writeFile("/home/user/workspace/go.mod", "module play\n\ngo 1.22\n");
  await window.ngoding.vm.writeFile("/home/user/workspace/main.go", "package main\n\nfunc main() {}\n");
});
await playPage.waitForFunction(
  () => !!document.querySelector('[data-path="/home/user/workspace/main.go"]'),
  null,
  { timeout: 10_000 },
);
await playPage.getByRole("button", { name: "main.go" }).click();
await playPage.waitForFunction(() => window.ngoding.editor.currentPath() === "/home/user/workspace/main.go");
await playPage.waitForFunction(
  () => (document.getElementById("build-cmd")?.value ?? "").includes("go build"),
  null,
  { timeout: 30_000 },
);
await playPage.locator("#build-cmd").fill("");
await playPage.getByRole("button", { name: /^Build/ }).click();
await playPage.waitForFunction(() => {
  const term = window.ngoding?.term;
  if (!term) return false;
  const buf = term.buffer.active;
  let text = "";
  for (let y = 0; y < buf.length; y++) {
    const line = buf.getLine(y);
    text += (line ? line.translateToString(true) : "") + "\n";
  }
  if (!text.includes("go build .")) return false;
  if (/go: |command not found/.test(text)) return false;
  return text.slice(text.lastIndexOf("go build .")).includes("user@ngoding:");
}, null, { timeout: 300_000 })
  .then(() => expect("play detected go build", true), () => expect("play detected go build", false));

await playPage.locator("#build-cmd").fill("echo custom-build");
await playPage.getByRole("button", { name: /^Build/ }).click();
await screenIncludesOn(playPage, "custom-build", 120_000)
  .then(() => expect("play custom build override", true), () => expect("play custom build override", false));

await playPage.evaluate(() => window.ngoding.vm.reset());
await playPage.reload();
await playPage.waitForFunction(() => document.getElementById("status").textContent.startsWith("ready"), null, { timeout: 600_000 });
await playCtx.close();

await page.reload();
await page.waitForFunction(() => document.getElementById("status").textContent.startsWith("ready"), null, { timeout: 600_000 });
expect("exercise restores after play reset", (await page.locator("#status").innerText()).includes("restored"));
await page.waitForFunction(async () => (await window.ngoding.vm.readFile("/home/user/problems-marker")) === "x", null, { timeout: 60_000 })
  .then(() => expect("exercise marker survives play reset", true), () => expect("exercise marker survives play reset", false));

// Optional accounts/cloud (requires DATABASE_URL + NGODING_DEV_AUTH on the server).
{
  const me = await page.request.get("/api/auth/me");
  if (me.status() === 503) {
    console.log("skip cloud e2e (accounts unavailable — set DATABASE_URL)");
  } else {
    const req = await page.request.post("/api/auth/request", {
      data: { email: "e2e@example.com" },
    });
    const body = await req.json();
    if (!body.devLink) {
      expect("dev magic link returned", false);
    } else {
      const authPage = await browser.newPage();
      await authPage.goto(body.devLink);
      await authPage.waitForURL((u) => u.pathname === "/", { timeout: 15_000 });
      const who = await authPage.request.get("/api/auth/me");
      expect("signed in after magic link", who.ok());
      const pack = {
        version: 1,
        root: "/home/user",
        files: [{ path: "workspace/from-share.py", text: "print(1)\n" }],
      };
      const shareRes = await authPage.request.post("/api/shares", { data: { pack } });
      const share = await shareRes.json();
      expect("create anonymous share", shareRes.ok() && !!share.id);
      if (share.id) {
        const forkRes = await authPage.request.post(`/api/shares/${share.id}/fork`);
        const fork = await forkRes.json();
        expect("fork share pack", forkRes.ok() && fork.pack?.files?.length === 1);
      }
      await authPage.close();
    }
  }
}

await browser.close();
process.exit(failed ? 1 : 0);
