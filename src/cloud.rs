use axum::{
    body::{Body, to_bytes},
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Redirect, Response},
    Json,
};
use chrono::{Duration, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::PgPool;
use uuid::Uuid;

use crate::auth::{
    hash_token, issue_magic_raw, sign_cookie, verify_cookie, COOKIE_NAME, COOKIE_TTL_SECS,
    MAGIC_TTL_SECS,
};
use crate::mail::send_magic_link;
use crate::AppState;

fn unavailable() -> Response {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        [(header::CONTENT_TYPE, "application/json")],
        json!({ "error": "accounts unavailable" }).to_string(),
    )
        .into_response()
}

fn json_ok(status: StatusCode, payload: Value) -> Response {
    (
        status,
        [(header::CONTENT_TYPE, "application/json"), (header::CACHE_CONTROL, "no-store")],
        payload.to_string(),
    )
        .into_response()
}

fn cookie_user(headers: &HeaderMap, secret: &str) -> Option<Uuid> {
    let cookie = headers.get(header::COOKIE)?.to_str().ok()?;
    for part in cookie.split(';') {
        let part = part.trim();
        if let Some(val) = part.strip_prefix(&format!("{COOKIE_NAME}=")) {
            let now = Utc::now().timestamp();
            return verify_cookie(val, secret.as_bytes(), now);
        }
    }
    None
}

fn set_auth_cookie(user_id: Uuid, secret: &str) -> String {
    let exp = Utc::now().timestamp() + COOKIE_TTL_SECS;
    let value = sign_cookie(user_id, exp, secret.as_bytes());
    format!("{COOKIE_NAME}={value}; HttpOnly; Path=/; SameSite=Lax; Max-Age={COOKIE_TTL_SECS}")
}

fn clear_auth_cookie() -> String {
    format!("{COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0")
}

#[derive(Deserialize)]
pub struct AuthRequestBody {
    email: String,
}

pub async fn auth_request(State(state): State<AppState>, Json(body): Json<AuthRequestBody>) -> Response {
    let Some(db) = state.db.as_ref() else {
        return unavailable();
    };
    let email = body.email.trim().to_lowercase();
    if email.is_empty() || !email.contains('@') {
        return json_ok(StatusCode::BAD_REQUEST, json!({ "error": "bad email" }));
    }
    let raw = issue_magic_raw();
    let token_hash = hash_token(&raw);
    let expires_at = Utc::now() + Duration::seconds(MAGIC_TTL_SECS);
    if let Err(e) = sqlx::query(
        "INSERT INTO magic_tokens (token_hash, email, expires_at) VALUES ($1, $2, $3)",
    )
    .bind(&token_hash)
    .bind(&email)
    .bind(expires_at)
    .execute(db)
    .await
    {
        eprintln!("magic token insert: {e}");
        return json_ok(StatusCode::INTERNAL_SERVER_ERROR, json!({ "error": "server error" }));
    }
    let link = format!(
        "{}/auth/callback?token={}",
        state.public_url.trim_end_matches('/'),
        raw
    );
    match send_magic_link(&state.mail, &email, &link).await {
        Ok(()) => {
            let mut payload = json!({ "ok": true });
            if state.mail.dev_auth && state.mail.smtp_url.is_none() {
                payload["devLink"] = json!(link);
            }
            json_ok(StatusCode::OK, payload)
        }
        Err(e) => json_ok(StatusCode::INTERNAL_SERVER_ERROR, json!({ "error": e })),
    }
}

#[derive(Deserialize)]
pub struct CallbackQuery {
    token: Option<String>,
}

