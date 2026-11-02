//! Magic-link tokens and signed auth cookies.

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use hmac::{Hmac, KeyInit, Mac};
use rand::RngExt;
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use uuid::Uuid;

pub const MAGIC_TTL_SECS: i64 = 15 * 60;
pub const COOKIE_TTL_SECS: i64 = 30 * 24 * 60 * 60;
pub const COOKIE_NAME: &str = "ngoding_auth";

type HmacSha256 = Hmac<Sha256>;

pub fn hash_token(raw: &str) -> String {
    let dig = Sha256::digest(raw.as_bytes());
    dig.iter().map(|b| format!("{b:02x}")).collect()
}

pub fn issue_magic_raw() -> String {
    let bytes: [u8; 32] = rand::rng().random();
    URL_SAFE_NO_PAD.encode(bytes)
}

fn sign(secret: &[u8], msg: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(secret).expect("hmac accepts any key length");
    mac.update(msg.as_bytes());
    let mut sig = URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes());
    sig.truncate(22);
    sig
}

pub fn sign_cookie(user_id: Uuid, exp_unix: i64, secret: &[u8]) -> String {
    let body = format!("{user_id}.{exp_unix}");
    format!("{body}.{}", sign(secret, &body))
}

pub fn verify_cookie(value: &str, secret: &[u8], now_unix: i64) -> Option<Uuid> {
    let (user_part, rest) = value.split_once('.')?;
    let (exp_part, sig) = rest.split_once('.')?;
    if sig.len() != 22 {
        return None;
    }
    let exp: i64 = exp_part.parse().ok()?;
    if now_unix > exp {
        return None;
    }
    let body = format!("{user_part}.{exp_part}");
    let expected = sign(secret, &body);
    if !bool::from(expected.as_bytes().ct_eq(sig.as_bytes())) {
        return None;
    }
    Uuid::parse_str(user_part).ok()
}

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
