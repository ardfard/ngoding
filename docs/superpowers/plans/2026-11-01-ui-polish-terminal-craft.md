# UI polish — terminal craft cues + mobile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish Play and Problems chrome for clearer splitter/layout cues, aligned sidebars, and a usable mobile drawer — keeping the existing dark terminal-craft theme.

**Architecture:** Design four reference frames on the pen.dev MCP canvas first. Then apply a CSS-first polish in `public/style.css` with small HTML structure tweaks and minimal JS (splitter `.dragging` class, layout-toggle `aria-pressed`, mobile drawer toggle). No VM/agent/API changes.

**Tech Stack:** pen.dev MCP canvas, vanilla HTML/CSS/JS (existing modules), Playwright e2e (`npm run test:e2e`).

**Spec:** `docs/superpowers/specs/2026-11-01-ui-polish-terminal-craft-design.md`

## Global Constraints

- Keep current CSS variables / IBM Plex identity; terminal-craft polish only, not a rebrand.
- Scope is Play + Problems only; no landing page, no VM/agent/protocol changes.
- Breakpoint for stacked/mobile chrome: `max-width: 720px`.
- Desktop splitter stays thin; mobile splitter hit target ~12px with the same grip cue.
- Prefer unicode/CSS grips over a new icon library.
- Do not break existing e2e selectors (`#check`, `#editor-run`, `#tree`, `#layout-toggle`, etc.).
- Design on pen.dev via Cursor MCP (`user-pencil` / `execute`), not the unauthenticated CLI.
- Follow existing code style (small focused diffs, short comments, no drive-by refactors).

## File map

| File | Responsibility |
|------|----------------|
| pen.dev canvas (MCP `untitled.pen` or `designs/ngoding-ui.pen`) | Four reference frames: Play/Problems × desktop/mobile |
| `public/style.css` | Grip, layout-mode cue, sidebar alignment, `@media (max-width: 720px)` drawer layout |
| `public/play.html` | Viewport meta; header/toolbar structure; drawer toggle + backdrop hooks; splitter grip markup if needed |
| `public/problems.html` | Same chrome hooks as Play for shared CSS |
| `public/play-ui.js` | Toggle `#split.dragging`; wire `#sidebar-toggle` open/close |
| `public/ui.js` | Toggle `#split.dragging`; set `aria-pressed` on `#layout-toggle`; wire `#sidebar-toggle` |
| `test/e2e.mjs` | Smoke that pages still load and primary controls remain reachable (optional thin assertions) |

---

### Task 1: pen.dev reference frames

**Files:**
- Create/update: pen.dev document via MCP `user-pencil` `execute` (prefer saving/copying under project `designs/` if the tool allows a path; otherwise use the open canvas and note the path in the PR/commit message)
- Modify: none in repo until frames are reviewed (optional: export PNGs into `designs/` if export is available)

**Interfaces:**
- Consumes: palette from spec (`#11140f`, `#1a1e17`, `#2c3326`, `#dfe3d6`, `#8b937f`, `#b5e655`, `#ff7a6b`); IBM Plex Sans / Mono
- Produces: four top-level screen frames named exactly:
  - `Play Desktop`
  - `Problems Desktop`
  - `Play Mobile`
  - `Problems Mobile`

- [ ] **Step 1: Read pen.dev execute + web-app guidance**

Via MCP `user-pencil` `read_skill` for `execute.md` and `guide/web-app.md` (and schema if needed). Call `get_app_state` and confirm a writable canvas.

- [ ] **Step 2: Set document variables matching current theme**

On the open `.pen` document, define variables for bg/panel/line/fg/muted/accent/bad and spacing used by all four frames. Do not invent a new brand palette.

- [ ] **Step 3: Build `Play Desktop` (1440×900)**

Placeholder frame while building; include:
- Left sidebar ~220px: header row (brand, Problems link, status, Reset), aligned tree action strip, sample tree
- Workspace: toolbar, tabs, editor, **splitter with centered grip ticks**, terminal
- Show splitter in a neutral + hover-looking state (accent/muted grip)

Un-placeholder when done. Verify layout not clipped.

- [ ] **Step 4: Build `Problems Desktop` (1440×900)**

Same chrome rhythm as Play. Include `#layout-toggle`-like control with **accent border + mono label** for active Split mode. Sidebar: brand, Play link, status, problem tabs, article stub, Check.

- [ ] **Step 5: Build `Play Mobile` (390×844) and `Problems Mobile` (390×844)**

