# Shareable play sessions and optional accounts

Date: 2026-11-02  
Status: approved in chat; ready for implementation plan

## Goal

Make playground sessions recoverable and shareable without forcing an account on every visitor:

- Optional email magic-link accounts for wipe recovery and cross-device access
- Server-stored play session metadata (auto when signed in) and full VM snapshots (explicit upload)
- Share links that fork a `~/` file pack into a new local session
- Exercise solved progress synced to the account when signed in
- Local IndexedDB remains the fast path; cloud load is on demand when local is missing

Anonymous local play stays the default. Cloud features activate only after sign-in (except opening a share fork, which does not require an account).

## Architecture

```
Browser (optional account)
  local: IndexedDB vm:play:<id> + localStorage session meta / solved
  signed in: PUT metadata → server; explicit “Save to cloud” uploads snapshot
  share: publish ~/ pack → GET /s/<shareId> → fork into new local session

Server (Rust / axum)
  Postgres: users, sessions, shares, exercise_progress, magic_tokens
  Disk (NGODING_DATA_DIR): snapshot blobs + share packs
  SMTP (optional): magic-link mail; else log/return link when NGODING_DEV_AUTH=1
```

- Opening `/play?s=<id>`: local snapshot first; if missing and the signed-in user owns a cloud snapshot, download into IndexedDB then boot; otherwise template/empty boot.
- Share always forks; it never mutates the owner’s session.
- Owner cloud save = full gzipped v86 state. Share pack = `~/` files only (much smaller).

## Data model

### Postgres

| Table | Purpose |
|---|---|
| `users` | `id`, `email` (unique), `created_at` |
| `magic_tokens` | `token_hash`, `email`, `expires_at`, `used_at` — one-time login |
| `sessions` | Play sessions: `id` (UUID, preserved from client when claimed), `user_id`, `name`, `template`, `created_at`, `updated_at`, `image` (v86 state id), `snapshot_path` (nullable until first cloud save), `snapshot_bytes`, `snapshot_saved_at` |
| `shares` | `id` (public slug), `session_id`, `user_id`, `pack_path`, `created_at`, `expires_at` (nullable) |
| `exercise_progress` | `user_id`, `solved` (jsonb array of problem ids), `updated_at` |

### Disk (`NGODING_DATA_DIR`)

- `snapshots/<session_id>.bin.gz` — owner’s explicit full VM save
- `shares/<share_id>.tar.gz` — `~/` tree for forks

### Auth

- HttpOnly cookie `ngoding_auth`: signed token (HMAC with `NGODING_SECRET`) binding `user_id`
- Magic link flow: request → email (or console/dev JSON) with `/auth/callback?token=…` → set cookie → redirect `/`

### Claiming local work

On first successful sign-in (and on subsequent home loads while signed in):

- Upsert local play session metadata to the server, keeping the same UUIDs so `/play?s=<uuid>` stays stable
- Merge exercise progress as the **union** of local `solved` and server `solved`, then write that union to both places
- Snapshot upload remains explicit (“Save to cloud”)

## Image versioning

Today a new `build:image` makes older local saves obsolete because the client only knows the latest `version.json` image. For cloud (and local) restores we keep multiple images:

- `version.json` names the **default** image for **new** sessions
- `build:image` **adds** a new `state-<hash>.bin.zst` and leaves prior state files in place (optional retention/prune later)
- `flat/` stays content-addressed; old hashes remain as long as files are not deleted
- Each save (local + cloud) records `image`
- Restore boots with that session’s `image`, not necessarily the latest
- If the referenced `state-*.bin.zst` is missing from `NGODING_IMAGE_DIR` → clear error and offer reset to the current default image
- Share forks always boot on the **current** default image (files only; no old memory snapshot)

## APIs

### Auth

- `POST /api/auth/request` `{ email }` — create magic token; send mail or, with `NGODING_DEV_AUTH=1` and no SMTP, return/log the link
- `GET /auth/callback?token=` — consume once, set cookie, redirect `/`
- `GET /api/auth/me` — `{ user }` or 401
- `POST /api/auth/logout` — clear cookie

