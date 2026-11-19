// Server for the PoC. Everything heavy (the VM, the student's programs) runs in
// the browser; the server only:
//  - serves the app (public/ plus the npm-installed ghostty-web and v86 builds),
//    which is compiled into the binary
//  - serves the VM image (fs.json, flat/, the snapshot) from NGODING_IMAGE_DIR
//  - hands out sessions (POST /api/session) and grades output files
//    (POST /api/grade), so expected answers never reach the browser
mod auth;
mod cloud;
mod db;
mod mail;
mod problems;
mod session;

use std::{
    collections::HashMap,
    fs::{self, OpenOptions},
    io::Write,
    os::unix::fs::OpenOptionsExt,
    path::{Path, PathBuf},
    sync::{Arc, LazyLock},
    time::UNIX_EPOCH,
};

use axum::{
    Router,
    body::{Body, to_bytes},
    extract::{Request, State},
    http::{HeaderMap, Method, StatusCode, Uri, header},
    response::{IntoResponse, Redirect, Response},
    routing::{any, get, post},
};
use percent_encoding::percent_decode_str;
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tokio_util::io::ReaderStream;

use db::{connect_db, data_dir, ensure_data_dirs};
use mail::MailConfig;
use problems::{PROBLEMS, grade, inputs_for};
use session::Sessions;
use sqlx::PgPool;

#[derive(Clone)]
pub(crate) struct AppState {
    pub(crate) sessions: Arc<Sessions>,
    pub(crate) secret: String,
    pub(crate) db: Option<PgPool>,
    pub(crate) data_dir: PathBuf,
    pub(crate) mail: MailConfig,
    /// NGODING_PUBLIC_URL. Unset in local dev, where links follow the request's Host.
    pub(crate) public_url: Option<String>,
}