Stacked workspace; top bar with brand, mode link, **Files/Problem** drawer control, abbreviated status. Show drawer **open** on one frame and **closed** on the other (label which). Splitter ~12px hit area with grip. Primary actions in sticky toolbar.

- [ ] **Step 6: Review with user**

Ask the human to glance at the four frames. Incorporate feedback before coding CSS. Do not start Task 2 until they approve the mocks (or explicitly say “close enough, implement”).

---

### Task 2: Splitter grip + dragging state

**Files:**
- Modify: `public/style.css` (`#split` rules ~189–196)
- Modify: `public/ui.js` (splitter pointer handlers ~160–189)
- Modify: `public/play-ui.js` (splitter pointer handlers ~152–173)
- Modify: `public/play.html` / `public/problems.html` only if a child grip element is clearer than pure CSS `::after`

**Interfaces:**
- Consumes: existing `#split` element and pointer handlers
- Produces: CSS for grip + `#split.dragging` / `:hover` / `:focus-visible`; JS toggles class `dragging` on pointerdown and clears on pointerup/cancel

- [ ] **Step 1: Add grip styles**

In `public/style.css`, replace the flat `#split` block with something equivalent to:

```css
#split {
  flex: 0 0 6px;
  cursor: row-resize;
  background: var(--line);
  touch-action: none;
  position: relative;
}
#split::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 28px;
  height: 2px;
  transform: translate(-50%, -50%);
  border-radius: 1px;
  background: repeating-linear-gradient(
    90deg,
    var(--muted) 0 3px,
    transparent 3px 5px
  );
  opacity: 0.7;
  pointer-events: none;
}
#split:hover,
#split:focus-visible,
#split.dragging {
  background: #3a4334;
}
#split:hover::after,
#split:focus-visible::after,
#split.dragging::after {
  opacity: 1;
  background: repeating-linear-gradient(
    90deg,
    var(--accent) 0 3px,
    transparent 3px 5px
  );
}
#split:focus { outline: none; }
#split:focus-visible { outline: 1px solid var(--accent); outline-offset: 1px; }
```

(Adjust gradient if a simpler three-dot `content: "⋯"` centered text grip reads clearer in-browser; keep desktop rail at 6px.)

- [ ] **Step 2: Toggle `.dragging` in Problems UI**

In `public/ui.js` splitter block:

```js
split.onpointerdown = (e) => {
  dragging = true;
  split.classList.add("dragging");
  split.setPointerCapture(e.pointerId);
  e.preventDefault();
};
const endDrag = () => {
  if (!dragging) return;
  dragging = false;
  split.classList.remove("dragging");
  localStorage.setItem("ngoding.split", String(editorShare));
};
```

- [ ] **Step 3: Same `.dragging` toggle in Play UI**

Mirror the class add/remove in `public/play-ui.js` splitter handlers.

- [ ] **Step 4: Manual verify**

Run the app (`cargo run` or existing dev server). On `/problems` and `/play`, hover/focus/drag the splitter — grip must brighten; class `dragging` present only while dragging.

- [ ] **Step 5: Commit**

```bash
git add public/style.css public/ui.js public/play-ui.js public/play.html public/problems.html
git commit -m "$(cat <<'EOF'
Polish editor/terminal splitter with grip and drag state.

EOF
)"
```

---

### Task 3: Icon layout picker + Run/Build icons (Play + Problems)

**Files:**
- Modify: `public/problems.html`, `public/play.html` (toolbar: icon+label Run/Build; layout control on the right with menu)
- Modify: `public/style.css` (toolbar left/right groups; layout menu; tooltips; icon sizing; `layout-horizontal`)
- Modify: `public/ui.js` (four modes; menu; horizontal drag axis; migrate `split`→`vertical`)
- Modify: `public/play-ui.js` (same layout picker + horizontal split; share drag class with Task 2)

**Interfaces:**
- Consumes: existing `#workspace`, `#split`, `#layout-toggle` (replaced/expanded)
- Produces:
  - `LAYOUTS = ["vertical", "horizontal", "editor", "shell"]`
  - Migrate: `localStorage ngoding.layout === "split"` → `"vertical"`
  - Classes: `layout-vertical` (alias keep `layout-split` during migrate or map both), `layout-horizontal`, `layout-editor`, `layout-shell`
  - `#layout-toggle` icon button (`aria-haspopup="menu"`, `aria-expanded`); `#layout-menu` with four `role="menuitemradio"` buttons
  - Horizontal mode: workspace uses row flex for editor|split|terminal; splitter `col-resize`; drag uses `clientX`
  - Run/Build: inline SVG (lucide play / hammer) + text; `title` tooltips e.g. `Run (Ctrl-Enter)`, `Build`, `Layout: Vertical`

