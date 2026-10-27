// Exercise UI: problem tabs, terminal, grading.
//
// The VM module provides { async boot(ctx), async readFile(path), async reset() }:
//  - boot() wires ctx.term to the VM, writes ctx.inputs into it, and resolves
//    once the student's shell is usable
//  - readFile() returns the file's text, or null if it doesn't exist
//  - reset() discards whatever the VM persisted in the browser
import { PROBLEMS, mulberry32, grade } from "./problems.js";

const $ = (id) => document.getElementById(id);

export function startApp(vm) {
  const solved = new Set(JSON.parse(localStorage.getItem("ngoding.solved") ?? "[]"));
  let seed = Number(localStorage.getItem("ngoding.seed"));
  if (!seed) {
    seed = crypto.getRandomValues(new Uint32Array(1))[0] || 1;
    localStorage.setItem("ngoding.seed", seed);
  }
  const inputs = Object.fromEntries(
    PROBLEMS.map((p, i) => [p.id, p.generate(mulberry32(seed + i * 7919))]),
  );
  let current = PROBLEMS[0];

  function setStatus(text, cls = "") {
    $("status").textContent = text;
    $("status").className = `status ${cls}`;
  }

  function renderProblem() {
    $("tabs").replaceChildren(
      ...PROBLEMS.map((p) => {
        const b = document.createElement("button");
        b.textContent = p.title;
        b.setAttribute("aria-selected", p === current);
        b.classList.toggle("solved", solved.has(p.id));
        b.onclick = () => {
          current = p;
          $("result").textContent = "";
          renderProblem();
        };
        return b;
      }),
    );
    $("problem").innerHTML = `<h2>${current.title}</h2>${current.description}`;
  }

  async function check() {
    const p = current;
    $("check").disabled = true;
    $("result").className = "";
    $("result").textContent = "Reading output file…";
    try {
      const actual = await vm.readFile(p.outputFile);
      const result = grade(p.solve(inputs[p.id]), actual);
      if (actual === null) result.message = `${p.outputFile.replace("/home/user", "~")} not found.`;
      $("result").className = result.ok ? "ok" : "fail";
      $("result").textContent = (result.ok ? "✓ " : "✗ ") + result.message;
      if (result.ok) {
        solved.add(p.id);
        localStorage.setItem("ngoding.solved", JSON.stringify([...solved]));
        renderProblem();
      }
    } catch (e) {
      $("result").className = "fail";
      $("result").textContent = `Checker error: ${e.message ?? e}`;
    } finally {
      $("check").disabled = false;
    }
  }

  async function reset() {
    if (!confirm("Delete all files in the VM and generate new inputs?")) return;
    localStorage.removeItem("ngoding.seed");
    localStorage.removeItem("ngoding.solved");
    await vm.reset();
    location.reload();
  }

  $("seed").textContent = seed;
  $("check").onclick = check;
  $("reset").onclick = reset;
  renderProblem();

  const term = new Terminal({
    cursorBlink: true,
    convertEol: true,
    fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
    theme: { background: "#000000" },
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open($("terminal"));
  fit.fit();
  addEventListener("resize", () => fit.fit());

  const t0 = performance.now();
  vm
    .boot({ term, inputs, setStatus })
    .then(() => {
      setStatus(`ready (${((performance.now() - t0) / 1000).toFixed(1)}s)`, "ready");
      $("check").disabled = false;
      term.focus();
    })
    .catch((e) => {
      console.error(e);
      setStatus("boot failed", "error");
      term.write(`\n\x1b[31mBoot failed: ${e.message ?? e}\x1b[0m\n`);
    });

  // Handy for debugging / automated tests.
  window.ngoding = { vm, check, inputs, seed };
}
