use std::path::{Path, PathBuf};

use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;

/// Connect to Postgres when `DATABASE_URL` is set; otherwise accounts stay disabled.
pub async fn connect_db() -> Result<Option<PgPool>, sqlx::Error> {
    let Ok(url) = std::env::var("DATABASE_URL") else {
        return Ok(None);
    };
    let pool = PgPoolOptions::new().max_connections(5).connect(&url).await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    Ok(Some(pool))
}

pub fn data_dir() -> PathBuf {
    PathBuf::from(std::env::var("NGODING_DATA_DIR").unwrap_or_else(|_| "./data".into()))
}

pub fn ensure_data_dirs(root: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(root.join("snapshots"))?;
    std::fs::create_dir_all(root.join("shares"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ensure_data_dirs_creates_snapshots_and_shares() {
        let root = std::env::temp_dir().join(format!("ngoding-data-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        ensure_data_dirs(&root).unwrap();
        assert!(root.join("snapshots").is_dir());
        assert!(root.join("shares").is_dir());
        let _ = std::fs::remove_dir_all(&root);
    }
}
