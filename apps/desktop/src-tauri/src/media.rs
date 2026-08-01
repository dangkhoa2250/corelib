use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use chrono::{SecondsFormat, Utc};
use rusqlite::{params, params_from_iter, Connection, OptionalExtension, Row};
use uuid::Uuid;

use crate::library_db::LibraryDatabase;
use crate::model::CardMediaPayload;

/// A staged media row reuses the committed `CardMediaPayload` shape; staged
/// rows simply have `card_id = None` and `draft_id = Some(...)`.
pub type StagedMedia = CardMediaPayload;

/// Maximum accepted media payload size (10 MiB).
pub const MAX_MEDIA_BYTES: usize = 10 * 1024 * 1024;

/// Backing directory name under the library root for committed card media.
pub const MEDIA_DIR_NAME: &str = "card-media";

/// Subdirectory under the media root used for not-yet-saved staging uploads.
pub const STAGING_DIR_NAME: &str = "staging";

/// Image MIME types accepted for card media, in canonical form.
pub const SUPPORTED_IMAGE_MIME: &[&str] = &["image/jpeg", "image/png", "image/webp", "image/gif"];

const MEDIA_COLUMNS: &str = "id, card_id, draft_id, mime_type, relative_path, source_type, \
     pixabay_attribution, width, height, size_bytes, created_at, updated_at";

/// Owns the `card_media` lifecycle on top of the shared library database.
///
/// The store shares the same `Arc<Mutex<LibraryDatabase>>` as `LibraryStore`
/// and writes media blobs under `media_root` (`<library_root>/card-media`).
/// Every path stored in the database is a *relative* path that is always
/// re-joined onto `media_root` and validated against traversal, so a corrupt
/// row can never escape the media root.
pub struct CardMediaStore {
    database: Arc<Mutex<LibraryDatabase>>,
    media_root: PathBuf,
}

impl CardMediaStore {
    pub fn new(database: Arc<Mutex<LibraryDatabase>>, media_root: PathBuf) -> Self {
        Self {
            database,
            media_root,
        }
    }

    pub fn media_root(&self) -> &Path {
        &self.media_root
    }

    pub fn database(&self) -> &Arc<Mutex<LibraryDatabase>> {
        &self.database
    }

    /// Stages a media blob from a local file path (sourceType = "file").
    ///
    /// The file is read in full, MIME-sniffed from its bytes, validated against
    /// the supported image types and the 10 MiB ceiling, then copied under
    /// `card-media/staging/<draftId>/` and recorded with `card_id = NULL`.
    pub fn stage_from_file(
        &self,
        draft_id: &str,
        source_path: &Path,
        source_type: &str,
    ) -> Result<StagedMedia, String> {
        validate_non_empty(draft_id, "draft_id")?;
        validate_source_type(source_type)?;
        let bytes = fs::read(source_path)
            .map_err(|e| format!("failed to read source file '{source_path:?}': {e}"))?;
        self.stage_from_bytes(draft_id, &bytes, "", source_type, None)
    }