// URL path -> file, relative to the repo root. Only these are embedded. Run
// `npm install` before `cargo build`: it installs ghostty-web and v86 and bundles
// CodeMirror into public/codemirror.js.
macro_rules! embed {
    ($($url:literal => $file:literal,)*) => {
        &[$(($url, $file, include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/", $file)))),*]
    };
}
const APP: &[(&str, &str, &[u8])] = embed! {
    "/" => "public/index.html",
    "/home.js" => "public/home.js",
    "/cloud-api.js" => "public/cloud-api.js",
    "/session-load.js" => "public/session-load.js",
    "/vm-image.js" => "public/vm-image.js",
    "/share-pack.js" => "public/share-pack.js",
    "/share.js" => "public/share.js",
    "/s" => "public/share.html",
    "/base.js" => "public/base.js",
    "/vm-shared.js" => "public/vm-shared.js",
    "/vm-unkernel.js" => "public/vm-unkernel.js",
    // unkernel's browser SDK; web.mjs loads the kernel from next to itself.
    "/unkernel/web.mjs" => "node_modules/unkernel/dist/web.mjs",
    "/unkernel/_chunks/core.mjs" => "node_modules/unkernel/dist/_chunks/core.mjs",
    "/unkernel/unkernel-alpine.wasm" => "node_modules/unkernel/dist/unkernel-alpine.wasm",
    "/play-sessions.js" => "public/play-sessions.js",
    "/exercise-progress.js" => "public/exercise-progress.js",
    "/play" => "public/play.html",
    "/play.js" => "public/play.js",
    "/play-ui.js" => "public/play-ui.js",
    "/file-tree.js" => "public/file-tree.js",
    "/fs-sync.js" => "public/fs-sync.js",
    "/build-cmd.js" => "public/build-cmd.js",
    "/exercise" => "public/exercise.html",
    "/exercise.js" => "public/exercise.js",
    "/problems.js" => "public/problems.js",
    "/learn" => "public/learn.html",
    "/learn.js" => "public/learn.js",
    "/learn-ui.js" => "public/learn-ui.js",
    "/learn-check.js" => "public/learn-check.js",
    "/lessons.js" => "public/lessons.js",
    "/lessons/basics.js" => "public/lessons/basics.js",
    "/lessons/collections.js" => "public/lessons/collections.js",
    "/lessons/functions.js" => "public/lessons/functions.js",
    "/lessons/types.js" => "public/lessons/types.js",
    "/lessons/tasks.js" => "public/lessons/tasks.js",
    "/workspace-layout.js" => "public/workspace-layout.js",
    "/editor.js" => "public/editor.js",
    "/languages.js" => "public/languages.js",
    "/codemirror.js" => "public/codemirror.js",
    "/store.js" => "public/store.js",
    "/ui.js" => "public/ui.js",
    "/v86-config.js" => "public/v86-config.js",
    "/vm.js" => "public/vm.js",
    "/vm-persist.js" => "public/vm-persist.js",
    "/style.css" => "public/style.css",
    "/v86/bios/seabios.bin" => "public/v86/bios/seabios.bin",
    "/v86/bios/vgabios.bin" => "public/v86/bios/vgabios.bin",
    "/vendor/ghostty-web/ghostty-web.js" => "node_modules/ghostty-web/dist/ghostty-web.js",
    "/vendor/ghostty-web/ghostty-vt.wasm" => "node_modules/ghostty-web/dist/ghostty-vt.wasm",
    // Stub left by ghostty-web's Vite build; the browser may request it while
    // probing WASM load paths (Node fs fallback). Harmless empty module.
    "/vendor/ghostty-web/__vite-browser-external-2447137e.js" => "node_modules/ghostty-web/dist/__vite-browser-external-2447137e.js",
    "/vendor/v86/libv86.mjs" => "node_modules/v86/build/libv86.mjs",
    "/vendor/v86/v86.wasm" => "node_modules/v86/build/v86.wasm",
    "/vendor/v86/v86-fallback.wasm" => "node_modules/v86/build/v86-fallback.wasm",
    // IBM Plex (OFL-1.1), Latin subset, from @fontsource.
    "/fonts/ibm-plex-sans-400.woff2" => "node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2",
    "/fonts/ibm-plex-sans-500.woff2" => "node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2",
    "/fonts/ibm-plex-sans-600.woff2" => "node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2",
    "/fonts/ibm-plex-mono-400.woff2" => "node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2",
    "/fonts/ibm-plex-mono-600.woff2" => "node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2",
};

struct Embedded {
    path: &'static Path,
    body: &'static [u8],
    etag: String,
}

// URL path -> embedded file, with an ETag from its content hash.
static EMBEDDED: LazyLock<HashMap<&str, Embedded>> = LazyLock::new(|| {
    APP.iter()
        .map(|&(url, file, body)| {
            let hash: String = Sha256::digest(body)[..8].iter().map(|b| format!("{b:02x}")).collect();
            (url, Embedded { path: Path::new(file), body, etag: format!("\"{hash}\"") })
        })
        .collect()
});

fn content_type(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()) {
        Some("html") => "text/html; charset=utf-8",
        Some("js" | "mjs") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("json") => "application/json",
        Some("wasm") => "application/wasm",
        Some("woff2") => "font/woff2",
        _ => "application/octet-stream",
    }
}

// Content-addressed files never change, so browsers and CDNs may keep them
// forever. Everything else is revalidated (cheap 304s via ETag).
fn is_immutable(url_path: &str) -> bool {
    let hashed = |name: &str, prefix: &str| {
        name.strip_prefix(prefix)
            .and_then(|n| n.strip_suffix(".bin.zst"))
            .is_some_and(|h| !h.is_empty() && h.bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase()))
    };
    let disk = |name: &str| {
        name.strip_prefix("debian-")
            .and_then(|n| n.strip_suffix(".ext4"))
            .is_some_and(|h| !h.is_empty() && h.bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase()))
    };
    url_path.strip_prefix("/v86/").is_some_and(|rest| hashed(rest, "flat/") || hashed(rest, "state-"))
        || url_path.strip_prefix("/unkernel-image/").is_some_and(disk)
}

// The same app on unkernel lives under this prefix: same pages and modules,
// except vm.js, which is the unkernel VM.
const UNK: &str = "/新";

// "/新/<file>" -> the embedded file it reuses, for a decoded URL path.
fn unkernel_alias(path: &str) -> Option<&'static str> {
    let rest = path.strip_prefix(UNK)?;
    let rest = if rest.is_empty() { "/" } else { rest };
    if !rest.starts_with('/') || ["/v86/", "/api/", "/unkernel"].iter().any(|p| rest.starts_with(p)) {
        return None;
    }
    let rest = if rest == "/vm.js" { "/vm-unkernel.js" } else { rest };
    EMBEDDED.get_key_value(rest).map(|(k, _)| *k)
}

