# Shareable sessions + optional accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optional magic-link accounts with Postgres-backed play session metadata, explicit VM snapshot cloud save, on-demand restore, anonymous share/fork of `~/`, and synced exercise progress — without breaking anonymous local play.

**Architecture:** Extend the axum binary with a Postgres pool (disabled gracefully when `DATABASE_URL` is unset). Auth is an HttpOnly HMAC cookie after email magic link (SMTP or `NGODING_DEV_AUTH`). Blobs live under `NGODING_DATA_DIR`. Browser keeps IndexedDB as the fast path; cloud load runs only when local is missing. Share packs are gzipped JSON file trees (not full VM state). Multiple `state-*.bin.zst` images are retained so old sessions keep booting.

**Tech Stack:** Rust (axum 0.8, sqlx + Postgres, lettre for SMTP), vanilla JS modules, IndexedDB (`store.js`), Node `--test`, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-11-02-shareable-sessions-accounts-design.md`

## Global Constraints

- Anonymous local play remains the default; cloud sync requires sign-in except share create/fork.
- Creating a share does **not** require login; anonymous shares are link-only and can be lost.
- Full VM snapshot upload is **explicit** (“Save to cloud”); metadata + exercise progress sync automatically when signed in.
- Preserve client session UUIDs on claim so `/play?s=<uuid>` stays stable.
- Share pack = `~/` files only; forks boot on the **current** default image.
- Restore boots with the session’s stored `image` id; keep historical `state-*.bin.zst` and `flat/` hashes.
- If `DATABASE_URL` unset: auth/cloud/share APIs return 503; UI hides account features; local play works.
- Magic-link TTL ~15 minutes; snapshot upload cap 100 MiB.
- Follow existing style: small diffs, TDD for pure helpers, embed new public files in `src/main.rs`, no drive-by refactors.
- Grade tokens (`POST /api/session`, `/api/grade`) stay separate from user accounts.

## File map

| File | Responsibility |
|------|----------------|
| `migrations/001_init.sql` | Postgres schema |
| `src/db.rs` | Pool connect, migrate, typed queries |
| `src/auth.rs` | Magic-token hash, cookie sign/verify, request/consume helpers |
| `src/mail.rs` | SMTP send or dev log |
| `src/cloud.rs` | Play session / snapshot / share / exercise HTTP handlers |
| `src/main.rs` | Wire state, routes, embeds, data dir |
| `Cargo.toml` | sqlx, lettre, uuid, chrono, tower-http (trace optional) |
| `public/cloud-api.js` | `fetch` wrappers for auth/sessions/snapshot/share/progress |
| `public/share-pack.js` | Walk `~/` → pack JSON; apply pack after boot |
| `public/session-load.js` | Load-order: local → cloud → empty; claim/merge helpers |
| `public/auth-ui.js` | Home sign-in form wiring (or inline in `home.js` if tiny) |
| `public/home.js` / `index.html` / `style.css` | Account UI + sync on load |
| `public/play-ui.js` / `play.html` | Share + Save to cloud buttons |
| `public/share.html` / `public/share.js` | `/s/:id` landing + fork |
| `public/vm.js` | Multi-image restore (don’t wipe on image mismatch if file exists) |
| `public/exercise-progress.js` | `unionSolved(a, b)` |
| `public/ui.js` / `home.js` | Progress pull/push when signed in |
| `image/build-state.mjs` | Stop deleting prior `state-*.bin.zst` |
| `image/build.sh` | Merge `flat/` instead of wiping hashes |
| `test/*.test.mjs` | Unit tests for pack, load-order, union, cloud helpers |
| `test/e2e.mjs` | Dev-auth restore + share fork flows |
| `README.md` | Document env vars and flows |

---

### Task 1: Postgres schema + pool + degraded mode

**Files:**
- Create: `migrations/001_init.sql`
- Create: `src/db.rs`
- Modify: `Cargo.toml`
- Modify: `src/main.rs` (AppState with `Option<PgPool>`, data dir)

**Interfaces:**
- Consumes: `DATABASE_URL`, `NGODING_DATA_DIR` (default `./data`)
- Produces:
  - `pub struct AppState { pub sessions: Arc<Sessions>, pub secret: String, pub db: Option<PgPool>, pub data_dir: PathBuf, pub mail: MailConfig }`
  - `pub async fn connect_db() -> Option<PgPool>` — `None` if env unset; run migrations when `Some`
  - Tables per spec: `users`, `magic_tokens`, `play_sessions` (name `play_sessions` to avoid clashing with grade `Sessions`), `shares`, `exercise_progress`

- [ ] **Step 1: Add dependencies**

```toml
# Cargo.toml — add:
sqlx = { version = "0.8", features = ["runtime-tokio", "postgres", "uuid", "chrono", "migrate", "json"] }
uuid = { version = "1", features = ["serde", "v4"] }
chrono = { version = "0.4", features = ["serde"] }
lettre = { version = "0.11", default-features = false, features = ["tokio1-rustls-tls", "smtp-transport", "builder"] }
```

- [ ] **Step 2: Write migration**

```sql
-- migrations/001_init.sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE magic_tokens (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE TABLE play_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  image TEXT,
  snapshot_path TEXT,
  snapshot_bytes BIGINT,
  snapshot_saved_at TIMESTAMPTZ
);

CREATE TABLE shares (
  id TEXT PRIMARY KEY,
  source_session_id UUID,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  pack_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);

CREATE TABLE exercise_progress (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  solved JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- [ ] **Step 3: Implement `src/db.rs` connect + migrate**

```rust
// Outline — use sqlx::postgres::PgPoolOptions and sqlx::migrate!("./migrations")
pub async fn connect_db() -> anyhow::Result<Option<sqlx::PgPool>> {
    let Ok(url) = std::env::var("DATABASE_URL") else { return Ok(None) };
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(5)
        .connect(&url)
        .await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    Ok(Some(pool))
}
```

Prefer returning `Result` and logging; if you want zero new error crates, map errors to `std::io::Error` like the rest of `main`.

- [ ] **Step 4: Wire `AppState` in `main`; create `data/snapshots` and `data/shares` dirs; keep existing `/api/session` and `/api/grade` working**

- [ ] **Step 5: Run `cargo test` and `cargo build`**

Expected: PASS (no new failing tests yet). With `DATABASE_URL` unset, server still starts.

- [ ] **Step 6: Commit**

```bash
git add Cargo.toml Cargo.lock migrations src/db.rs src/main.rs
git commit -m "Add Postgres pool and schema for accounts."
```

---

### Task 2: Auth primitives (magic token + cookie) — TDD in Rust

**Files:**
- Create: `src/auth.rs`
- Modify: `src/main.rs` (`mod auth;`)

**Interfaces:**
- Consumes: `secret: &[u8]`
- Produces:
  - `hash_token(raw: &str) -> String` (sha256 hex)
  - `issue_magic_raw() -> String` (32+ bytes URL-safe)
  - `sign_cookie(user_id: Uuid, exp_unix: i64, secret: &[u8]) -> String` format `user_id.exp.sig`
  - `verify_cookie(value: &str, secret: &[u8], now_unix: i64) -> Option<Uuid>`
  - Magic TTL constant: `MAGIC_TTL_SECS = 15 * 60`
  - Cookie TTL: e.g. 30 days

- [ ] **Step 1: Write failing unit tests in `src/auth.rs`**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn cookie_round_trips() {
        let secret = b"test-secret";
        let uid = Uuid::nil();
        let exp = 2_000_000_000i64;
        let c = sign_cookie(uid, exp, secret);
        assert_eq!(verify_cookie(&c, secret, exp - 10), Some(uid));
        assert_eq!(verify_cookie(&c, secret, exp + 1), None);
        assert_eq!(verify_cookie(&c, b"other", exp - 10), None);
    }

    #[test]
    fn token_hash_is_stable_and_not_raw() {
        let raw = "abc";
        let h = hash_token(raw);
        assert_ne!(h, raw);
        assert_eq!(h, hash_token(raw));
        assert_eq!(h.len(), 64);
    }
}
```

- [ ] **Step 2: Run tests — expect FAIL (module missing / unresolved)**

Run: `cargo test -q auth::`

- [ ] **Step 3: Implement `sign_cookie` / `verify_cookie` / `hash_token` / `issue_magic_raw` using existing hmac+sha2 style from `session.rs`**

- [ ] **Step 4: Run `cargo test -q auth::` — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/auth.rs src/main.rs
git commit -m "Add auth cookie and magic-token helpers."
```

---

### Task 3: Auth HTTP routes + mail + dev link

**Files:**
- Create: `src/mail.rs`
- Modify: `src/cloud.rs` (create) or handlers in `src/auth_routes` — prefer `src/cloud.rs` for all new HTTP
- Modify: `src/main.rs` routes
- Modify: `src/db.rs` — insert user, insert/consume magic token

**Interfaces:**
- `POST /api/auth/request` `{ "email": "a@b.c" }` → `{ "ok": true, "devLink"?: "..." }`
- `GET /auth/callback?token=` → Set-Cookie `ngoding_auth=...; HttpOnly; Path=/; SameSite=Lax`, redirect `/`
- `GET /api/auth/me` → `{ "user": { "id", "email" } }` or 401
- `POST /api/auth/logout` → clear cookie
- Without DB: all return 503 `{ "error": "accounts unavailable" }`
- `MailConfig { smtp_url, smtp_from, dev_auth: bool }` from `SMTP_URL`, `SMTP_FROM`, `NGODING_DEV_AUTH`

- [ ] **Step 1: Implement mail**

```rust
// src/mail.rs outline
pub async fn send_magic_link(cfg: &MailConfig, email: &str, link: &str) -> Result<(), String> {
    if let Some(url) = &cfg.smtp_url {
        // lettre AsyncSmtpTransport from SMTP_URL; body is plain text with link
        ...
    } else if cfg.dev_auth {
        eprintln!("[dev-auth] magic link for {email}: {link}");
        Ok(())
    } else {
        Err("mail not configured".into())
    }
}
```

- [ ] **Step 2: Implement request handler**

- Normalize email (trim + lowercase)
- Upsert nothing yet until callback (or create user on request — either is fine; **prefer create-on-callback** so junk emails don’t create users)
- Insert `magic_tokens` row with hash, expiry = now+15m
- Build absolute link from `NGODING_PUBLIC_URL` (default `http://localhost:{port}`) + `/auth/callback?token=`
- If `dev_auth && smtp unset`, include `devLink` in JSON

- [ ] **Step 3: Implement callback**

- Lookup hash, reject if missing/expired/used
- Mark used; upsert user by email; set cookie; redirect `/`

- [ ] **Step 4: Manual smoke (with Postgres)**

```bash
export DATABASE_URL=postgres://localhost/ngoding
export NGODING_DEV_AUTH=1
cargo run --release
curl -s -X POST localhost:8080/api/auth/request -H 'content-type: application/json' -d '{"email":"t@example.com"}'
# open returned devLink in browser; then:
curl -s localhost:8080/api/auth/me -H "Cookie: ngoding_auth=..."
```

Expected: `me` returns the user.

- [ ] **Step 5: Commit**

```bash
git add src/mail.rs src/cloud.rs src/db.rs src/main.rs
git commit -m "Add magic-link auth API and SMTP/dev mail."
```

---

### Task 4: Client auth UI + `cloud-api.js`

**Files:**
- Create: `public/cloud-api.js`
- Modify: `public/index.html`, `public/home.js`, `public/style.css`
- Modify: `src/main.rs` embed list (`/cloud-api.js`)

**Interfaces (`cloud-api.js`):**
```js
export async function authMe() // → user | null (401 → null; 503 → null)
export async function authRequest(email) // → { ok, devLink? }
export async function authLogout()
export function accountsAvailable(meResultOrFlag) // UI helper
```

- [ ] **Step 1: Write unit test for a tiny pure helper if any (e.g. email trim) — optional skip if no pure logic**

- [ ] **Step 2: Implement `cloud-api.js` with `credentials: "same-origin"` on all calls**

- [ ] **Step 3: Add home account strip**

Markup sketch in `index.html` header:

```html
<div id="account" class="home-account" hidden>
  <form id="auth-form" class="home-auth-form">
    <label class="sr-only" for="auth-email">Email</label>
    <input id="auth-email" type="email" required placeholder="you@example.com" autocomplete="email" />
    <button type="submit" class="home-btn home-btn-secondary">Sign in</button>
  </form>
  <p id="auth-status" class="home-auth-status" hidden></p>
  <div id="auth-signed-in" hidden>
    <span id="auth-email-label"></span>
    <button type="button" id="auth-logout" class="home-btn home-btn-secondary">Log out</button>
  </div>
</div>
```

Show `#account` only when `GET /api/auth/me` is not 503 (try me; if 503 hide; if 401 show form; if 200 show signed-in).

On submit: call `authRequest`; if `devLink`, show “Check your email” **and** a clickable link for local dev.

- [ ] **Step 4: Embed + `cargo test` embed path assertion for `/cloud-api.js`**

- [ ] **Step 5: Commit**

```bash
git add public/cloud-api.js public/index.html public/home.js public/style.css src/main.rs
git commit -m "Add home sign-in UI and cloud API client."
```

---

### Task 5: Play session metadata API + client sync

**Files:**
- Modify: `src/cloud.rs`, `src/db.rs`
- Modify: `public/cloud-api.js`, `public/home.js`, `public/play-sessions.js` (optional hook), `public/play-ui.js`

**Interfaces:**
- `GET /api/play/sessions` → `{ sessions: [...] }` (auth required)
- `PUT /api/play/sessions/:id` body `{ name, template, createdAt, updatedAt, image? }` upsert for cookie user only
- `DELETE /api/play/sessions/:id` deletes row + snapshot file if any
- Client: `upsertPlaySession(session)`, `listCloudSessions()`, `deleteCloudSession(id)`
- After `createSession` / `touchSession` / rename (if any) when signed in → fire-and-forget upsert
- On home load when signed in: merge cloud list into localStorage (cloud wins on newer `updatedAt`; always ensure local meta exists for cloud rows)

- [ ] **Step 1: Server handlers with ownership checks**

- [ ] **Step 2: Client sync on home + after create**

```js
// home.js after successful authMe user:
import { listSessions, /* ... */ } from "./play-sessions.js";
import { listCloudSessions, upsertPlaySession } from "./cloud-api.js";