    /// Stages a media blob from in-memory bytes (sourceType = "clipboard" or
    /// "pixabay"). MIME is authoritative-sniffed from the bytes; the provided
    /// `mime` is accepted as a fallback hint only when sniffing is inconclusive.
    pub fn stage_from_bytes(
        &self,
        draft_id: &str,
        bytes: &[u8],
        mime: &str,
        source_type: &str,
        pixabay_attribution: Option<&str>,
    ) -> Result<StagedMedia, String> {
        validate_non_empty(draft_id, "draft_id")?;
        validate_source_type(source_type)?;
        if bytes.len() > MAX_MEDIA_BYTES {
            return Err(format!(
                "media payload exceeds the 10 MiB limit ({} bytes)",
                bytes.len()
            ));
        }
        let detected = sniff_mime(bytes);
        let mime_type = match (detected, mime) {
            (Some(sniffed), _) => sniffed.to_string(),
            (None, provided) if is_supported_mime(provided) => provided.to_string(),
            (None, _) => {
                return Err(
                    "unsupported image format: only JPEG, PNG, WebP, GIF are allowed".to_string(),
                );
            }
        };
        let ext = extension_for(&mime_type)
            .ok_or_else(|| format!("unsupported mime type: {mime_type}"))?;
        let attribution = pixabay_attribution.map(|value| value.to_string());

        let media_id = Uuid::new_v4().to_string();
        let filename = format!("{media_id}.{ext}");
        let relative_path = format!("{STAGING_DIR_NAME}/{draft_id}/{filename}");
        let absolute = safe_join(&self.media_root, &relative_path)?;
        if let Some(parent) = absolute.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("failed to create staging directory: {e}"))?;
        }
        fs::write(&absolute, bytes)
            .map_err(|e| format!("failed to write staged media file: {e}"))?;

        let now = now_iso();
        let size_bytes = bytes.len() as i64;
        let db = self
            .database
            .lock()
            .map_err(|_| "library database is unavailable".to_string())?;
        let insert = db.connection.execute(
            "INSERT INTO card_media \
             (id, card_id, draft_id, mime_type, relative_path, source_type, \
              pixabay_attribution, width, height, size_bytes, created_at, updated_at) \
             VALUES (?1, NULL, ?2, ?3, ?4, ?5, ?6, NULL, NULL, ?7, ?8, ?8)",
            params![
                media_id,
                draft_id,
                mime_type,
                relative_path,
                source_type,
                attribution,
                size_bytes,
                now
            ],
        );
        if let Err(error) = insert {
            let _ = fs::remove_file(&absolute);
            return Err(format!("failed to record staged media: {error}"));
        }

        Ok(CardMediaPayload {
            id: media_id,
            card_id: None,
            draft_id: Some(draft_id.to_string()),
            mime_type,
            relative_path,
            source_type: source_type.to_string(),
            pixabay_attribution: attribution,
            width: None,
            height: None,
            size_bytes,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    /// Removes all staged rows and files belonging to `draft_id`. Promoted
    /// (committed) rows are left untouched because promotion clears
    /// `draft_id`.
    pub fn discard_draft(&self, draft_id: &str) -> Result<(), String> {
        validate_non_empty(draft_id, "draft_id")?;
        let db = self
            .database
            .lock()
            .map_err(|_| "library database is unavailable".to_string())?;
        let paths: Vec<String> = {
            let mut statement = db
                .connection
                .prepare(
                    "SELECT relative_path FROM card_media \
                     WHERE draft_id = ?1 AND card_id IS NULL",
                )
                .map_err(|e| e.to_string())?;
            let rows = statement
                .query_map(params![draft_id], |row| row.get::<_, String>(0))
                .map_err(|e| e.to_string())?;
            rows.collect::<rusqlite::Result<Vec<_>>>()
                .map_err(|e| e.to_string())?
        };
        db.connection
            .execute(
                "DELETE FROM card_media WHERE draft_id = ?1 AND card_id IS NULL",
                params![draft_id],
            )
            .map_err(|e| format!("failed to discard draft media: {e}"))?;
        drop(db);

        for relative_path in paths {
            if let Ok(path) = safe_join(&self.media_root, &relative_path) {
                let _ = fs::remove_file(path);
            }
        }
        // Remove the now-empty per-draft staging directory, if any.
        if let Ok(staging_dir) =
            safe_join(&self.media_root, &format!("{STAGING_DIR_NAME}/{draft_id}"))
        {
            let _ = fs::remove_dir(staging_dir);
        }
        Ok(())
    }

    /// Startup purge: removes staged rows older than `max_age`. Committed media
    /// is never removed here even if it is old.
    pub fn cleanup_staging_older_than(&self, max_age: Duration) -> Result<usize, String> {
        let cutoff = Utc::now()
            - chrono::Duration::from_std(max_age).map_err(|e| format!("invalid duration: {e}"))?;
        let cutoff_str = cutoff.to_rfc3339_opts(SecondsFormat::Millis, true);

        let db = self
            .database
            .lock()
            .map_err(|_| "library database is unavailable".to_string())?;
        let stale: Vec<(String, String)> = {
            let mut statement = db
                .connection
                .prepare(
                    "SELECT id, relative_path FROM card_media \
                     WHERE card_id IS NULL AND draft_id IS NOT NULL \
                     AND created_at != '' AND created_at < ?1",
                )
                .map_err(|e| e.to_string())?;
            let rows = statement
                .query_map(params![cutoff_str], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })
                .map_err(|e| e.to_string())?;
            rows.collect::<rusqlite::Result<Vec<_>>>()
                .map_err(|e| e.to_string())?
        };

        let mut removed = 0usize;
        for (id, relative_path) in &stale {
            let deleted = db
                .connection
                .execute("DELETE FROM card_media WHERE id = ?1", params![id])
                .map_err(|e| e.to_string())?;
            if deleted > 0 {
                removed += 1;
                if let Ok(path) = safe_join(&self.media_root, relative_path) {
                    let _ = fs::remove_file(path);
                }
            }
        }
        Ok(removed)
    }

    /// Moves only the referenced staged rows for `draft_id` into
    /// `card-media/<cardId>/`, assigning `card_id` and clearing `draft_id`.
    /// Returns the committed media in the same order as `referenced_media_ids`.
    pub fn promote_referenced(
        &self,
        card_id: &str,
        draft_id: &str,
        referenced_media_ids: &[String],
    ) -> Result<Vec<CardMediaPayload>, String> {
        let mut db = self
            .database
            .lock()
            .map_err(|_| "library database is unavailable".to_string())?;
        let transaction = db
            .connection
            .transaction()
            .map_err(|e| format!("failed to begin transaction: {e}"))?;
        let result = promote_referenced_in_tx(
            &transaction,
            &self.media_root,
            card_id,
            draft_id,
            referenced_media_ids,
        )?;
        transaction
            .commit()
            .map_err(|e| format!("failed to commit promoted media: {e}"))?;
        Ok(result)
    }

    /// Returns the absolute path for a media blob, validating that it belongs to
    /// `card_id` (committed) or `draft_id` (staged) and that its stored
    /// relative path cannot escape the media root.
    pub fn resolve_media_path(
        &self,
        card_id: Option<&str>,
        draft_id: Option<&str>,
        media_id: &str,
    ) -> Result<PathBuf, String> {
        validate_non_empty(media_id, "media_id")?;
        let db = self
            .database
            .lock()
            .map_err(|_| "library database is unavailable".to_string())?;
        let row: Option<(Option<String>, Option<String>, String)> = db
            .connection
            .query_row(
                "SELECT card_id, draft_id, relative_path FROM card_media WHERE id = ?1",
                params![media_id],
                |row| {
                    Ok((
                        row.get::<_, Option<String>>(0)?,
                        row.get::<_, Option<String>>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                },
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let Some((row_card_id, row_draft_id, relative_path)) = row else {
            return Err(format!("media '{media_id}' not found"));
        };

        let owned = match (card_id, draft_id) {
            (Some(card), _) => row_card_id.as_deref() == Some(card),
            (None, Some(draft)) => row_draft_id.as_deref() == Some(draft),
            (None, None) => false,
        };
        if !owned {
            return Err(format!(
                "media '{media_id}' is not owned by the requested card or draft"
            ));
        }

        let safe = validate_relative_path(&relative_path)?;
        let joined = self.media_root.join(&safe);
        if !joined.starts_with(&self.media_root) {
            return Err("relative_path escapes the media root".to_string());
        }
        Ok(joined)
    }

    /// After a successful card save/update, deletes committed media for
    /// `card_id` that is no longer referenced by the document.
    pub fn remove_unreferenced_media(
        &self,
        card_id: &str,
        referenced_media_ids: &[String],
    ) -> Result<(), String> {
        validate_non_empty(card_id, "card_id")?;
        let referenced: Vec<String> = dedupe_referenced(referenced_media_ids)?;

        let db = self
            .database
            .lock()
            .map_err(|_| "library database is unavailable".to_string())?;
        let stale: Vec<(String, String)> = if referenced.is_empty() {
            let mut statement = db
                .connection
                .prepare("SELECT id, relative_path FROM card_media WHERE card_id = ?1")
                .map_err(|e| e.to_string())?;
            let rows = statement
                .query_map(params![card_id], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })
                .map_err(|e| e.to_string())?;
            rows.collect::<rusqlite::Result<Vec<_>>>()
                .map_err(|e| e.to_string())?
        } else {
            let placeholders = referenced.iter().map(|_| "?").collect::<Vec<_>>().join(",");
            let sql = format!(
                "SELECT id, relative_path FROM card_media \
                 WHERE card_id = ?1 AND id NOT IN ({placeholders})"
            );
            let mut params_vec: Vec<Box<dyn rusqlite::types::ToSql>> =
                vec![Box::new(card_id.to_string())];
            for id in &referenced {
                params_vec.push(Box::new(id.clone()));
            }
            let mut statement = db.connection.prepare(&sql).map_err(|e| e.to_string())?;
            let rows = statement
                .query_map(params_from_iter(params_vec.iter()), |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })
                .map_err(|e| e.to_string())?;
            rows.collect::<rusqlite::Result<Vec<_>>>()
                .map_err(|e| e.to_string())?
        };

        for (id, relative_path) in &stale {
            db.connection
                .execute("DELETE FROM card_media WHERE id = ?1", params![id])
                .map_err(|e| e.to_string())?;
            if let Ok(path) = safe_join(&self.media_root, relative_path) {
                let _ = fs::remove_file(path);
            }
        }
        Ok(())
    }

    /// Deletes the on-disk directory holding a card's committed media. Safe to
    /// call before or after the card row is removed (CASCADE clears the rows);
    /// idempotent if the directory is already gone.
    pub fn delete_card_media_files(&self, card_id: &str) -> Result<(), String> {
        validate_non_empty(card_id, "card_id")?;
        validate_single_component(card_id, "card_id")?;
        let directory = self.media_root.join(card_id);
        if !directory.starts_with(&self.media_root) {
            return Err("card_id escapes the media root".to_string());
        }
        if directory.exists() {
            fs::remove_dir_all(&directory)
                .map_err(|e| format!("failed to remove card media directory: {e}"))?;
        }
        Ok(())
    }
}

/// Transaction-aware primitive used by the card save path (Task 6) to promote
/// referenced staged media inside the same transaction that writes the card.
/// `conn` may be a `&Connection` or a `&Transaction` (via `Deref`).
///
/// Files are moved first (atomic `rename` within the media root) and the row
/// updates are applied to the open transaction. If a later step fails we roll
/// the already-moved files back so the caller's transaction rollback leaves the
/// staging area consistent.
pub fn promote_referenced_in_tx(
    conn: &Connection,
    media_root: &Path,
    card_id: &str,
    draft_id: &str,
    referenced_media_ids: &[String],
) -> Result<Vec<CardMediaPayload>, String> {
    validate_non_empty(card_id, "card_id")?;
    validate_non_empty(draft_id, "draft_id")?;
    validate_single_component(card_id, "card_id")?;
    let referenced = dedupe_referenced(referenced_media_ids)?;
    if referenced.is_empty() {
        return Ok(Vec::new());
    }

    let committed_dir = media_root.join(card_id);
    fs::create_dir_all(&committed_dir)
        .map_err(|e| format!("failed to create committed media directory: {e}"))?;

    // Load the staged rows for this draft that are also in the referenced set.
    let placeholders = referenced.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT {MEDIA_COLUMNS} FROM card_media \
         WHERE draft_id = ?1 AND card_id IS NULL AND id IN ({placeholders})"
    );
    let mut params_vec: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(draft_id.to_string())];
    for id in &referenced {
        params_vec.push(Box::new(id.clone()));
    }
    let rows: Vec<CardMediaPayload> = {
        let mut statement = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let mapped = statement
            .query_map(params_from_iter(params_vec.iter()), media_from_row)
            .map_err(|e| e.to_string())?;
        mapped
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| e.to_string())?
    };
    let mut by_id: std::collections::HashMap<String, CardMediaPayload> = rows
        .into_iter()
        .map(|media| (media.id.clone(), media))
        .collect();

    // Phase 1: build the move plan in referenced order.
    let mut plan: Vec<(String, CardMediaPayload, PathBuf, PathBuf, String)> = Vec::new();
    for id in &referenced {
        let Some(media) = by_id.remove(id) else {
            continue;
        };
        let filename = Path::new(&media.relative_path)
            .file_name()
            .ok_or_else(|| format!("invalid staged relative_path: '{}'", media.relative_path))?
            .to_string_lossy()
            .into_owned();
        let new_relative_path = format!("{card_id}/{filename}");
        let source = safe_join(media_root, &media.relative_path)?;
        let destination = safe_join(media_root, &new_relative_path)?;
        plan.push((id.clone(), media, source, destination, new_relative_path));
    }

    // Phase 2: move files, rolling back earlier moves on failure.
    let mut moved: Vec<(PathBuf, PathBuf)> = Vec::new();
    for (_, _, source, destination, _) in &plan {
        if let Some(parent) = destination.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Err(error) = fs::rename(source, destination) {
            for (prev_source, prev_destination) in moved.iter().rev() {
                let _ = fs::rename(prev_destination, prev_source);
            }
            return Err(format!("failed to commit media file: {error}"));
        }
        moved.push((source.clone(), destination.clone()));
    }

    // Phase 3: update rows in referenced order. Roll back file moves if any
    // row update fails so the caller's transaction rollback is consistent.
    let now = now_iso();
    let mut committed = Vec::new();
    for (id, mut media, _source, _destination, new_relative_path) in plan {
        let update = conn.execute(
            "UPDATE card_media \
             SET card_id = ?1, draft_id = NULL, relative_path = ?2, updated_at = ?3 \
             WHERE id = ?4",
            params![card_id, new_relative_path, now, id],
        );
        if let Err(error) = update {
            for (prev_source, prev_destination) in moved.iter().rev() {
                let _ = fs::rename(prev_destination, prev_source);
            }
            return Err(format!("failed to commit media row: {error}"));
        }
        media.card_id = Some(card_id.to_string());
        media.draft_id = None;
        media.relative_path = new_relative_path.clone();
        media.updated_at = now.clone();
        committed.push(media.clone());
    }

    Ok(committed)
}

