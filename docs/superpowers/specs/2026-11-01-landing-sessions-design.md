# Landing page, playground sessions, Exercise rename

Date: 2026-11-01  
Status: approved in chat; ready for implementation plan

## Goal

Replace the `/` → `/play` redirect with a real home page that chooses how to enter the app:

- **Playground** — multiple named local sessions (new + resume/delete)
- **Exercise** — graded mode (renamed from Problems); progress is solved / not yet; entry opens the first unsolved problem (or the first problem if all are solved)

Remove the Play | Problems mode toggle. The ngoding banner returns to home.

## Routes and naming

| Path | Behavior |
|------|----------|
| `/` | Landing page |
| `/play?s=<id>` | Playground for session `id` |
| `/exercise` | Graded exercise workspace |
| `/problems` | Redirect to `/exercise` |
| `/problems.js` etc. | Keep serving existing assets as needed; primary HTML entry becomes `/exercise` → `public/exercise.html` (or rename in place and update embeds) |

- Thin entry scripts stay (no SPA router).
- Server (`src/main.rs`): stop redirecting `/` to `/play`; embed landing HTML/JS/CSS; add `/exercise` route; keep `/problems` as redirect for bookmarks.
- Copy: user-facing “Problems” → “Exercise” (UI strings, titles, aria). Internal Rust module `problems` / problem ids may stay for now.

## Landing UI

One composition, matching the existing terminal-craft / slate language in `design/main.pen`:

1. Brand **ngoding** as the hero signal + one short supporting line (in-browser Linux sandbox).
2. Two panels below (side-by-side desktop, stacked mobile):
   - **Playground** — primary control “New session”; list of past sessions (name + relative updated time), newest first; empty state hint; per-row delete.
   - **Exercise** — stats “N done · M not yet”; primary “Continue” or “Start” (label by whether any progress exists).
3. Add **Home Desktop** and **Home Mobile** frames to `design/main.pen`, then generate `public/index.html` (or equivalent), shared `style.css` additions, and a small `home.js` (or similar).

No mode toggle, no dashboard clutter, no cards beyond the interactive panels.

## Playground sessions (local only)

### Registry

`localStorage` key `ngoding.play.sessions`:

```json
[
  { "id": "<opaque>", "name": "Session 1", "createdAt": <ms>, "updatedAt": <ms> }
]
```

- New session: generate id, default name `Session N` (N = 1 + current count), append, navigate to `/play?s=<id>`.
- Open session: bump `updatedAt`, navigate to `/play?s=<id>`.
- Delete: remove from list and delete IndexedDB key `vm:play:<id>`.
- Sort list by `updatedAt` descending on home.

### VM persistence

- Each playground session uses IndexedDB save key `vm:play:<id>` (same blob shape as today’s `vm:play`).
- `play-ui.js` boots with `session: id` and `saveKey: "vm:play:" + id`.
- Missing or unknown `?s=` → redirect to `/`.
- **Migration:** if list is empty and old key `vm:play` exists, create one session, move/copy the blob to `vm:play:<id>`, then stop using `vm:play`.

### Play chrome

- Remove Play | Exercise (mode-seg) toggle from `play.html`.
- Brand / `h1` ngoding is a link to `/`.
- Reset deletes only the current session’s VM key (session registry entry remains unless user deletes on home).

## Exercise mode

### Progress

Unchanged: `ngoding.token`, `ngoding.solved` (array of problem ids). Exercise still uses server `POST /api/session` and `POST /api/grade`.

### Home stats

Landing calls `POST /api/session` (same payload as today) to obtain the problem catalog ids/titles. Done = intersection of catalog with `ngoding.solved`; not yet = rest. No new public problems API in this change.

### Entry behavior

- Navigate to `/exercise`.
- On load, select the first catalog problem whose id is not in `ngoding.solved`; if none, select the first problem.
- Show done / not yet on home only (workspace keeps existing per-problem solved ticks).

### Persistence rename

- VM save key `vm:exercise` (migrate once from `vm:problems` if present).
- Remove mode toggle from exercise HTML; brand → `/`.
- User-facing rename Problems → Exercise everywhere in that surface.

## Design → code

1. Add home frames to `design/main.pen` via pen.dev (match existing style tokens).
2. Generate / hand-implement landing markup and styles from those frames.
3. Wire routes and session logic as above.
4. Update README briefly for `/`, sessions, and `/exercise`.

## Testing

- **Unit:** session registry create/list/delete/migrate; pick first unsolved (and all-solved → first).
- **E2E:** `/` renders CTAs; new session opens `/play?s=…` with isolated save key; second session does not clobber the first; exercise entry selects unsolved; `/problems` redirects; banner returns home; mode toggle absent.

## Out of scope

- Cloud sync / accounts
- Renaming sessions in UI (default names only)
- Multi-session for Exercise
- Changing Rust problem definitions or grading
- Arbitrary agent verbs
