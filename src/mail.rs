#[derive(Clone, Debug)]
pub struct MailConfig {
    pub smtp_url: Option<String>,
    pub smtp_from: String,
    pub dev_auth: bool,
}

impl MailConfig {
    pub fn from_env() -> Self {
        Self {
            smtp_url: std::env::var("SMTP_URL").ok().filter(|s| !s.is_empty()),
            smtp_from: std::env::var("SMTP_FROM").unwrap_or_else(|_| "ngoding@localhost".into()),
            dev_auth: std::env::var("NGODING_DEV_AUTH").is_ok_and(|v| v != "0" && !v.is_empty()),
        }
    }
}

pub async fn send_magic_link(cfg: &MailConfig, email: &str, link: &str) -> Result<(), String> {
    if let Some(url) = &cfg.smtp_url {
        use lettre::message::Mailbox;
        use lettre::transport::smtp::AsyncSmtpTransport;
        use lettre::{AsyncTransport, Message, Tokio1Executor};

        let from: Mailbox = cfg
            .smtp_from
            .parse()
            .map_err(|e| format!("bad SMTP_FROM: {e}"))?;
        let to: Mailbox = email.parse().map_err(|e| format!("bad email: {e}"))?;
        let msg = Message::builder()
            .from(from)
            .to(to)
            .subject("Your ngoding sign-in link")
            .body(format!("Sign in to ngoding:\n\n{link}\n\nThis link expires in 15 minutes.\n"))
            .map_err(|e| e.to_string())?;
        let mailer = AsyncSmtpTransport::<Tokio1Executor>::from_url(url)
            .map_err(|e| e.to_string())?
            .build();
        mailer.send(msg).await.map_err(|e| e.to_string())?;
        return Ok(());
    }
    if cfg.dev_auth {
        eprintln!("[dev-auth] magic link for {email}: {link}");
        return Ok(());
    }
    Err("mail not configured (set SMTP_URL or NGODING_DEV_AUTH=1)".into())
}
