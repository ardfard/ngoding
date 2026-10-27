// Exercise UI: problem tabs, terminal, grading.
//
// The VM module provides { async boot(ctx), async readFile(path), save(), async reset() }:
//  - boot() wires ctx.term to the VM, writes ctx.inputs into it (unless it
//    resumed saved work), and resolves once the student's shell is usable
//  - readFile() returns the file's text, or null if it doesn't exist
//  - save() persists the student's work in the browser
//  - reset() discards whatever the VM persisted in the browser
//
// Problems, inputs and grading come from the server (/api/session, /api/grade),
// so expected answers never reach the browser.

const $ = (id) => document.getElementById(id);

async function post(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

export async function startApp(vm) {
  const { token, seed, problems, inputs } = await post("/api/session", {
    token: localStorage.getItem("ngoding.token"),
  });
  if (token !== localStorage.getItem("ngoding.token")) {
    localStorage.setItem("ngoding.token", token);
    localStorage.removeItem("ngoding.solved");
  }
  const solved = new Set(JSON.parse(localStorage.getItem("ngoding.solved") ?? "[]"));
  let current = problems[0];
  let ready = "";

  function setStatus(text, cls = "") {
    $("status").textContent = text;
    $("status").className = `status ${cls}`;
  }

  function renderProblem() {
    $("tabs").replaceChildren(
      ...problems.map((p) => {
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
      const output = await vm.readFile(p.outputFile);
      const result = output === null
        ? { ok: false, message: `${p.outputFile.replace("/home/user", "~")} not found.` }
        : await post("/api/grade", { token, problemId: p.id, output });
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
    vm.save();
  }

  async function reset() {
    if (!confirm("Delete all files in the VM and generate new inputs?")) return;
    localStorage.removeItem("ngoding.token");
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

  const onSave = ({ savedAt }) =>
    setStatus(`${ready} · saved ${new Date(savedAt).toLocaleTimeString([], { timeStyle: "short" })}`, "ready");

  const t0 = performance.now();
  vm
    .boot({ term, problems, inputs, session: token, setStatus, onSave })
    .then(({ restored }) => {
      ready = restored ? "ready (restored)" : `ready (${((performance.now() - t0) / 1000).toFixed(1)}s)`;
      setStatus(ready, "ready");
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