fn media_from_row(row: &Row) -> rusqlite::Result<CardMediaPayload> {
    Ok(CardMediaPayload {
        id: row.get(0)?,
        card_id: row.get(1)?,
        draft_id: row.get(2)?,
        mime_type: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
        relative_path: row.get(4)?,
        source_type: row.get(5)?,
        pixabay_attribution: row.get(6)?,
        width: row.get(7)?,
        height: row.get(8)?,
        size_bytes: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
    })
}

fn validate_source_type(source_type: &str) -> Result<(), String> {
    match source_type {
        "file" | "clipboard" | "pixabay" => Ok(()),
        other => Err(format!(
            "source_type must be one of file|clipboard|pixabay, got '{other}'"
        )),
    }
}

fn validate_non_empty(value: &str, label: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        Err(format!("{label} must not be empty"))
    } else {
        Ok(())
    }
}

fn validate_single_component(value: &str, label: &str) -> Result<(), String> {
    let path = Path::new(value);
    let mut components = path.components();
    let only = components.next();
    let has_more = components.next().is_some();
    if has_more {
        return Err(format!(
            "{label} must be a single path component, got '{value}'"
        ));
    }
    match only {
        Some(Component::Normal(part)) if part == std::ffi::OsStr::new(value) => Ok(()),
        _ => Err(format!(
            "{label} must be a normal path component, got '{value}'"
        )),
    }
}