async function syncSessionsToCloud() {
  for (const s of listSessions()) {
    await upsertPlaySession(s);
  }
}
async function pullCloudSessions() {
  const remote = await listCloudSessions();
  // for each remote: if local missing or remote.updatedAt > local.updatedAt, write local meta
}
```

- [ ] **Step 3: Manual test — sign in, create session, `GET /api/play/sessions` shows it**

- [ ] **Step 4: Commit**

```bash
git add src/cloud.rs src/db.rs public/cloud-api.js public/home.js public/play-ui.js
git commit -m "Sync play session metadata when signed in."
```

---

### Task 6: Snapshot upload / download + on-demand restore

**Files:**
- Create: `public/session-load.js`
- Create: `test/session-load.test.mjs`
- Modify: `src/cloud.rs`, `public/cloud-api.js`, `public/play-ui.js`, `public/play.html`, `public/vm.js` (only if needed for injecting preloaded blob — prefer writing IndexedDB before `boot`)

**Interfaces:**
```js
// session-load.js
export async function resolvePlaySnapshot({ sessionId, localGet, cloudGetSnapshot, signedIn }) {
  // returns { source: "local"|"cloud"|"none", record? }
  const local = await localGet(playSaveKey(sessionId));
  if (local?.blob) return { source: "local", record: local };
  if (signedIn) {
    const cloud = await cloudGetSnapshot(sessionId); // null if 404
    if (cloud) return { source: "cloud", record: cloud };
  }
  return { source: "none" };
}
```

- Server:
  - `PUT /api/play/sessions/:id/snapshot` raw body, `Content-Type: application/gzip`, max 100 MiB; write `data/snapshots/<id>.bin.gz`; update row
  - `GET /api/play/sessions/:id/snapshot` owner only; 404 if none

- [ ] **Step 1: Failing unit tests for `resolvePlaySnapshot`**

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolvePlaySnapshot } from "../public/session-load.js";

describe("resolvePlaySnapshot", () => {
  it("prefers local", async () => {
    const r = await resolvePlaySnapshot({
      sessionId: "a",
      localGet: async () => ({ blob: "x", image: "state-1.bin.zst", session: "play:a", savedAt: 1 }),
      cloudGetSnapshot: async () => ({ blob: "y" }),
      signedIn: true,
    });
    assert.equal(r.source, "local");
  });
  it("falls back to cloud when signed in", async () => {
    const r = await resolvePlaySnapshot({
      sessionId: "a",
      localGet: async () => null,
      cloudGetSnapshot: async () => ({ blob: "y", image: "state-1.bin.zst", session: "play:a", savedAt: 2 }),
      signedIn: true,
    });
    assert.equal(r.source, "cloud");
  });
  it("skips cloud when signed out", async () => {
    const r = await resolvePlaySnapshot({
      sessionId: "a",
      localGet: async () => null,
      cloudGetSnapshot: async () => ({ blob: "y" }),
      signedIn: false,
    });
    assert.equal(r.source, "none");
  });
});
```

