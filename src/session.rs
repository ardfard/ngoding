// Stateless student sessions: the token is "<seed>.<hmac>", so the server can
// regenerate a student's inputs and expected answers without storing anything,
// and students can't pick someone else's seed.
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use hmac::{Hmac, KeyInit, Mac};
use rand::RngExt;
use sha2::Sha256;
use subtle::ConstantTimeEq;

pub struct Sessions {
    secret: Vec<u8>,
}

impl Sessions {
    pub fn new(secret: &str) -> Self {
        Sessions { secret: secret.as_bytes().to_vec() }
    }

    fn sign(&self, seed: &str) -> String {
        let mut mac = Hmac::<Sha256>::new_from_slice(&self.secret).expect("any key length works");
        mac.update(seed.as_bytes());
        let mut sig = URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes());
        sig.truncate(22);
        sig
    }

    pub fn create(&self) -> (u64, String) {
        let seed: u64 = rand::rng().random_range(1..1 << 31);
        (seed, format!("{seed}.{}", self.sign(&seed.to_string())))
    }

    /// Returns the seed, or None if the token is malformed or forged.
    pub fn verify(&self, token: Option<&str>) -> Option<u64> {
        let (seed, sig) = token?.split_once('.')?;
        let well_formed = (1..=10).contains(&seed.len())
            && seed.bytes().all(|b| b.is_ascii_digit())
            && sig.len() == 22
            && sig.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-');
        if !well_formed {
            return None;
        }
        // Sign the seed as written, like the original server, so existing tokens stay valid.
        bool::from(self.sign(seed).as_bytes().ct_eq(sig.as_bytes())).then(|| seed.parse().ok())?
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokens_round_trip_and_reject_forgeries() {
        let s = Sessions::new("secret");
        let (seed, token) = s.create();
        assert_eq!(s.verify(Some(&token)), Some(seed));
        let sig = token.split_once('.').unwrap().1;
        assert_eq!(s.verify(Some(&format!("{}.{sig}", seed + 1))), None);
        assert_eq!(Sessions::new("other").verify(Some(&token)), None);
        assert_eq!(s.verify(Some("garbage")), None);
        assert_eq!(s.verify(None), None);
    }
}