/// Returns the canonical MIME type sniffed from magic bytes, or `None` if the
/// bytes do not match any supported image format.
fn sniff_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some("image/jpeg");
    }
    if bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) {
        return Some("image/png");
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some("image/gif");
    }
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some("image/webp");
    }
    None
}

fn is_supported_mime(mime: &str) -> bool {
    SUPPORTED_IMAGE_MIME.contains(&mime)
}

fn extension_for(mime: &str) -> Option<&'static str> {
    match mime {
        "image/jpeg" => Some("jpg"),
        "image/png" => Some("png"),
        "image/gif" => Some("gif"),
        "image/webp" => Some("webp"),
        _ => None,
    }
}

/// Validates that `relative_path` is a strictly descending relative path with no
/// traversal, drive prefix, or root components, returning the normalized path.
fn validate_relative_path(relative_path: &str) -> Result<PathBuf, String> {
    let path = Path::new(relative_path);
    if path.is_absolute() {
        return Err(format!(
            "relative_path must not be absolute: '{relative_path}'"
        ));
    }
    let mut safe = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => safe.push(part),
            Component::CurDir => {}
            other => {
                return Err(format!(
                    "relative_path must not contain traversal components ('{}')",
                    other.as_os_str().to_string_lossy()
                ));
            }
        }
    }
    if safe.as_os_str().is_empty() {
        return Err("relative_path must not be empty".to_string());
    }
    Ok(safe)
}

/// Joins `relative_path` onto `media_root`, rejecting traversal/absolute paths
/// and any result that does not remain inside `media_root`.
fn safe_join(media_root: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let safe = validate_relative_path(relative_path)?;
    let joined = media_root.join(&safe);
    if !joined.starts_with(media_root) {
        return Err(format!(
            "relative_path escapes the media root: '{relative_path}'"
        ));
    }
    Ok(joined)
}

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn dedupe_referenced(ids: &[String]) -> Result<Vec<String>, String> {
    let mut deduped = Vec::new();
    for id in ids {
        let trimmed = id.trim();
        if trimmed.is_empty() {
            return Err("referenced media id must not be empty".to_string());
        }
        if !deduped.iter().any(|existing: &String| existing == trimmed) {
            deduped.push(trimmed.to_string());
        }
    }
    Ok(deduped)
}