- [ ] **Step 1: HTML toolbar structure (both pages)**

Toolbar pattern:

```html
<div id="toolbar">
  <div class="toolbar-left">
    <!-- existing Save; Run/Build with <svg class="tb-icon" …> + label -->
  </div>
  <div class="toolbar-right">
    <button id="vim-toggle" …>…</button>
    <div class="layout-picker">
      <button type="button" id="layout-toggle" aria-haspopup="menu" aria-expanded="false" title="Layout"></button>
      <div id="layout-menu" role="menu" hidden>
        <button type="button" role="menuitemradio" data-layout="vertical" title="Editor above shell">Vertical</button>
        <button type="button" role="menuitemradio" data-layout="horizontal" title="Editor beside shell">Horizontal</button>
        <button type="button" role="menuitemradio" data-layout="editor" title="Hide the shell">Editor only</button>
        <button type="button" role="menuitemradio" data-layout="shell" title="Hide the editor">Shell only</button>
      </div>
    </div>
  </div>
</div>
```

Inline 14×14 SVGs for play/hammer/rows/columns/square/terminal (no new npm deps).

- [ ] **Step 2: CSS for picker, horizontal layout, icons**

```css
#toolbar { justify-content: space-between; }
.toolbar-left, .toolbar-right { display: flex; align-items: center; gap: 8px; min-width: 0; }
.tb-icon { width: 14px; height: 14px; flex: 0 0 auto; }
.layout-picker { position: relative; }
#layout-toggle {
  width: 28px; height: 28px; padding: 0;
  display: grid; place-items: center;
  border-color: var(--accent); color: var(--accent);
}
#layout-menu {
  position: absolute; right: 0; top: calc(100% + 4px); z-index: 30;
  min-width: 10rem; padding: 4px;
  background: var(--panel); border: 1px solid var(--line);
}
#layout-menu button {
  display: flex; align-items: center; gap: 8px; width: 100%;
  background: none; border: none; color: var(--fg);
  padding: 6px 8px; cursor: pointer; font: inherit; font-size: 12px;
}
#layout-menu button[aria-checked="true"] { color: var(--accent); background: #ffffff0a; }
#workspace.layout-horizontal {
  flex-direction: row;
  flex-wrap: wrap;
  align-content: stretch;
}
#workspace.layout-horizontal #toolbar,
#workspace.layout-horizontal #editor-tabs {
  flex: 0 0 100%;
}
#workspace.layout-horizontal section#editor {
  flex: var(--editor-share, 0.6) 1 0;
  min-width: 0;
  height: auto;
}
#workspace.layout-horizontal #split {
  flex: 0 0 6px;
  cursor: col-resize;
  align-self: stretch;
  height: auto;
}
#workspace.layout-horizontal main#terminal {
  flex: calc(1 - var(--editor-share, 0.6)) 1 0;
  min-width: 0;
}
```

(Play: include `#editor-tabs` in the full-width row group.)

- [ ] **Step 3: JS layout menu + horizontal drag (ui.js and play-ui.js)**

```js
const LAYOUTS = ["vertical", "horizontal", "editor", "shell"];
const LAYOUT_ICON = { vertical: "rows", horizontal: "cols", editor: "square", shell: "term" };
// migrate split → vertical
if (layout === "split" || !LAYOUTS.includes(layout)) { /* … */ layout = "vertical"; }

function setLayout(mode) {
  layout = mode;
  localStorage.setItem("ngoding.layout", mode);
  const ws = $("workspace");
  ws.classList.remove(...LAYOUTS.map((m) => `layout-${m}`), "layout-split");
  ws.classList.add(`layout-${mode}`);
  // update toggle SVG, aria-checked on menu items, close menu
  $("split").setAttribute("aria-orientation", mode === "horizontal" ? "vertical" : "horizontal");
}
// toggle menu; outside click / Escape closes; menuitem sets layout
// pointer drag: if horizontal use clientX / width; else existing clientY / height
```

- [ ] **Step 4: Manual verify**

Problems + Play: open menu from right; switch all four modes; tooltips on hover; Run/Build show icons; horizontal splitter drags sideways; vertical still works; `split` storage migrates.

- [ ] **Step 5: Commit**