// Absolute app links in a page (scripts, nav) move under the prefix; shared
// assets and APIs stay where they are.
fn rewrite_html(html: &str) -> String {
    const SHARED: [&str; 5] = ["style.css", "fonts/", "vendor/", "api/", "unkernel"];
    let mut out = String::with_capacity(html.len() + 256);
    let mut rest = html;
    while let Some(i) = rest.find("=\"/") {
        let (head, tail) = rest.split_at(i + 3);
        out.push_str(head);
        if !SHARED.iter().any(|p| tail.starts_with(p)) {
            out.push_str(&UNK[1..]);
            out.push('/');
        }
        rest = tail;
    }
    out.push_str(rest);
    out
}

// Rewritten pages for the unkernel app, keyed by the embedded URL.
static UNK_HTML: LazyLock<HashMap<&str, (String, String)>> = LazyLock::new(|| {
    EMBEDDED
        .iter()
        .filter(|(_, f)| content_type(f.path).starts_with("text/html"))
        .map(|(url, f)| {
            let body = rewrite_html(std::str::from_utf8(f.body).unwrap_or_default());
            let etag = format!("\"u{}", &f.etag[1..]);
            (*url, (body, etag))
        })
        .collect()
});

// One "bytes=" range -> inclusive (start, end) within len. Multiple ranges and
// unsatisfiable ones are None.
fn parse_range(value: &str, len: u64) -> Option<(u64, u64)> {
    let spec = value.strip_prefix("bytes=")?;
    if spec.contains(',') || len == 0 {
        return None;
    }
    let (a, b) = spec.split_once('-')?;
    let (start, end) = if a.is_empty() {
        let n: u64 = b.parse().ok()?;
        if n == 0 {
            return None;
        }
        (len.saturating_sub(n), len - 1)
    } else {
        let start: u64 = a.parse().ok()?;
        let end = if b.is_empty() { len - 1 } else { b.parse::<u64>().ok()?.min(len - 1) };
        (start, end)
    };
    (start <= end && start < len).then_some((start, end))
}

