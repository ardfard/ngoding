# Play playground and `/problems` split

Date: 2026-10-31  
Status: approved in chat; ready for implementation plan

## Goal

Split the app into two modes that share the same Debian-in-browser VM image but keep separate saved work:

- `/play` — a sandboxed IDE: directory tree, multi-file editor tabs, terminal, Run and Build
- `/problems` — today's graded exercise UI, unchanged in behavior
- `/` — redirect to `/play`, with navigation between Play and Problems

## Routing and pages

- Serve `/play` as the playground HTML entry.
- Move the current exercise page to `/problems`.
- `/` is an axum redirect to `/play`.
- Each page links to the other.
- Thin entry scripts (`play.js`, `problems.js`), not an SPA router. Shared modules stay shared: `vm.js`, `editor.js`, `languages.js`, `store.js`, and the new tree/build modules.
- Embed paths in `src/main.rs` like today's app files: `/play` → `public/play.html`, `/problems` → `public/problems.html`, plus their JS/CSS.

## VM persistence

- Same image and `version.json` snapshot for both modes.
- Separate IndexedDB save keys, e.g. `vm:play` and `vm:problems`.
- Parameterize `vm.js` (or its boot/save helpers) with the mode's save key and any mode-specific session id used inside the saved blob.
- Reset on one page deletes only that mode's key.
- Autosave rules stay as today, applied per mode (dirty work, interval, tab hide, after Check on Problems).
- Play does not call `/api/session` or `/api/grade`. Problems keeps `ngoding.token`, solved ticks, and grading as today.
- Migration: if the old single save key exists, copy it once into `vm:problems`, then stop reading the old key. Play starts with no save until the user works there.

## Agent

Keep a fixed verb set on `image/agent.sh` (root on ttyS1). Do not add arbitrary shell exec on the agent; the student already has a shell on ttyS0.

New verbs, with paths handled like existing `read` / `write` (no extra `/home/user`-only confine):

| Verb | Behavior |
|------|----------|
| `ls` | List one directory. Reply with `DATA <id> <base64>` then `DONE`. Decoded payload: one entry per line, `d\tname` or `f\tname` (dirs/files). Skip `.` and `..`. |
| `mkdir` | `mkdir -p` on the path; `chown` to `user` like `write` does for parents where practical. |
| `rm` | Recursive remove of one path (`rm -rf`), so tree Delete works on files and folders. |
| `mv` | Rename/move; fits the existing `a` / `b` args on the agent read loop. |

Unchanged: `ping`, `write`, `read`, `resize`, `init`.

`vm.js` adds wrappers: `listDir`, `mkdir`, `rm`, `mv`.

Requires `npm run build:image` so the snapshot includes the new agent.

## Play UI

Layout:

- Left: file tree rooted at `/home/user` (expand/collapse, refresh after mutations).
- Center: CodeMirror with tabs (path, dirty mark, close).
- Bottom (or under a splitter like today): xterm terminal.
- Toolbar: Save, Run (active file), Build, syntax/language for the active file, Vim, status, Reset, link to Problems.

Tree actions: New file, New folder, Rename, Delete (with confirm), open file on click.

Editor:

- Open → `readFile` into a tab; Ctrl-S → `writeFile`.
- Unsaved text kept per path across tab switches.
- Language from extension via `languages.js`.
- Run uses today's single-file compile/run for the active path.
- `beforeunload` if any tab is dirty.

Build:

- Detect project markers by walking from the active file's directory up to `/home/user`. First match wins. Defaults: `Cargo.toml` → `cargo build`, `go.mod` → `go build .`, `Makefile` → `make`, `uv.lock` or `pyproject.toml` → `uv sync`. If nothing matches, Build stays disabled until the user sets a custom command.
- Toolbar shows the effective command. User can edit it. Override in `localStorage` under a Play-only key (v1: one global override). Non-empty override wins over detection.
- Build types `cd <dir> && <command>` into the terminal. `<dir>` is the marker directory when detection won, else `/home/user` when using a custom command with no marker.

Problems page stays the exercise UI. Only add a nav link to Play.

Out of scope for v1: drag-drop upload, search-in-files, git UI, split editor panes, LSP.

## Errors and edge cases

- Failed agent calls: show a short status message; do not clear unrelated tabs.
- Missing file on open: show status, do not leave a stuck loading tab (close it).
- Delete/rename of an open path: confirm, then close that tab (discard unsaved buffer for that path).
- Binary or files over a fixed size cap (e.g. 1 MiB): show in the tree, refuse to open in the editor.
- After mkdir/rm/mv/create, refresh the affected tree region.
- Snapshot name change invalidates saves the same way as today, for both keys.
- Agent line protocol stays `id verb a b`; keep `ls` payload self-contained in `DATA` so names can contain spaces.

## Testing

- Keep existing Problems e2e coverage.
- Add Play e2e: list `~`, create file, open/edit/save, rename/delete, Run active file, Build with detected and custom command, Reset on Play leaves Problems save alone (and the reverse).
- Pure detection helpers for build commands can get a small unit test if easy; otherwise assert via e2e.
- Rebuild the image before Play agent e2e.

## Docs

Update the README for two modes, separate saves, Play tree/build override, and `/` → `/play`.