```bash
git add public/style.css public/ui.js public/play-ui.js public/play.html public/problems.html
git commit -m "$(cat <<'EOF'
Add icon layout picker with horizontal split and Run/Build icons.

EOF
)"
```

---

### Task 4: Sidebar header + Play tree toolbar alignment

**Files:**
- Modify: `public/play.html` (header structure)
- Modify: `public/problems.html` (header structure for shared class names)
- Modify: `public/style.css` (`body.play header`, `#tree-toolbar`, Problems `header`)

**Interfaces:**
- Consumes: existing ids `#status`, `#reset`, `#tree-*`
- Produces: `.chrome-header` two-row layout, `.mode-chip` accent link, `.status-pill`, Reset with icon; Play tree toolbar as a single non-wrapping row with `overflow-x: auto`

- [ ] **Step 1: Restructure Play header markup (two rows)**

```html
<header class="chrome-header">
  <div class="chrome-brand-row">
    <h1>ngoding</h1>
    <div class="chrome-status-actions">
      <span id="status" class="status status-pill">loading…</span>
      <button id="reset" class="danger" type="button" title="Reset Play sandbox">
        <!-- rotate-ccw SVG --> Reset
      </button>
    </div>
  </div>
  <a class="mode-chip" href="/problems" title="Open graded problems">
    <!-- book-open SVG --> Problems
  </a>
</header>
```

- [ ] **Step 2: Match Problems header rhythm**

```html
<header class="chrome-header">
  <div class="chrome-brand-row">
    <h1>ngoding</h1>
    <div class="chrome-status-actions">
      <span id="status" class="status status-pill">loading…</span>
    </div>
  </div>
  <a class="mode-chip" href="/play" title="Open the Play sandbox">
    <!-- code SVG --> Play
  </a>
</header>
```

- [ ] **Step 3: CSS for two-row chrome + tree strip**

```css
.chrome-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 12px 12px 10px;
}
.chrome-brand-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
}
.chrome-status-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.mode-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 5px 12px;
  font: 600 11px/1 "IBM Plex Mono", ui-monospace, monospace;
  color: var(--accent);
  text-decoration: none;
  border: 1px solid var(--accent);
  background: #b5e65522;
}
.mode-chip:hover { background: #b5e65533; }
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  background: #ffffff08;
}
button.danger {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

#tree-toolbar {
  display: flex;
  flex-wrap: nowrap;
  gap: 4px;
  padding: 0 8px 8px;
  border-bottom: 1px solid var(--line);
  overflow-x: auto;
}
#tree-toolbar button {
  flex: 0 0 auto;
  font: inherit;
  font-size: 11px;
  line-height: 1;
  height: 24px;
  cursor: pointer;
  background: none;
  color: var(--fg);
  border: 1px solid var(--line);
  padding: 0 8px;
}
```

Remove obsolete `body.play header .status { flex: 1 1 100%; order: 3; }` rules that forced the wrap mess.

- [ ] **Step 4: Manual verify**

Play: brand/link left, status+Reset right on one row; tree buttons same height. Problems: same header alignment.

- [ ] **Step 5: Commit**

```bash
git add public/play.html public/problems.html public/style.css
git commit -m "$(cat <<'EOF'
Align Play and Problems sidebar chrome and tree actions.

EOF
)"
```

---

### Task 5: Mobile drawer + viewport

**Files:**
- Modify: `public/play.html`, `public/problems.html` (viewport meta; `#sidebar-toggle`; backdrop)
- Modify: `public/style.css` (`@media (max-width: 720px) { ... }`)
- Modify: `public/play-ui.js`, `public/ui.js` (drawer open/close; Escape / backdrop click)

**Interfaces:**
- Consumes: `aside` / `#sidebar`, `#workspace`
- Produces:
  - `<meta name="viewport" content="width=device-width, initial-scale=1" />` on both pages
  - Button `#sidebar-toggle` in a top workspace bar or toolbar start
  - `body.sidebar-open` class toggled by JS
  - CSS: single-column grid; aside off-canvas; open state slides/overlays; mobile `#split { flex-basis: 12px; }`

- [ ] **Step 1: Add viewport + toggle markup to both HTML files**

In `<head>`:

```html
<meta name="viewport" content="width=device-width, initial-scale=1" />
```

Inside `#toolbar` as the first control (both pages):

```html
<button type="button" id="sidebar-toggle" aria-expanded="false" aria-controls="sidebar">Files</button>
```

