// Playground UI stub (tree, tabs, build — later tasks).
import { FitAddon, init, Terminal } from "/vendor/ghostty-web/ghostty-web.js";

const $ = (id) => document.getElementById(id);

export async function startPlay(vm) {
  function setStatus(text, cls = "") {
    $("status").textContent = text;
    $("status").className = `status ${cls}`;
  }

  await init();
  const term = new Terminal({
    cursorBlink: true,
    convertEol: true,
    fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
    theme: { background: "#000000" },
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.open($("terminal"));
  fit.fit();
  fit.observeResize();

  const onSave = ({ savedAt }) =>
    setStatus(`${ready} · saved ${new Date(savedAt).toLocaleTimeString([], { timeStyle: "short" })}`, "ready");

  let ready = "";
  const t0 = performance.now();
  vm
    .boot({ term, problems: [], inputs: {}, session: "play", saveKey: "vm:play", setStatus, onSave })
    .then(({ restored }) => {
      ready = restored ? "ready (restored)" : `ready (${((performance.now() - t0) / 1000).toFixed(1)}s)`;
      setStatus(ready, "ready");
      term.focus();
    })
    .catch((e) => {
      console.error(e);
      setStatus("boot failed", "error");
      term.write(`\n\x1b[31mBoot failed: ${e.message ?? e}\x1b[0m\n`);
    });

  window.ngoding = { vm, term };
}
