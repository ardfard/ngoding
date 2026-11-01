# Landing page + playground sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a home page at `/` that starts/resumes playground sessions and enters Exercise on the first unsolved problem, with the mode toggle removed and Problems renamed to Exercise.

**Architecture:** Keep thin multi-page entries (no SPA). Add a pure JS session registry in `localStorage` with one IndexedDB VM key per playground session (`vm:play:<id>`). Landing is a new embedded HTML page; `/play?s=<id>` requires a session id; `/exercise` replaces `/problems` (old path redirects). Exercise progress stays `ngoding.solved` + server session/grade APIs.

**Tech Stack:** pen.dev MCP canvas (`design/main.pen`), vanilla HTML/CSS/JS, axum (`src/main.rs`), IndexedDB via `store.js`, Node test runner + Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-11-01-landing-sessions-design.md`

## Global Constraints

- Sessions are **playground-only**; Exercise uses solved/not-yet only.
- Persistence is **local only** (`localStorage` + IndexedDB); no cloud sync.
- User-facing name is **Exercise** (not Problems); Rust `problems` module may stay.
- Routes: `/` landing, `/play?s=<id>`, `/exercise`, `/problems` → `/exercise`.
- Missing/unknown `?s=` on Play → redirect to `/`.
- Brand “ngoding” on Play/Exercise → `/`; **remove** mode-segment toggle.
- Migrate once: empty session list + legacy `vm:play` → first session; `vm:problems` → `vm:exercise`.
- Exercise entry: first unsolved problem, else first problem; home shows **N done · M not yet**.
- Design home frames on pen.dev via MCP (`user-highagency.pencildev-extension-pencil`), not the unauthenticated CLI.
- Follow existing style (small diffs, TDD for pure helpers, no drive-by refactors).
- Keep working e2e selectors where possible (`#check`, `#editor-run`, `#tree`, etc.).

## File map

| File | Responsibility |
|------|----------------|
| `design/main.pen` | Home Desktop + Home Mobile frames |
| `public/play-sessions.js` | Playground session registry CRUD + save-key helpers + legacy meta migrate |
| `public/exercise-progress.js` | `stats` + `pickProblem` pure helpers |
| `test/play-sessions.test.mjs` | Unit tests for session registry |
| `test/exercise-progress.test.mjs` | Unit tests for pick/stats |
| `public/index.html` | Landing markup |
| `public/home.js` | Landing wiring (list, new, delete, exercise CTA + stats) |
| `public/style.css` | Landing layout styles (reuse existing CSS variables) |
| `src/main.rs` | Embed `/` + `/home.js`; `/exercise`; redirect `/problems` → `/exercise`; drop `/`→`/play` |
| `public/play.html` / `play-ui.js` | Require `?s=`; per-session save key; brand link; no toggle; migrate `vm:play` |
| `public/exercise.html` (from `problems.html`) | Rename copy; brand link; no toggle; script entry |
| `public/exercise.js` (from `problems.js`) | Thin entry → `ui.js` |
| `public/ui.js` | Auto-pick unsolved; `saveKey: "vm:exercise"` + migrate from `vm:problems` |
| `test/e2e.mjs` | Home, multi-session, exercise rename/redirect, banner |
| `README.md` | Document `/`, sessions, `/exercise` |

---

### Task 1: Playground session registry (TDD)

**Files:**
- Create: `public/play-sessions.js`
- Create: `test/play-sessions.test.mjs`

**Interfaces:**
- Consumes: `localStorage` only (no IndexedDB in this module)
- Produces:
  - `SESSIONS_KEY = "ngoding.play.sessions"`
  - `playSaveKey(id: string): string` → `vm:play:${id}`
  - `LEGACY_PLAY_SAVE_KEY = "vm:play"`
  - `listSessions(): { id, name, createdAt, updatedAt }[]` (newest `updatedAt` first)
  - `getSession(id: string): session | null`
  - `createSession(now?: number): session` — id via `crypto.randomUUID()`, name `Session ${n}` where `n = list.length + 1` before insert, both timestamps = `now ?? Date.now()`
  - `touchSession(id: string, now?: number): session | null` — bumps `updatedAt`
  - `removeSession(id: string): boolean` — removes meta only
  - `migrateLegacyPlayMeta(hasLegacyBlob: boolean, now?: number): session | null` — if list empty and `hasLegacyBlob`, create one session and return it; else `null`