- [ ] **Step 2: Run `node --test test/session-load.test.mjs` — FAIL**

- [ ] **Step 3: Implement helper + server endpoints + `uploadSnapshot` / `downloadSnapshot` in `cloud-api.js`**

Cloud download should return the same shape as IndexedDB: `{ image, session, savedAt, blob }` (send `image`/`savedAt` via headers or a small JSON sidecar; simplest: `multipart` or JSON `{ image, savedAt, blobBase64 }` — **prefer** response headers `X-Ngoding-Image`, `X-Ngoding-Saved-At` + raw gzip body to avoid base64 bloat).

- [ ] **Step 4: In `play-ui.js` before `vm.boot`:**

```js
const me = await authMe();
const resolved = await resolvePlaySnapshot({...});
if (resolved.source === "cloud") {
  await store.put(playSaveKey(sessionId), resolved.record);
}
// then boot as today
```

Add toolbar button `#cloud-save` (hidden unless signed in) that `await vm.save()` then `uploadSnapshot(id, blob, { image, savedAt })`.

- [ ] **Step 5: Run unit tests — PASS; manual wipe IndexedDB + restore**

- [ ] **Step 6: Commit**

```bash
git add public/session-load.js test/session-load.test.mjs public/cloud-api.js public/play-ui.js public/play.html src/cloud.rs src/main.rs
git commit -m "Add explicit cloud VM snapshots and on-demand restore."
```

