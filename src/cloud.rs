use axum::{
    extract::{Query, State},
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
use crate::mail::{send_magic_link, MailConfig};
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

/// Shared helper for later cloud routes.
#[allow(dead_code)]
pub fn require_user(headers: &HeaderMap, secret: &str) -> Result<Uuid, Response> {
    cookie_user(headers, secret).ok_or_else(|| {
        json_ok(StatusCode::UNAUTHORIZED, json!({ "error": "unauthorized" }))
    })
}

#[allow(dead_code)]
pub fn require_db(state: &AppState) -> Result<&PgPool, Response> {
    state.db.as_ref().ok_or_else(unavailable)
}

#[allow(dead_code)]
pub fn mail_cfg(state: &AppState) -> &MailConfig {
    &state.mail
}