- [ ] **Step 1: Write the failing tests**

```js
// test/play-sessions.test.mjs
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  SESSIONS_KEY,
  playSaveKey,
  listSessions,
  createSession,
  touchSession,
  removeSession,
  getSession,
  migrateLegacyPlayMeta,
} from "../public/play-sessions.js";

beforeEach(() => {
  localStorage.clear();
});

describe("playSaveKey", () => {
  it("namespaces by id", () => {
    assert.equal(playSaveKey("abc"), "vm:play:abc");
  });
});

describe("createSession + listSessions", () => {
  it("creates Session 1 then Session 2, newest first", () => {
    const a = createSession(1000);
    const b = createSession(2000);
    assert.equal(a.name, "Session 1");
    assert.equal(b.name, "Session 2");
    assert.deepEqual(
      listSessions().map((s) => s.id),
      [b.id, a.id],
    );
  });
});

describe("touchSession", () => {
  it("bumps updatedAt and re-sorts", () => {
    const a = createSession(1000);
    const b = createSession(2000);
    touchSession(a.id, 3000);
    assert.equal(listSessions()[0].id, a.id);
    assert.equal(getSession(a.id).updatedAt, 3000);
  });
});

describe("removeSession", () => {
  it("drops meta", () => {
    const a = createSession(1000);
    assert.equal(removeSession(a.id), true);
    assert.equal(listSessions().length, 0);
    assert.equal(getSession(a.id), null);
  });
});

describe("migrateLegacyPlayMeta", () => {
  it("creates one session when list empty and legacy blob exists", () => {
    const s = migrateLegacyPlayMeta(true, 5000);
    assert.ok(s);
    assert.equal(listSessions().length, 1);
    assert.equal(s.createdAt, 5000);
  });
  it("no-ops when list non-empty", () => {
    createSession(1);
    assert.equal(migrateLegacyPlayMeta(true, 2), null);
    assert.equal(listSessions().length, 1);
  });
  it("no-ops without legacy blob", () => {
    assert.equal(migrateLegacyPlayMeta(false), null);
  });
});
```

Note: Node’s test runner has no `localStorage` by default. At the top of the test file (or in the module under test via injectable storage — prefer a tiny in-memory shim in the test file):

```js
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `node --test test/play-sessions.test.mjs`  
Expected: FAIL (module missing / exports missing)

- [ ] **Step 3: Implement `public/play-sessions.js`**

Minimal implementation matching the interfaces above. Persist JSON array under `SESSIONS_KEY`. Validate shape on read (ignore corrupt entries; if JSON parse fails, treat as `[]`).

- [ ] **Step 4: Run tests — expect PASS**

Run: `node --test test/play-sessions.test.mjs`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/play-sessions.js test/play-sessions.test.mjs
git commit -m "$(cat <<'EOF'
Add local playground session registry helpers.

EOF
)"
```

---

### Task 2: Exercise progress helpers (TDD)

**Files:**
- Create: `public/exercise-progress.js`
- Create: `test/exercise-progress.test.mjs`

**Interfaces:**
- Consumes: plain arrays (no I/O)
- Produces:
  - `exerciseStats(problems: {id:string}[], solvedIds: Iterable<string>): { done: number, notYet: number, total: number }`
  - `pickExerciseProblem(problems: T[], solvedIds: Iterable<string>): T | null` — first problem whose `id` is not in solved set; if all solved (or solved empty of matches), return `problems[0]` or `null` if `problems` empty

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { exerciseStats, pickExerciseProblem } from "../public/exercise-progress.js";

const probs = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("exerciseStats", () => {
  it("counts done and not yet", () => {
    assert.deepEqual(exerciseStats(probs, ["a"]), { done: 1, notYet: 2, total: 3 });
  });
  it("ignores unknown solved ids", () => {
    assert.deepEqual(exerciseStats(probs, ["a", "zzz"]), { done: 1, notYet: 2, total: 3 });
  });
});

