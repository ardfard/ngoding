// Server for the PoC. Everything heavy (the VM, the student's programs) runs in
// the browser; the server only:
//  - serves the app (public/ plus the npm-installed ghostty-web and v86 builds),
//    which is compiled into the binary
//  - serves the VM image (fs.json, flat/, the snapshot) from NGODING_IMAGE_DIR
//  - hands out sessions (POST /api/session) and grades output files
//    (POST /api/grade), so expected answers never reach the browser
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
    routing::any,
};
use percent_encoding::percent_decode_str;
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tokio_util::io::ReaderStream;

use problems::{PROBLEMS, grade, inputs_for};
use session::Sessions;

// URL path -> file, relative to the repo root. Only these are embedded. Run
// `npm install` before `cargo build`: it installs ghostty-web and v86 and bundles
// CodeMirror into public/codemirror.js.
macro_rules! embed {
    ($($url:literal => $file:literal,)*) => {
        &[$(($url, $file, include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/", $file)))),*]
    };
}
const APP: &[(&str, &str, &[u8])] = embed! {
    "/play" => "public/play.html",
    "/play.js" => "public/play.js",
    "/play-ui.js" => "public/play-ui.js",
    "/file-tree.js" => "public/file-tree.js",
    "/build-cmd.js" => "public/build-cmd.js",
    "/problems" => "public/problems.html",
    "/problems.js" => "public/problems.js",
    "/editor.js" => "public/editor.js",
    "/languages.js" => "public/languages.js",
    "/codemirror.js" => "public/codemirror.js",
    "/store.js" => "public/store.js",
    "/ui.js" => "public/ui.js",
    "/v86-config.js" => "public/v86-config.js",
    "/vm.js" => "public/vm.js",
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
    url_path.strip_prefix("/v86/").is_some_and(|rest| hashed(rest, "flat/") || hashed(rest, "state-"))
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
    State(sessions): State<Arc<Sessions>>,
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
        "/api/session" => api_session(&sessions, req),
        _ => api_grade(&sessions, req),
    };
    send(status, payload)
}

fn send(status: StatusCode, payload: Value) -> Response {
    (status, [(header::CONTENT_TYPE, "application/json"), (header::CACHE_CONTROL, "no-store")], payload.to_string())
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
    Disk(PathBuf),
}

async fn static_file(image_dir: &Path, method: Method, uri: Uri, headers: HeaderMap) -> Response {
    let url_path = uri.path();
    let not_found = || (StatusCode::NOT_FOUND, "not found").into_response();

    let (path, etag, len, source) = if let Some(file) = EMBEDDED.get(url_path) {
        (file.path.to_path_buf(), file.etag.clone(), file.body.len() as u64, Source::Embedded(file.body))
    } else {
        let Some(path) = url_path.strip_prefix("/v86/").and_then(|rel| safe_join(image_dir, rel)) else {
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
    let len = [(header::CONTENT_TYPE, content_type(&path).to_string()), (header::CONTENT_LENGTH, len.to_string())];
    if method == Method::HEAD {
        return (common, len).into_response();
    }
    match source {
        Source::Embedded(body) => (common, len, Body::from(body)).into_response(),
        Source::Disk(path) => match tokio::fs::File::open(&path).await {
            Ok(file) => (common, len, Body::from_stream(ReaderStream::new(file))).into_response(),
            Err(_) => not_found(),
        },
    }
}

#[tokio::main]
async fn main() -> std::io::Result<()> {
    let port: u16 = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8080);
    let image_dir: &Path = Box::leak(PathBuf::from(std::env::var("NGODING_IMAGE_DIR").unwrap_or("public/v86".into())).into_boxed_path());
    if !image_dir.join("version.json").is_file() {
        eprintln!("warning: no VM image in {} (set NGODING_IMAGE_DIR)", image_dir.display());
    }
    let sessions = Arc::new(Sessions::new(&load_secret()?));
    let app = Router::new()
        .route("/", any(|| async { Redirect::temporary("/play") }))
        .route("/api/session", any(api))
        .route("/api/grade", any(api))
        .fallback(move |req: Request| static_file(image_dir, req.method().clone(), req.uri().clone(), req.headers().clone()))
        .with_state(sessions);
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
        assert_eq!(content_type(EMBEDDED["/problems"].path), "text/html; charset=utf-8");
        assert_eq!(content_type(EMBEDDED["/play"].path), "text/html; charset=utf-8");
        assert_eq!(content_type(EMBEDDED["/vendor/v86/v86.wasm"].path), "application/wasm");
        assert!(EMBEDDED["/vendor/v86/libv86.mjs"].body.len() > 100_000);
    }
}