// Tokens are signed with this secret; keep it stable across restarts so
// students keep their sessions.
fn load_secret() -> std::io::Result<String> {
    if let Ok(s) = std::env::var("NGODING_SECRET") {
        return Ok(s);
    }
    let file = ".ngoding-secret";
    if let Ok(s) = fs::read_to_string(file) {
        return Ok(s.trim().to_string());
    }
    let s: String = rand::random::<[u8; 32]>().iter().map(|b| format!("{b:02x}")).collect();
    OpenOptions::new().write(true).create_new(true).mode(0o600).open(file)?.write_all(format!("{s}\n").as_bytes())?;
    Ok(s)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiRequest {
    token: Option<String>,
    problem_id: Option<String>,
    output: Option<Value>,
}

// Body: { token? }. Reuses a valid token, otherwise starts a new session.
fn api_session(sessions: &Sessions, req: ApiRequest) -> (StatusCode, Value) {
    let (seed, token) = match sessions.verify(req.token.as_deref()) {
        Some(seed) => (seed, req.token.unwrap()),
        None => sessions.create(),
    };
    let body = json!({ "token": token, "seed": seed, "problems": PROBLEMS, "inputs": inputs_for(seed) });
    (StatusCode::OK, body)
}

// Body: { token, problemId, output } where output is the file's text.
fn api_grade(sessions: &Sessions, req: ApiRequest) -> (StatusCode, Value) {
    let seed = sessions.verify(req.token.as_deref());
    let problem = PROBLEMS.iter().position(|p| Some(p.id) == req.problem_id.as_deref());
    let (Some(seed), Some(i), Some(Value::String(output))) = (seed, problem, req.output) else {
        return (StatusCode::BAD_REQUEST, json!({ "error": "bad request" }));
    };
    let p = &PROBLEMS[i];
    let result = grade(&(p.solve)(&inputs_for(seed)[p.id]), Some(&output));
    (StatusCode::OK, json!(result))
}

async fn api(
    State(state): State<AppState>,
    method: Method,
    uri: Uri,
    body: Body,
) -> Response {
    if method != Method::POST {
        return send(StatusCode::METHOD_NOT_ALLOWED, json!({ "error": "use POST" }));
    }
    let Ok(body) = to_bytes(body, 1 << 20).await else {
        return send(StatusCode::PAYLOAD_TOO_LARGE, json!({ "error": "output too large" }));
    };
    let req = if body.is_empty() { Ok(ApiRequest { token: None, problem_id: None, output: None }) } else { serde_json::from_slice(&body) };
    let Ok(req) = req else {
        return send(StatusCode::BAD_REQUEST, json!({ "error": "bad request" }));
    };
    let (status, payload) = match uri.path() {
        "/api/session" => api_session(&state.sessions, req),
        _ => api_grade(&state.sessions, req),
    };
    send(status, payload)
}

fn send(status: StatusCode, payload: Value) -> Response {
    (status, [(header::CONTENT_TYPE, "application/json"), (header::CACHE_CONTROL, "no-store")], payload.to_string())
        .into_response()
}

async fn share_landing() -> Response {
    let file = &EMBEDDED["/s"];
    (
        [
            (header::CONTENT_TYPE, "text/html; charset=utf-8"),
            (header::ETAG, file.etag.as_str()),
            (header::CACHE_CONTROL, "no-cache"),
        ],
        file.body,
    )
        .into_response()
}

// Joins a URL path onto dir, refusing anything that could step outside it.
fn safe_join(dir: &Path, rel: &str) -> Option<PathBuf> {
    let rel = percent_decode_str(rel).decode_utf8().ok()?;
    let mut path = dir.to_path_buf();
    for part in rel.split('/').filter(|p| !p.is_empty() && *p != ".") {
        if part == ".." || part.contains('\0') {
            return None;
        }
        path.push(part);
    }
    Some(path)
}

enum Source {
    Embedded(&'static [u8]),
    Owned(String),
    Disk(PathBuf),
}

// Where the VM images live on disk: v86's (/v86/) and unkernel's (/unkernel-image/).
#[derive(Clone, Copy)]
struct ImageDirs {
    v86: &'static Path,
    unkernel: &'static Path,
}

async fn static_file(dirs: ImageDirs, method: Method, uri: Uri, headers: HeaderMap) -> Response {
    let raw_path = uri.path();
    let Ok(decoded) = percent_decode_str(raw_path).decode_utf8() else {
        return (StatusCode::NOT_FOUND, "not found").into_response();
    };
    let url_path: &str = &decoded;
    let not_found = || (StatusCode::NOT_FOUND, "not found").into_response();
    if url_path == UNK {
        return Redirect::permanent(&format!("{raw_path}/")).into_response();
    }

    let (path, etag, len, source) = if let Some(file) = EMBEDDED.get(url_path) {
        (file.path.to_path_buf(), file.etag.clone(), file.body.len() as u64, Source::Embedded(file.body))
    } else if let Some(key) = unkernel_alias(url_path) {
        let file = &EMBEDDED[key];
        match UNK_HTML.get(key) {
            Some((body, etag)) => (file.path.to_path_buf(), etag.clone(), body.len() as u64, Source::Owned(body.clone())),
            None => (file.path.to_path_buf(), file.etag.clone(), file.body.len() as u64, Source::Embedded(file.body)),
        }
    } else {
        let disk = raw_path
            .strip_prefix("/v86/")
            .and_then(|rel| safe_join(dirs.v86, rel))
            .or_else(|| raw_path.strip_prefix("/unkernel-image/").and_then(|rel| safe_join(dirs.unkernel, rel)));
        let Some(path) = disk else {
            return not_found();
        };
        let Ok(meta) = tokio::fs::metadata(&path).await else { return not_found() };
        if !meta.is_file() {
            return not_found();
        }
        let mtime = meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).unwrap_or_default();
        let etag = format!("\"{:x}-{:x}\"", meta.len(), mtime.as_nanos());
        (path.clone(), etag, meta.len(), Source::Disk(path))
    };

    let cache = if is_immutable(url_path) { "public, max-age=31536000, immutable" } else { "no-cache" };
    let common = [(header::ETAG, etag.clone()), (header::CACHE_CONTROL, cache.to_string())];
    if headers.get(header::IF_NONE_MATCH).is_some_and(|v| v.as_bytes() == etag.as_bytes()) {
        return (StatusCode::NOT_MODIFIED, common).into_response();
    }
    let ctype = (header::CONTENT_TYPE, content_type(&path).to_string());

    // The unkernel disk is read lazily with Range requests (openHttpDisk).
    if let Source::Disk(file_path) = &source {
        let ranges = [(header::ACCEPT_RANGES, "bytes".to_string())];
        if let Some(range) = headers.get(header::RANGE).and_then(|v| v.to_str().ok()) {
            let Some((start, end)) = parse_range(range, len) else {
                let unsat = [(header::CONTENT_RANGE, format!("bytes */{len}"))];
                return (StatusCode::RANGE_NOT_SATISFIABLE, common, unsat).into_response();
            };
            let part = [
                ctype,
                (header::CONTENT_LENGTH, (end - start + 1).to_string()),
                (header::CONTENT_RANGE, format!("bytes {start}-{end}/{len}")),
            ];
            if method == Method::HEAD {
                return (StatusCode::PARTIAL_CONTENT, common, ranges, part).into_response();
            }
            use tokio::io::{AsyncReadExt, AsyncSeekExt};
            let Ok(mut file) = tokio::fs::File::open(file_path).await else { return not_found() };
            if file.seek(std::io::SeekFrom::Start(start)).await.is_err() {
                return not_found();
            }
            let body = Body::from_stream(ReaderStream::new(file.take(end - start + 1)));
            return (StatusCode::PARTIAL_CONTENT, common, ranges, part, body).into_response();
        }
        let full = [ctype, (header::CONTENT_LENGTH, len.to_string())];
        if method == Method::HEAD {
            return (common, ranges, full).into_response();
        }
        return match tokio::fs::File::open(file_path).await {
            Ok(file) => (common, ranges, full, Body::from_stream(ReaderStream::new(file))).into_response(),
            Err(_) => not_found(),
        };
    }

    let full = [ctype, (header::CONTENT_LENGTH, len.to_string())];
    if method == Method::HEAD {
        return (common, full).into_response();
    }
    match source {
        Source::Embedded(body) => (common, full, Body::from(body)).into_response(),
        Source::Owned(body) => (common, full, Body::from(body)).into_response(),
        Source::Disk(_) => unreachable!(),
    }
}

#[tokio::main]
async fn main() -> std::io::Result<()> {
    let port: u16 = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8080);
    let image_dir: &Path = Box::leak(PathBuf::from(std::env::var("NGODING_IMAGE_DIR").unwrap_or("public/v86".into())).into_boxed_path());
    let unk_image_dir: &Path = Box::leak(
        PathBuf::from(std::env::var("NGODING_UNKERNEL_IMAGE_DIR").unwrap_or("public/unkernel-image".into())).into_boxed_path(),
    );
    let dirs = ImageDirs { v86: image_dir, unkernel: unk_image_dir };
    if !image_dir.join("version.json").is_file() {
        eprintln!("warning: no VM image in {} (set NGODING_IMAGE_DIR)", image_dir.display());
    }
    let secret = load_secret()?;
    let data_dir = data_dir();
    ensure_data_dirs(&data_dir)?;
    let mail = MailConfig::from_env();
    let public_url = std::env::var("NGODING_PUBLIC_URL").ok().filter(|s| !s.is_empty());
    let db = match connect_db().await {
        Ok(pool) => {
            if pool.is_none() {
                eprintln!("warning: DATABASE_URL unset; accounts/cloud APIs disabled");
            }
            pool
        }
        Err(e) => {
            eprintln!("warning: database unavailable ({e}); accounts/cloud APIs disabled");
            None
        }
    };
    let state = AppState {
        sessions: Arc::new(Sessions::new(&secret)),
        secret,
        db,
        data_dir,
        mail,
        public_url,
    };
    let app = Router::new()
        .route("/problems", any(|| async { Redirect::temporary("/exercise") }))
        .route("/api/session", any(api))
        .route("/api/grade", any(api))
        .route("/api/auth/request", post(cloud::auth_request))
        .route("/api/auth/me", get(cloud::auth_me))
        .route("/api/auth/logout", post(cloud::auth_logout))
        .route("/auth/callback", get(cloud::auth_callback))
        .route("/api/play/sessions", get(cloud::list_play_sessions))
        .route("/api/play/sessions/{id}", axum::routing::put(cloud::upsert_play_session).delete(cloud::delete_play_session))
        .route(
            "/api/play/sessions/{id}/snapshot",
            axum::routing::put(cloud::put_snapshot).get(cloud::get_snapshot),
        )
        .route("/api/shares", post(cloud::create_share))
        .route("/api/shares/{id}/fork", post(cloud::fork_share))
        .route(
            "/api/exercise/progress",
            get(cloud::get_exercise_progress).put(cloud::put_exercise_progress),
        )
        .route("/s/{id}", get(share_landing))
        .fallback(move |req: Request| static_file(dirs, req.method().clone(), req.uri().clone(), req.headers().clone()))
        .with_state(state);
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await?;
    println!("ngoding PoC on http://localhost:{port}");
    axum::serve(listener, app).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_hashed_files_are_immutable() {
        assert!(is_immutable("/v86/flat/0a1b.bin.zst"));
        assert!(is_immutable("/v86/state-6193511b457314b5.bin.zst"));
        assert!(!is_immutable("/v86/version.json"));
        assert!(!is_immutable("/v86/flat/.bin.zst"));
        assert!(!is_immutable("/v86/flat/x/0a.bin.zst"));
    }

    #[test]
    fn paths_cannot_escape_their_directory() {
        let dir = Path::new("img");
        assert_eq!(safe_join(dir, "flat/ab.bin.zst"), Some(PathBuf::from("img/flat/ab.bin.zst")));
        assert_eq!(safe_join(dir, "../Cargo.toml"), None);
        assert_eq!(safe_join(dir, "%2e%2e/Cargo.toml"), None);
        assert_eq!(safe_join(dir, "flat/..%2F..%2Fpackage.json"), None);
    }

    #[test]
    fn app_files_are_embedded() {
        assert_eq!(content_type(EMBEDDED["/"].path), "text/html; charset=utf-8");
        assert_eq!(content_type(EMBEDDED["/exercise"].path), "text/html; charset=utf-8");
        assert_eq!(content_type(EMBEDDED["/play"].path), "text/html; charset=utf-8");
        assert_eq!(content_type(EMBEDDED["/learn"].path), "text/html; charset=utf-8");
        assert_eq!(content_type(EMBEDDED["/lessons/types.js"].path), "text/javascript; charset=utf-8");
        assert_eq!(content_type(EMBEDDED["/cloud-api.js"].path), "text/javascript; charset=utf-8");
        assert_eq!(content_type(EMBEDDED["/vendor/v86/v86.wasm"].path), "application/wasm");
        assert!(EMBEDDED["/vendor/v86/libv86.mjs"].body.len() > 100_000);
        assert_eq!(content_type(EMBEDDED["/fonts/ibm-plex-mono-400.woff2"].path), "font/woff2");
        assert!(EMBEDDED["/fonts/ibm-plex-sans-400.woff2"].body.starts_with(b"wOF2"));
    }

    #[test]
    fn unkernel_app_reuses_the_app_files_but_its_own_vm() {
        assert_eq!(unkernel_alias("/新/vm.js"), Some("/vm-unkernel.js"));
        assert_eq!(unkernel_alias("/新/play.js"), Some("/play.js"));
        assert_eq!(unkernel_alias("/新/lessons/types.js"), Some("/lessons/types.js"));
        assert_eq!(unkernel_alias("/新/"), Some("/"));
        assert_eq!(unkernel_alias("/新/play"), Some("/play"));
        assert_eq!(unkernel_alias("/新/v86/version.json"), None);
        assert_eq!(unkernel_alias("/新/api/session"), None);
        assert_eq!(unkernel_alias("/新/nope.js"), None);
        assert_eq!(unkernel_alias("/新x/play"), None);
        assert_eq!(unkernel_alias("/play"), None);
        assert!(EMBEDDED["/unkernel/web.mjs"].body.len() > 10_000);
        assert_eq!(content_type(EMBEDDED["/unkernel/unkernel-alpine.wasm"].path), "application/wasm");
    }

    #[test]
    fn unkernel_html_links_stay_under_the_prefix() {
        let html = r#"<script src="/play.js"></script><a href="/">x</a><a href="/learn">l</a><link href="/style.css"><link href="/fonts/a.woff2"><script src="/vendor/x.js"></script>"#;
        assert_eq!(
            rewrite_html(html),
            r#"<script src="/新/play.js"></script><a href="/新/">x</a><a href="/新/learn">l</a><link href="/style.css"><link href="/fonts/a.woff2"><script src="/vendor/x.js"></script>"#
        );
    }

    #[test]
    fn ranges() {
        assert_eq!(parse_range("bytes=0-0", 10), Some((0, 0)));
        assert_eq!(parse_range("bytes=5-", 10), Some((5, 9)));
        assert_eq!(parse_range("bytes=2-100", 10), Some((2, 9)));
        assert_eq!(parse_range("bytes=-3", 10), Some((7, 9)));
        assert_eq!(parse_range("bytes=10-", 10), None);
        assert_eq!(parse_range("bytes=5-2", 10), None);
        assert_eq!(parse_range("bytes=0-1,4-5", 10), None);
        assert_eq!(parse_range("items=0-1", 10), None);
    }

    #[test]
    fn hashed_unkernel_disks_are_immutable() {
        assert!(is_immutable("/unkernel-image/debian-0123456789abcdef.ext4"));
        assert!(!is_immutable("/unkernel-image/version.json"));
        assert!(!is_immutable("/unkernel-image/debian-.ext4"));
    }
}