describe("pickExerciseProblem", () => {
  it("picks first unsolved", () => {
    assert.equal(pickExerciseProblem(probs, ["a"]).id, "b");
  });
  it("falls back to first when all solved", () => {
    assert.equal(pickExerciseProblem(probs, ["a", "b", "c"]).id, "a");
  });
  it("returns null when empty", () => {
    assert.equal(pickExerciseProblem([], []), null);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `node --test test/exercise-progress.test.mjs`

- [ ] **Step 3: Implement `public/exercise-progress.js`**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add public/exercise-progress.js test/exercise-progress.test.mjs
git commit -m "$(cat <<'EOF'
Add exercise done/not-yet and pick-first-unsolved helpers.

EOF
)"
```

---

### Task 3: pen.dev Home frames

**Files:**
- Modify: `design/main.pen` via MCP `user-highagency.pencildev-extension-pencil`

**Interfaces:**
- Consumes: existing slate/terminal-craft variables already on the canvas (reuse; do not invent a new brand palette)
- Produces: top-level frames named exactly:
  - `Home Desktop`
  - `Home Mobile`

- [ ] **Step 1: Read pen skill + app state**

Call `read_skill` (SKILL.md + `execute.md` / web-app guide as needed). `get_app_state` on `design/main.pen`.

- [ ] **Step 2: Build `Home Desktop` (~1440×900)**

One composition:
- Hero: **ngoding** + short supporting line
- Two panels: Playground (New session + sample session rows with relative times + delete affordance) and Exercise (e.g. `1 done · 1 not yet` + Continue/Start)
- Match existing type/color rhythm from Play/Problems Slate frames

- [ ] **Step 3: Build `Home Mobile` (~390×844)**

Same content stacked vertically; primary actions still obvious without the mode toggle.

- [ ] **Step 4: Review with user**

Show screenshots / ask them to glance at the two frames. Do **not** start Task 4 until they approve (or say “close enough, implement”).

- [ ] **Step 5: Commit** (if the `.pen` file is tracked and changed)

```bash
git add design/main.pen
git commit -m "$(cat <<'EOF'
Add Home Desktop and Mobile frames to the pen design.

EOF
)"
```

---

### Task 4: Landing page + server routes for `/` and `/exercise`

**Files:**
- Create: `public/index.html`, `public/home.js`
- Modify: `public/style.css` (landing section only)
- Modify: `src/main.rs` (embed map + router)
- Possibly keep `public/problems.html` temporarily until Task 6 renames — for this task, embed `/` → `index.html`, `/home.js`, add `/exercise` pointing at current problems HTML **or** wait until Task 6; prefer: in this task only wire `/` + `/home.js` and change `/` redirect; add `/exercise` embed in Task 6 together with the rename to avoid a half-renamed route.

**Split for clarity:** This task delivers a working landing at `/` that can navigate to `/play?s=` and `/exercise` (even if `/exercise` still 404 until Task 6 — then temporarily link Exercise CTA to `/problems` and flip the href in Task 6). **Better:** Task 6 first? Order below keeps TDD pure modules first; for routes, implement `/` here with Exercise button → `/problems`, Task 6 switches href + adds `/exercise` redirect.

**Revised Task 4 scope:** landing UI + `/` served; Exercise CTA href=`/problems` until Task 6.

**Interfaces:**
- Consumes: `listSessions`, `createSession`, `removeSession`, `touchSession`, `playSaveKey` from `play-sessions.js`; `exerciseStats` from `exercise-progress.js`; `store.del` when deleting a session; `POST /api/session` for problem catalog
- Produces: navigable home page

- [ ] **Step 1: Add landing markup `public/index.html`**

Structure (ids stable for e2e):
- `body.home`
- brand header
- `#playground-panel` with `#new-session`, `#session-list`
- `#exercise-panel` with `#exercise-stats`, `#start-exercise`
- script module `/home.js`

Match approved pen frames; reuse CSS variables from `:root` in `style.css`.

- [ ] **Step 2: Implement `public/home.js`**

- Render session list (name, relative `updatedAt`, delete button). Relative time helper inline is fine (`just now`, `Nm ago`, `Nh ago`, else locale date).
- `#new-session` → `createSession()` → `location.href = "/play?s=" + encodeURIComponent(id)`
- Row click / open → `touchSession(id)` → same navigate
- Delete → `removeSession(id)` + `store.del(playSaveKey(id))` + re-render (stopPropagation on delete)
- Empty list: short hint text
- On load: `POST /api/session` with existing token; compute stats with `exerciseStats(problems, solved)`; set `#exercise-stats` text to `${done} done · ${notYet} not yet`; `#start-exercise` label `Continue` if `done > 0` else `Start`; href `/problems` (Task 6 flips to `/exercise`)
- If session API fails, still show playground; stats show `—` / disable exercise button with title explaining offline/server

- [ ] **Step 3: CSS for `.home`**

Desktop two-column panels; `@media (max-width: 720px)` stack. No new purple/glow aesthetic — match existing terminal craft.

- [ ] **Step 4: Wire server**

In `src/main.rs` `embed!` add:
```rust
"/" => "public/index.html",
"/home.js" => "public/home.js",
"/play-sessions.js" => "public/play-sessions.js",
"/exercise-progress.js" => "public/exercise-progress.js",
```

Remove:
```rust
.route("/", any(|| async { Redirect::temporary("/play") }))
```

Ensure embedded `/` is served by the existing static embedded handler (same as `/play`). If the catch-all only serves `EMBEDDED` keys, registering `"/"` in `APP` is enough once the redirect route is removed — verify route order so `/` is not shadowed.

Update the content_type test if it asserted redirect-only behavior; add assert `EMBEDDED["/"].path` ends with `index.html`.

- [ ] **Step 5: Smoke manually or with curl**

Run: `cargo test` and `cargo run --release`, open `http://localhost:8080/`, confirm HTML loads.

- [ ] **Step 6: Commit**

```bash
git add public/index.html public/home.js public/style.css src/main.rs public/play-sessions.js public/exercise-progress.js
git commit -m "$(cat <<'EOF'
Serve a landing page at / with playground sessions and exercise stats.

EOF
)"
```

---

### Task 5: Play requires session id; remove toggle; brand → home

**Files:**
- Modify: `public/play.html`
- Modify: `public/play-ui.js`
- Modify: `src/main.rs` only if new imports need embedding (already embedded in Task 4)

**Interfaces:**
- Consumes: `getSession`, `touchSession`, `createSession`, `migrateLegacyPlayMeta`, `playSaveKey`, `LEGACY_PLAY_SAVE_KEY` from `play-sessions.js`; `store.get` / `store.put` / `store.del`
- Produces: Play boots only for a valid `?s=`

- [ ] **Step 1: Update `play.html`**

- Remove `<nav class="mode-segment">…</nav>`
- Wrap brand: `<a class="brand" href="/">` around h1 + caret (preserve classes for CSS)
- Optional: show session name in chrome later — **YAGNI**, skip unless pen shows it

- [ ] **Step 2: Session gate + migrate in `play-ui.js`**

At start of boot (before VM):

```js
import * as sessions from "./play-sessions.js";
import * as store from "./store.js";

const params = new URLSearchParams(location.search);
let sessionId = params.get("s");

const legacy = await store.get(sessions.LEGACY_PLAY_SAVE_KEY);
const migrated = sessions.migrateLegacyPlayMeta(!!legacy);
if (migrated && legacy) {
  await store.put(sessions.playSaveKey(migrated.id), legacy);
  await store.del(sessions.LEGACY_PLAY_SAVE_KEY);
  if (!sessionId) sessionId = migrated.id;
}

if (!sessionId || !sessions.getSession(sessionId)) {
  location.replace("/");
  return;
}
sessions.touchSession(sessionId);

// boot VM:
session: sessionId,
saveKey: sessions.playSaveKey(sessionId),
```

Reset: `store.del(playSaveKey(sessionId))` then reload (do **not** remove registry entry).

- [ ] **Step 3: Manual check**

`/play` alone → `/`. Create session from home → Play loads.

- [ ] **Step 4: Commit**

```bash
git add public/play.html public/play-ui.js
git commit -m "$(cat <<'EOF'
Bind Play to a session id and link the brand back home.

EOF
)"
```

---

### Task 6: Rename Problems → Exercise; auto-pick; VM key migrate

**Files:**
- Create: `public/exercise.html` (copy from `problems.html` with renames)
- Create: `public/exercise.js` (copy from `problems.js`)
- Modify: `public/ui.js`
- Modify: `public/home.js` (CTA → `/exercise`)
- Modify: `src/main.rs` (embed `/exercise`, `/exercise.js`; redirect `/problems` → `/exercise`; keep `/problems.js` / old html embedded **or** remove if unused — prefer keep `problems.js` only if still referenced; point `/problems` redirect only)
- Modify: `public/problems.html` — optional stub not needed if redirect is server-side
- Update any remaining user-visible “Problems” / “problem” picker labels that should say Exercise (picker can still say “Exercise” for the mode; individual items remain problem titles)

**Interfaces:**
- Consumes: `pickExerciseProblem` from `exercise-progress.js`
- Produces: `/exercise` workspace

- [ ] **Step 1: Add `exercise.html` / `exercise.js`**

From problems templates:
- title `ngoding — Exercise`
- script `/exercise.js`
- remove mode-segment
- brand link to `/`
- picker label `EXERCISE` (was `PROBLEM`)
- search placeholder `Search exercises…`
- keep element ids (`#check`, `#problem-select`, etc.) for e2e stability

`exercise.js`:
```js
import { startApp } from "./ui.js";
import * as vm from "./vm.js";
startApp(vm).catch(...);
```

- [ ] **Step 2: `ui.js` pick + save key**

After loading problems/solved:

```js
import { pickExerciseProblem } from "./exercise-progress.js";
let current = pickExerciseProblem(problems, solved) ?? problems[0];
```

Boot:
```js
saveKey: "vm:exercise",
```

Before boot, migrate:
```js
const legacy = await store.get("vm:problems");
if (legacy && !(await store.get("vm:exercise"))) {
  await store.put("vm:exercise", legacy);
  await store.del("vm:problems");
}
```

(Import `store` if not already.)

- [ ] **Step 3: Server routes**

```rust
"/exercise" => "public/exercise.html",
"/exercise.js" => "public/exercise.js",
"/exercise-progress.js" => "public/exercise-progress.js", // if not already
```

Router:
```rust
.route("/problems", any(|| async { Redirect::temporary("/exercise") }))
```

Remove `"/problems" => "public/problems.html"` from embed **or** leave file unreferenced. Update unit test that used `EMBEDDED["/problems"]` to `EMBEDDED["/exercise"]`.

- [ ] **Step 4: Flip home CTA** to `/exercise`

- [ ] **Step 5: `cargo test` + quick browser check**

- [ ] **Step 6: Commit**

```bash
git add public/exercise.html public/exercise.js public/ui.js public/home.js src/main.rs
git commit -m "$(cat <<'EOF'
Rename graded mode to Exercise and open the first unsolved item.

EOF
)"
```

---

### Task 7: E2E + README

**Files:**
- Modify: `test/e2e.mjs`
- Modify: `README.md`

**Interfaces:**
- Consumes: running server on `URL` env (default update: home at `/`, exercise at `/exercise`)

- [ ] **Step 1: Update e2e defaults and flows**

- Change default `APP_URL` from `.../problems` to `.../exercise` (or start at `/` and navigate).
- Assert `/` has `#new-session` and `#start-exercise`.
- New session → URL matches `/play?s=`; write a marker file; create second session; confirm first session’s marker still present when reopened (separate IndexedDB keys).
- Exercise: with `ngoding.solved` pre-seeded for first problem id if feasible via `localStorage`, assert selected problem is the next; else assert picker visible and “Exercise” chrome (no mode-segment).
- `GET /problems` → 307/302 to `/exercise`.
- Brand link `a.brand[href="/"]` exists on play and exercise.
- Remove assertions that depend on mode-segment Play|Problems links.

- [ ] **Step 2: Run unit + e2e**

```bash
npm run test:unit
cargo test
# server running:
npm run test:e2e
```

Expected: PASS

- [ ] **Step 3: Update README**

Replace Play/Problems split description with:
- `/` home (sessions + exercise stats)
- `/play?s=` playground session
- `/exercise` graded mode
- local multi-session playground saves
- `/problems` redirects to `/exercise`

- [ ] **Step 4: Commit**

```bash
git add test/e2e.mjs README.md
git commit -m "$(cat <<'EOF'
Cover landing sessions in e2e and document the new routes.

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| `/` landing | 3, 4 |
| `/play?s=<id>` | 5 |
| `/exercise` + `/problems` redirect | 6 |
| Mode toggle removed | 5, 6 |
| Brand → home | 5, 6 |
| Session registry + per-id VM keys | 1, 5 |
| Legacy `vm:play` migrate | 1, 5 |
| Exercise stats on home | 2, 4 |
| First unsolved (else first) | 2, 6 |
| `vm:exercise` migrate from `vm:problems` | 6 |
| pen frames | 3 |
| Tests + README | 1, 2, 7 |

## Self-review notes

- No TBD placeholders in task steps.
- `playSaveKey` / `SESSIONS_KEY` / `vm:exercise` names consistent across tasks.
- Task 4 temporarily links Exercise to `/problems`; Task 6 must flip to `/exercise` (called out explicitly).
- pen review gate before coding landing CSS/HTML from frames.