pub async fn auth_callback(State(state): State<AppState>, Query(q): Query<CallbackQuery>) -> Response {
    let Some(db) = state.db.as_ref() else {
        return Redirect::temporary("/?auth=unavailable").into_response();
    };
    let Some(raw) = q.token.filter(|t| !t.is_empty()) else {
        return Redirect::temporary("/?auth=missing").into_response();
    };
    let token_hash = hash_token(&raw);
    let row = sqlx::query_as::<_, (String, Option<chrono::DateTime<Utc>>)>(
        "SELECT email, used_at FROM magic_tokens WHERE token_hash = $1 AND expires_at > now()",
    )
    .bind(&token_hash)
    .fetch_optional(db)
    .await;

    let Ok(Some((email, used_at))) = row else {
        return Redirect::temporary("/?auth=invalid").into_response();
    };
    if used_at.is_some() {
        return Redirect::temporary("/?auth=used").into_response();
    }

    if let Err(e) = sqlx::query("UPDATE magic_tokens SET used_at = now() WHERE token_hash = $1")
        .bind(&token_hash)
        .execute(db)
        .await
    {
        eprintln!("magic token use: {e}");
        return Redirect::temporary("/?auth=error").into_response();
    }

    let user_id = match upsert_user(db, &email).await {
        Ok(id) => id,
        Err(e) => {
            eprintln!("upsert user: {e}");
            return Redirect::temporary("/?auth=error").into_response();
        }
    };

    let mut res = Redirect::temporary("/").into_response();
    res.headers_mut().insert(
        header::SET_COOKIE,
        set_auth_cookie(user_id, &state.secret).parse().unwrap(),
    );
    res
}

async fn upsert_user(db: &PgPool, email: &str) -> Result<Uuid, sqlx::Error> {
    if let Some((id,)) = sqlx::query_as::<_, (Uuid,)>("SELECT id FROM users WHERE email = $1")
        .bind(email)
        .fetch_optional(db)
        .await?
    {
        return Ok(id);
    }
    let id = Uuid::new_v4();
    sqlx::query("INSERT INTO users (id, email) VALUES ($1, $2)")
        .bind(id)
        .bind(email)
        .execute(db)
        .await?;
    Ok(id)
}

pub async fn auth_me(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let Some(db) = state.db.as_ref() else {
        return unavailable();
    };
    let Some(uid) = cookie_user(&headers, &state.secret) else {
        return json_ok(StatusCode::UNAUTHORIZED, json!({ "error": "unauthorized" }));
    };
    let row = sqlx::query_as::<_, (Uuid, String)>("SELECT id, email FROM users WHERE id = $1")
        .bind(uid)
        .fetch_optional(db)
        .await;
    match row {
        Ok(Some((id, email))) => json_ok(StatusCode::OK, json!({ "user": { "id": id, "email": email } })),
        Ok(None) => json_ok(StatusCode::UNAUTHORIZED, json!({ "error": "unauthorized" })),
        Err(e) => {
            eprintln!("auth_me: {e}");
            json_ok(StatusCode::INTERNAL_SERVER_ERROR, json!({ "error": "server error" }))
        }
    }
}

pub async fn auth_logout() -> Response {
    let mut res = json_ok(StatusCode::OK, json!({ "ok": true }));
    res.headers_mut()
        .insert(header::SET_COOKIE, clear_auth_cookie().parse().unwrap());
    res
}

pub fn require_user(headers: &HeaderMap, secret: &str) -> Result<Uuid, Response> {
    cookie_user(headers, secret).ok_or_else(|| {
        json_ok(StatusCode::UNAUTHORIZED, json!({ "error": "unauthorized" }))
    })
}