---

### Task 7: Multi-image retain + restore by saved image

**Files:**
- Modify: `image/build-state.mjs` (remove deletion loop of old states)
- Modify: `image/build.sh` (do not wipe entire `flat/`; copy/merge new hashes)
- Modify: `public/vm.js` boot path
- Create: `test/vm-image.test.mjs` for pure decision helper if extracted

**Interfaces:**
```js
// Prefer extracting from vm.js:
export function chooseBootImage({ saved, currentImage, imageExists }) {
  // if !saved → { kind: "fresh", image: currentImage }
  // if saved.session mismatch → treat as none (existing behavior)
  // if saved.image === currentImage || imageExists(saved.image) → { kind: "restore", image: saved.image }
  // else → { kind: "missing-image", image: currentImage }
}
```

- [ ] **Step 1: Write failing tests for `chooseBootImage`**

- [ ] **Step 2: Implement helper; change `boot` to:**
  - HEAD or GET check `/v86/${saved.image}` (or trust cloud/local record and let V86 404)
  - If missing image: message + offer reset (delete save, fresh boot)
  - **Do not** delete save merely because `saved.image !== currentImage` when the old file exists
  - Set module `image` variable to the image actually used for this boot so subsequent saves keep the correct id (when user continues on old image, keep saving that id; optional “upgrade” is out of scope)