On Problems use label `Problem` (or `Menu`) via the same id — set text in HTML: Play `Files`, Problems `Problem`.

Ensure Play `aside` keeps `id="sidebar"`; add `id="sidebar"` to Problems `<aside>` for `aria-controls`.

Optional backdrop sibling before/after aside:

```html
<div id="sidebar-backdrop" hidden></div>
```

- [ ] **Step 2: Mobile CSS**

```css
@media (max-width: 720px) {
  body,
  body.play {
    grid-template-columns: 1fr;
  }
  aside#sidebar,
  aside {
    position: fixed;
    z-index: 20;
    inset: 0 auto 0 0;
    width: min(320px, 88vw);
    transform: translateX(-105%);
    transition: transform 0.15s ease;
    box-shadow: none;
  }
  body.sidebar-open aside#sidebar,
  body.sidebar-open aside {
    transform: translateX(0);
    box-shadow: 8px 0 24px #0008;
  }
  #sidebar-backdrop {
    display: none;
  }
  body.sidebar-open #sidebar-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 15;
    background: #0008;
  }
  #split {
    flex-basis: 12px;
  }
  #toolbar {
    flex-wrap: wrap;
  }
}
@media (min-width: 721px) {
  #sidebar-toggle,
  #sidebar-backdrop {
    display: none !important;
  }
}
```

Tune selectors so Problems `aside` without prior id still matches after adding `id="sidebar"`.

- [ ] **Step 3: Wire drawer JS (shared pattern in both entry UIs)**

```js
function setSidebarOpen(open) {
  document.body.classList.toggle("sidebar-open", open);
  const btn = $("sidebar-toggle");
  if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
  const backdrop = $("sidebar-backdrop");
  if (backdrop) backdrop.hidden = !open;
}
$("sidebar-toggle").onclick = () =>
  setSidebarOpen(!document.body.classList.contains("sidebar-open"));
$("sidebar-backdrop")?.addEventListener("click", () => setSidebarOpen(false));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") setSidebarOpen(false);
});
```

Add identical helpers to `play-ui.js` and `ui.js` (small duplication is fine; do not invent a new shared module unless it already exists for UI chrome).

- [ ] **Step 4: Manual verify at ~390px**

DevTools responsive mode: drawer opens/closes; backdrop + Escape work; Run/Check reachable; splitter thicker; desktop (≥721px) hides toggle and shows side-by-side again.

- [ ] **Step 5: Commit**

```bash
git add public/play.html public/problems.html public/style.css public/play-ui.js public/ui.js
git commit -m "$(cat <<'EOF'
Add mobile sidebar drawer and viewport meta for Play and Problems.

EOF
)"
```

---

### Task 6: Regression check + docs touch

**Files:**
- Modify: `test/e2e.mjs` only if a quick assertion is cheap (e.g. `#sidebar-toggle` exists); otherwise skip code changes
- Modify: `README.md` only if mobile drawer / layout cues need a one-line mention
- Modify: `docs/superpowers/specs/2026-11-01-ui-polish-terminal-craft-design.md` status → implemented after green checks

**Interfaces:**
- Consumes: existing e2e harness
- Produces: green `npm run test:e2e` (and unit tests if run in CI)

- [ ] **Step 1: Run unit + e2e**

```bash
npm run test:unit
npm run test:e2e
```

Expected: PASS (or only pre-existing failures unrelated to CSS — fix any selector breakage introduced by HTML renames).

- [ ] **Step 2: Fix fallout if any**

If e2e looked for old header structure, update selectors. Do not weaken assertions.

- [ ] **Step 3: Update spec status line**

Set `Status: implemented` (or `implemented; pen.dev mocks on canvas`) on the design doc.

- [ ] **Step 4: Final commit if needed**

```bash
git add test/e2e.mjs README.md docs/superpowers/specs/2026-11-01-ui-polish-terminal-craft-design.md
git commit -m "$(cat <<'EOF'
Verify UI polish against e2e and mark the spec implemented.

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Splitter grip + hover/focus/drag | Task 2 |
| Layout mode accent + mono label | Task 3 |
| Play sidebar header + tree strip alignment | Task 4 |
| Problems sidebar header rhythm | Task 4 |
| Mobile drawer ~720px, top bar toggle | Task 5 |
| Mobile splitter ~12px | Task 5 |
| Viewport / small-screen toolbars | Task 5 |
| pen.dev four frames before CSS | Task 1 |
| Keep palette / no VM changes | Global + all tasks |
| e2e still pass | Task 6 |