pub fn require_db(state: &AppState) -> Result<&PgPool, Response> {
    state.db.as_ref().ok_or_else(unavailable)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaySessionBody {
    name: String,
    template: Option<String>,
    created_at: i64,
    updated_at: i64,
    image: Option<String>,
}

#[derive(sqlx::FromRow)]
struct PlaySessionRow {
    id: Uuid,
    name: String,
    template: Option<String>,
    created_at: chrono::DateTime<Utc>,
    updated_at: chrono::DateTime<Utc>,
    image: Option<String>,
    snapshot_path: Option<String>,
    snapshot_saved_at: Option<chrono::DateTime<Utc>>,
}

fn session_json(row: &PlaySessionRow) -> Value {
    json!({
        "id": row.id,
        "name": row.name,
        "template": row.template,
        "createdAt": row.created_at.timestamp_millis(),
        "updatedAt": row.updated_at.timestamp_millis(),
        "image": row.image,
        "hasSnapshot": row.snapshot_path.is_some(),
        "snapshotSavedAt": row.snapshot_saved_at.map(|t| t.timestamp_millis()),
    })
}

fn millis_to_dt(ms: i64) -> chrono::DateTime<Utc> {
    chrono::DateTime::from_timestamp_millis(ms).unwrap_or_else(Utc::now)
}

pub async fn list_play_sessions(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let db = match require_db(&state) {
        Ok(db) => db,
        Err(r) => return r,
    };
    let uid = match require_user(&headers, &state.secret) {
        Ok(u) => u,
        Err(r) => return r,
    };
    match sqlx::query_as::<_, PlaySessionRow>(
        "SELECT id, name, template, created_at, updated_at, image, snapshot_path, snapshot_saved_at \
         FROM play_sessions WHERE user_id = $1 ORDER BY updated_at DESC",
    )
    .bind(uid)
    .fetch_all(db)
    .await
    {
        Ok(rows) => {
            let sessions: Vec<Value> = rows.iter().map(session_json).collect();
            json_ok(StatusCode::OK, json!({ "sessions": sessions }))
        }
        Err(e) => {
            eprintln!("list_play_sessions: {e}");
            json_ok(StatusCode::INTERNAL_SERVER_ERROR, json!({ "error": "server error" }))
        }
    }
}

pub async fn upsert_play_session(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(body): Json<PlaySessionBody>,
) -> Response {
    let db = match require_db(&state) {
        Ok(db) => db,
        Err(r) => return r,
    };
    let uid = match require_user(&headers, &state.secret) {
        Ok(u) => u,
        Err(r) => return r,
    };
    let created = millis_to_dt(body.created_at);
    let updated = millis_to_dt(body.updated_at);
    let result = sqlx::query(
        "INSERT INTO play_sessions (id, user_id, name, template, created_at, updated_at, image) \
         VALUES ($1, $2, $3, $4, $5, $6, $7) \
         ON CONFLICT (id) DO UPDATE SET \
           name = EXCLUDED.name, \
           template = EXCLUDED.template, \
           updated_at = EXCLUDED.updated_at, \
           image = COALESCE(EXCLUDED.image, play_sessions.image) \
         WHERE play_sessions.user_id = $2",
    )
    .bind(id)
    .bind(uid)
    .bind(&body.name)
    .bind(&body.template)
    .bind(created)
    .bind(updated)
    .bind(&body.image)
    .execute(db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => json_ok(StatusCode::OK, json!({ "ok": true })),
        Ok(_) => json_ok(StatusCode::FORBIDDEN, json!({ "error": "forbidden" })),
        Err(e) => {
            eprintln!("upsert_play_session: {e}");
            json_ok(StatusCode::INTERNAL_SERVER_ERROR, json!({ "error": "server error" }))
        }
    }
}

pub async fn delete_play_session(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Response {
    let db = match require_db(&state) {
        Ok(db) => db,
        Err(r) => return r,
    };
    let uid = match require_user(&headers, &state.secret) {
        Ok(u) => u,
        Err(r) => return r,
    };
    let row = sqlx::query_as::<_, (Option<String>,)>(
        "SELECT snapshot_path FROM play_sessions WHERE id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(uid)
    .fetch_optional(db)
    .await;

    let Ok(Some((snapshot_path,))) = row else {
        return json_ok(StatusCode::NOT_FOUND, json!({ "error": "not found" }));
    };

    if let Err(e) = sqlx::query("DELETE FROM play_sessions WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(uid)
        .execute(db)
        .await
    {
        eprintln!("delete_play_session: {e}");
        return json_ok(StatusCode::INTERNAL_SERVER_ERROR, json!({ "error": "server error" }));
    }
    if let Some(rel) = snapshot_path {
        let path = state.data_dir.join(rel);
        let _ = tokio::fs::remove_file(path).await;
    }
    json_ok(StatusCode::OK, json!({ "ok": true }))
}

const SNAPSHOT_MAX: usize = 100 * 1024 * 1024;

pub async fn put_snapshot(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    body: Body,
) -> Response {
    let db = match require_db(&state) {
        Ok(db) => db,
        Err(r) => return r,
    };
    let uid = match require_user(&headers, &state.secret) {
        Ok(u) => u,
        Err(r) => return r,
    };
    let owned = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*)::bigint FROM play_sessions WHERE id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(uid)
    .fetch_one(db)
    .await;
    match owned {
        Ok(n) if n > 0 => {}
        Ok(_) => return json_ok(StatusCode::NOT_FOUND, json!({ "error": "not found" })),
        Err(e) => {
            eprintln!("put_snapshot own: {e}");
            return json_ok(StatusCode::INTERNAL_SERVER_ERROR, json!({ "error": "server error" }));
        }
    }

    let Ok(bytes) = to_bytes(body, SNAPSHOT_MAX).await else {
        return json_ok(StatusCode::PAYLOAD_TOO_LARGE, json!({ "error": "snapshot too large" }));
    };
    if bytes.is_empty() {
        return json_ok(StatusCode::BAD_REQUEST, json!({ "error": "empty snapshot" }));
    }

    let image = headers
        .get("x-ngoding-image")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let saved_at = headers
        .get("x-ngoding-saved-at")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse::<i64>().ok())
        .and_then(chrono::DateTime::from_timestamp_millis)
        .unwrap_or_else(Utc::now);

    let rel = format!("snapshots/{id}.bin.gz");
    let path = state.data_dir.join(&rel);
    if let Err(e) = tokio::fs::write(&path, &bytes).await {
        eprintln!("put_snapshot write: {e}");
        return json_ok(StatusCode::INTERNAL_SERVER_ERROR, json!({ "error": "server error" }));
    }

    if let Err(e) = sqlx::query(
        "UPDATE play_sessions SET snapshot_path = $1, snapshot_bytes = $2, snapshot_saved_at = $3, \
         image = COALESCE($4, image), updated_at = now() WHERE id = $5 AND user_id = $6",
    )
    .bind(&rel)
    .bind(bytes.len() as i64)
    .bind(saved_at)
    .bind(&image)
    .bind(id)
    .bind(uid)
    .execute(db)
    .await
    {
        eprintln!("put_snapshot update: {e}");
        return json_ok(StatusCode::INTERNAL_SERVER_ERROR, json!({ "error": "server error" }));
    }
    json_ok(StatusCode::OK, json!({ "ok": true, "bytes": bytes.len() }))
}

pub async fn get_snapshot(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Response {
    let db = match require_db(&state) {
        Ok(db) => db,
        Err(r) => return r,
    };
    let uid = match require_user(&headers, &state.secret) {
        Ok(u) => u,
        Err(r) => return r,
    };
    let row = sqlx::query_as::<_, (Option<String>, Option<String>, Option<chrono::DateTime<Utc>>)>(
        "SELECT snapshot_path, image, snapshot_saved_at FROM play_sessions WHERE id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(uid)
    .fetch_optional(db)
    .await;

    let Ok(Some((Some(rel), image, saved_at))) = row else {
        return json_ok(StatusCode::NOT_FOUND, json!({ "error": "not found" }));
    };
    let path = state.data_dir.join(&rel);
    let Ok(bytes) = tokio::fs::read(&path).await else {
        return json_ok(StatusCode::NOT_FOUND, json!({ "error": "not found" }));
    };

    let mut res = Response::new(Body::from(bytes));
    *res.status_mut() = StatusCode::OK;
    let headers_mut = res.headers_mut();
    headers_mut.insert(header::CONTENT_TYPE, "application/gzip".parse().unwrap());
    headers_mut.insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    if let Some(img) = image {
        headers_mut.insert("x-ngoding-image", img.parse().unwrap());
    }
    if let Some(t) = saved_at {
        headers_mut.insert(
            "x-ngoding-saved-at",
            t.timestamp_millis().to_string().parse().unwrap(),
        );
    }
    res
}

fn share_id() -> String {
    use rand::RngExt;
    let bytes: [u8; 16] = rand::rng().random();
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateShareBody {
    pack: Value,
    source_session_id: Option<Uuid>,
    name: Option<String>,
}

pub async fn create_share(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CreateShareBody>,
) -> Response {
    let db = match require_db(&state) {
        Ok(db) => db,
        Err(r) => return r,
    };
    if body.pack.get("version").and_then(|v| v.as_u64()) != Some(1) {
        return json_ok(StatusCode::BAD_REQUEST, json!({ "error": "bad pack" }));
    }
    let id = share_id();
    let rel = format!("shares/{id}.json.gz");
    let path = state.data_dir.join(&rel);
    let json = match serde_json::to_vec(&body.pack) {
        Ok(v) => v,
        Err(_) => return json_ok(StatusCode::BAD_REQUEST, json!({ "error": "bad pack" })),
    };
    // Store uncompressed JSON for simplicity (filename keeps .json.gz for plan compat).
    if let Err(e) = tokio::fs::write(&path, &json).await {
        eprintln!("create_share write: {e}");
        return json_ok(StatusCode::INTERNAL_SERVER_ERROR, json!({ "error": "server error" }));
    }
    let user_id = cookie_user(&headers, &state.secret);
    let _ = body.name;
    if let Err(e) = sqlx::query(
        "INSERT INTO shares (id, source_session_id, user_id, pack_path) VALUES ($1, $2, $3, $4)",
    )
    .bind(&id)
    .bind(body.source_session_id)
    .bind(user_id)
    .bind(&rel)
    .execute(db)
    .await
    {
        eprintln!("create_share insert: {e}");
        let _ = tokio::fs::remove_file(&path).await;
        return json_ok(StatusCode::INTERNAL_SERVER_ERROR, json!({ "error": "server error" }));
    }
    json_ok(
        StatusCode::OK,
        json!({ "id": id, "url": format!("/s/{id}") }),
    )
}

pub async fn fork_share(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    let db = match require_db(&state) {
        Ok(db) => db,
        Err(r) => return r,
    };
    let row = sqlx::query_as::<_, (String, Option<chrono::DateTime<Utc>>)>(
        "SELECT pack_path, expires_at FROM shares WHERE id = $1",
    )
    .bind(&id)
    .fetch_optional(db)
    .await;
    let Ok(Some((rel, expires_at))) = row else {
        return json_ok(StatusCode::NOT_FOUND, json!({ "error": "not found" }));
    };
    if expires_at.is_some_and(|t| t < Utc::now()) {
        return json_ok(StatusCode::NOT_FOUND, json!({ "error": "expired" }));
    }
    let path = state.data_dir.join(&rel);
    let Ok(bytes) = tokio::fs::read(&path).await else {
        return json_ok(StatusCode::NOT_FOUND, json!({ "error": "not found" }));
    };
    let pack: Value = match serde_json::from_slice(&bytes) {
        Ok(v) => v,
        Err(_) => return json_ok(StatusCode::INTERNAL_SERVER_ERROR, json!({ "error": "bad pack" })),
    };
    json_ok(StatusCode::OK, json!({ "pack": pack }))
}