### Play sessions (signed-in)

- `GET /api/play/sessions` — list cloud metadata
- `PUT /api/play/sessions/:id` — upsert name/template/timestamps (auto after local create/rename/touch)
- `DELETE /api/play/sessions/:id` — delete meta + snapshot blob
- `PUT /api/play/sessions/:id/snapshot` — raw gzip body (explicit save); enforce size cap (e.g. 100 MiB)
- `GET /api/play/sessions/:id/snapshot` — owner-only download for on-demand local restore

### Shares

- Creating a share **requires sign-in** (session row must be owned by the cookie user). Forking does not.
- `POST /api/play/sessions/:id/share` — client walks `~/` via `listDir`/`readFile`, uploads pack; returns `/s/<shareId>`. Does not require a prior full VM snapshot upload.
- `GET /s/:shareId` — landing page with “Fork into my playground”
- `POST /api/shares/:id/fork` — returns pack; client creates a new local session id and applies files after boot. Sign-in not required for fork.

### Exercise

- `PUT /api/exercise/progress` `{ solved: string[] }` — replace server set with the body (client sends the union after merge)
- `GET /api/exercise/progress` — restore into `localStorage` on sign-in / home load

Existing `POST /api/session` and `POST /api/grade` for grading stay as they are (HMAC seed tokens unrelated to user accounts).

## Client flows

### `/play?s=<id>` load order

1. Local IndexedDB hit → boot as today (using saved `image` when present)
2. Else if signed in and cloud snapshot exists → download → store locally → boot with that `image`
3. Else empty/template boot on current default image

### Sync policy

- Signed in: session metadata and exercise progress sync automatically
- Full VM snapshot: only on explicit “Save to cloud”
- Signed out: no cloud calls for sync; local behavior unchanged

### UI (minimal)

- Home: email sign-in; when signed in show email, cloud-backed vs local-only sessions, logout
- Play toolbar: “Save to cloud” (when signed in), Share (copies `/s/<id>` after publish)
- Persist status can distinguish local saved vs last cloud save

## Config

| Variable | Role |
|---|---|
| `DATABASE_URL` | Postgres. If unset, auth/share/cloud APIs return 503 and UI hides cloud; local play still works |
| `NGODING_DATA_DIR` | Snapshot/share files (default `./data`) |
| `NGODING_SECRET` | Cookie signing + existing grade tokens |
| `SMTP_URL` / `SMTP_FROM` | Optional mail (Resend SMTP and others work) |
| `NGODING_DEV_AUTH` | When set and SMTP unset, expose magic link in API/logs for local testing |
| Snapshot max size / magic-link TTL (~15m) / optional share TTL | Server constants or env |

## Errors

- Magic link expired/used → error page + request another
- Snapshot over cap / bad body → 413/400; local save kept
- Cloud restore failure → empty/template boot + toast; do not delete other sessions
- Missing share → 404 landing
- Missing historical image file → message + offer reset to current image
- No cookie → metadata sync is a no-op

## Testing

- Rust: magic token consume-once; session ownership; progress upsert; share fork; snapshot authz; multi-image boot id respected in stored metadata
- Node unit: claim/merge helpers; load-order decision; pack shape
- e2e: dev magic link → metadata sync → explicit snapshot upload → wipe IndexedDB → `/play?s=` restores from server; share → fork yields new session with files; exercise progress round-trips when signed in

## Out of scope (v1)

- Live collaboration / shared editing
- Password auth or OAuth providers beyond magic link
- Cloud snapshots of the exercise VM
- Admin UI, CDN/object-store blobs
- Automatic pruning UI for old `state-*.bin.zst` files

## Implementation notes

- Extend the axum server; keep the single-binary deploy (`./ngoding` + image dir + data dir + Postgres)
- Reuse `play-sessions.js` / `store.js` / `vm.js`; add a small cloud client module rather than scattering `fetch` calls
- Prefer preserving client session UUIDs on claim so existing bookmarks and `/play?s=` links keep working after sign-in