- [ ] **Step 3: Fix `build-state.mjs`**

Delete this line loop:

```js
for (const f of readdirSync(out)) if (/^state(-[0-9a-f]+)?\.bin\.zst$/.test(f)) rmSync(resolve(out, f));
```

Keep writing the new file + updating `version.json`.

- [ ] **Step 4: Fix `build.sh` flat retention**

Instead of `rm -rf "$out/flat"`, build into a temp flat and `mv` new hash files into `$out/flat/` (create dir if needed), replacing only colliding hashes (content-addressed → same content OK). Still refresh `fs.json` for the new image.

- [ ] **Step 5: Unit tests PASS; commit**

```bash
git add image/build-state.mjs image/build.sh public/vm.js test/vm-image.test.mjs
git commit -m "Retain historical VM images and restore by saved id."
```

---

### Task 8: Anonymous share create + fork

**Files:**
- Create: `public/share-pack.js`, `test/share-pack.test.mjs`
- Create: `public/share.html`, `public/share.js`
- Modify: `src/cloud.rs`, `src/main.rs` (route `/s/:id` → share.html; embed), `public/play-ui.js`, `public/play.html`, `public/cloud-api.js`, `public/style.css`

**Pack format (gzipped JSON on disk as `shares/<id>.json.gz`):**

```json
{
  "version": 1,
  "root": "/home/user",
  "files": [{ "path": "workspace/main.py", "text": "..." }]
}
```

Paths relative to root; skip huge/binary files > 1 MiB text with a warning count in the UI. No auth required for `POST /api/shares` or fork.

**Interfaces:**
```js
export async function collectSharePack(vm, { root = "/home/user", listDir, readFile }) // → pack object
export function applySharePackPlan(pack) // → [{ path, text }] normalized
```

- [ ] **Step 1: Failing tests for pack path normalize / apply plan**

```js
it("strips root prefix and rejects ..", () => {
  const files = applySharePackPlan({
    version: 1,
    root: "/home/user",
    files: [{ path: "workspace/a.py", text: "x" }, { path: "../etc/passwd", text: "no" }],
  });
  assert.deepEqual(files, [{ path: "/home/user/workspace/a.py", text: "x" }]);
});
```

- [ ] **Step 2: Implement collect (recursive listDir + readFile) + server `POST /api/shares`**

Server: generate `id` with `uuid` simple or 26-char nanoid-style from rand; write pack file; insert `shares` with `user_id` from cookie if present else null; return `{ id, url: "/s/"+id }`.

- [ ] **Step 3: `GET /s/:id` serves `share.html`; `share.js` calls `POST /api/shares/:id/fork` → `{ pack }` then `createSession`, writes files after boot (navigate to `/play?s=newId&fork=<shareId>` and let play-ui apply, **or** apply on share page then redirect — prefer `?fork=` on play to reuse VM boot once)

Recommended flow:
1. Share page button → `createSession()` + `location = /play?s=new&fork=shareId`
2. `play-ui` boots fresh, then `GET/POST fork` pack and `writeFile` each path under workspace

- [ ] **Step 4: Play toolbar Share button — always visible; copies absolute URL**

- [ ] **Step 5: Unit tests PASS; manual create+fork**

- [ ] **Step 6: Commit**

```bash
git add public/share-pack.js test/share-pack.test.mjs public/share.html public/share.js public/play-ui.js public/play.html public/cloud-api.js public/style.css src/cloud.rs src/main.rs
git commit -m "Add anonymous playground share and fork."
```

---

### Task 9: Exercise progress sync

**Files:**
- Modify: `public/exercise-progress.js`, `test/exercise-progress.test.mjs`
- Modify: `src/cloud.rs`, `public/cloud-api.js`, `public/home.js`, `public/ui.js`

**Interfaces:**
```js
export function unionSolved(a, b) {
  return [...new Set([...(a ?? []), ...(b ?? [])])];
}
```

- `GET /api/exercise/progress` → `{ solved: string[] }`
- `PUT /api/exercise/progress` `{ solved: string[] }` replaces server set

- [ ] **Step 1: Failing test for `unionSolved`**

- [ ] **Step 2: Implement + on home signed-in:**

```js
const local = JSON.parse(localStorage.getItem("ngoding.solved") ?? "[]");
const remote = await getExerciseProgress(); // { solved } or null
const merged = unionSolved(local, remote?.solved ?? []);
localStorage.setItem("ngoding.solved", JSON.stringify(merged));
await putExerciseProgress(merged);
```

- [ ] **Step 3: After successful Check in `ui.js`, if signed in, PUT updated solved list**

- [ ] **Step 4: Tests PASS; commit**

```bash
git add public/exercise-progress.js test/exercise-progress.test.mjs public/home.js public/ui.js public/cloud-api.js src/cloud.rs
git commit -m "Sync exercise solved progress for signed-in users."
```

---

### Task 10: e2e + README

**Files:**
- Modify: `test/e2e.mjs`
- Modify: `README.md`

- [ ] **Step 1: Add e2e section (skip or soft-skip if no `DATABASE_URL`)**

Flow with `NGODING_DEV_AUTH=1`:
1. Home → request magic link via `page.evaluate` fetch → open `devLink`
2. Create play session, write a file, Save to cloud
3. Delete IndexedDB key for that session
4. Reload `/play?s=` → file/content restored (or snapshot restored)
5. Share → open `/s/` → fork → new session contains file
6. Mark exercise solved → logout/login other browser context → progress present

- [ ] **Step 2: Document in README**

Env: `DATABASE_URL`, `NGODING_DATA_DIR`, `SMTP_URL`, `SMTP_FROM`, `NGODING_DEV_AUTH`, `NGODING_PUBLIC_URL`.  
Flows: optional account, Save to cloud, share links, multi-image retention.

- [ ] **Step 3: Run `npm run test:unit` and e2e with server configured**

- [ ] **Step 4: Commit**

```bash
git add test/e2e.mjs README.md
git commit -m "Cover cloud restore and shares in e2e; document env."
```

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| Optional magic-link accounts | 2–4 |
| Postgres metadata | 1, 5, 9 |
| On-disk blobs | 1, 6, 8 |
| Explicit snapshot save + on-demand load | 6 |
| Metadata auto-sync when signed in | 5 |
| Anonymous share create + fork | 8 |
| Exercise progress union sync | 9 |
| Multi-image retain/restore | 7 |
| Degraded mode without DB | 1, 3–4 |
| SMTP + dev auth | 3 |
| e2e / README | 10 |

## Placeholder / consistency notes

- Table name `play_sessions` (not `sessions`) avoids clashing with grade `Sessions` type.
- Share storage uses `.json.gz` instead of `.tar.gz` for easy browser collect/apply; semantics match the spec.
- Cookie name `ngoding_auth`; grade token stays `ngoding.token` in localStorage.
