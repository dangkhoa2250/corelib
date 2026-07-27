use std::{
    collections::HashSet,
    fmt, fs,
    path::{Path, PathBuf},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use rusqlite::{params, Connection, OptionalExtension, Row, TransactionBehavior};

use crate::model::{DocumentSummary, PageTagSummary};
use uuid::Uuid;

const DATABASE_FILE: &str = "library.sqlite3";
const MIGRATIONS: [(&str, &str); 13] = [
    (
        "0001_library",
        include_str!("../migrations/0001_library.sql"),
    ),
    (
        "0002_index_claims",
        include_str!("../migrations/0002_index_claims.sql"),
    ),
    (
        "0003_drive_source",
        include_str!("../migrations/0003_drive_source.sql"),
    ),
    (
        "0004_learning",
        include_str!("../migrations/0004_learning.sql"),
    ),
    (
        "0005_learning_source_integrity",
        include_str!("../migrations/0005_learning_source_integrity.sql"),
    ),
    (
        "0006_card_lifecycle",
        include_str!("../migrations/0006_card_lifecycle.sql"),
    ),
    (
        "0007_youglish_clickable",
        include_str!("../migrations/0007_youglish_clickable.sql"),
    ),
    (
        "0008_page_count",
        include_str!("../migrations/0008_page_count.sql"),
    ),
    (
        "0009_page_tags",
        include_str!("../migrations/0009_page_tags.sql"),
    ),
    (
        "0010_memora_study",
        include_str!("../migrations/0010_memora_study.sql"),
    ),
    (
        "0011_statistics",
        include_str!("../migrations/0011_statistics.sql"),
    ),
    (
        "0012_review_local_day",
        include_str!("../migrations/0012_review_local_day.sql"),
    ),
    (
        "0013_statistics_time_buckets",
        include_str!("../migrations/0013_statistics_time_buckets.sql"),
    ),
];
const SUMMARY_COLUMNS: &str =
    "id, title, author, source, cover_path, index_state, status, last_read_page, num_pages";

pub type Result<T> = std::result::Result<T, LibraryDbError>;

#[derive(Debug)]
pub enum LibraryDbError {
    Io(std::io::Error),
    Sql(rusqlite::Error),
    InvalidPage,
    DocumentNotFound,
    InvalidLearning(String),
}

impl fmt::Display for LibraryDbError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(_) => formatter.write_str("unable to access the library data directory"),
            Self::Sql(_) => formatter.write_str("unable to access the library database"),
            Self::InvalidPage => formatter.write_str("page must be positive"),
            Self::DocumentNotFound => formatter.write_str("document not found"),
            Self::InvalidLearning(message) => formatter.write_str(message),
        }
    }
}

impl std::error::Error for LibraryDbError {}

impl From<std::io::Error> for LibraryDbError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<rusqlite::Error> for LibraryDbError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Sql(error)
    }
}

pub struct LibraryDatabase {
    pub(crate) connection: Connection,
}

pub struct NewLocalDocument {
    pub id: String,
    pub title: String,
    pub content_hash: String,
    pub managed_path: String,
}

pub struct IndexingRecord {
    pub id: String,
    pub source: String,
    pub source_ref: Option<String>,
    pub managed_path: Option<String>,
    pub status: String,
    pub index_state: String,
}

impl LibraryDatabase {
    pub fn open(app_data_directory: impl AsRef<Path>) -> Result<Self> {
        let app_data_directory = app_data_directory.as_ref();
        fs::create_dir_all(app_data_directory)?;

        let mut connection = Connection::open(database_path(app_data_directory))?;
        connection.busy_timeout(Duration::from_secs(5))?;
        connection.execute_batch("PRAGMA foreign_keys = ON;")?;
        let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
        transaction.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY NOT NULL);",
        )?;
        for (migration_id, migration) in MIGRATIONS {
            let migration_is_applied = transaction
                .query_row(
                    "SELECT 1 FROM schema_migrations WHERE id = ?1",
                    params![migration_id],
                    |_| Ok(()),
                )
                .optional()?
                .is_some();
            if !migration_is_applied {
                transaction.execute_batch(migration)?;
                transaction.execute(
                    "INSERT INTO schema_migrations (id) VALUES (?1)",
                    params![migration_id],
                )?;
            }
        }
        transaction.commit()?;

        Ok(Self { connection })
    }

    pub fn list(&self) -> Result<Vec<DocumentSummary>> {
        let mut statement = self.connection.prepare(&format!(
            "SELECT {SUMMARY_COLUMNS} FROM documents ORDER BY updated_at DESC, id ASC"
        ))?;
        let summaries = statement
            .query_map([], summary_from_row)?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(summaries)
    }

    pub fn get_document(&self, id: &str) -> Result<Option<DocumentSummary>> {
        self.summary_by_id(id)
    }

    pub fn insert_local(&mut self, document: NewLocalDocument) -> Result<DocumentSummary> {
        self.insert_local_batch(vec![document])?
            .into_iter()
            .next()
            .ok_or(LibraryDbError::DocumentNotFound)
    }

    pub fn insert_drive(
        &mut self,
        id: &str,
        drive_file_id: &str,
        title: &str,
    ) -> Result<DocumentSummary> {
        let timestamp = portable_timestamp();
        self.connection.execute(
            "INSERT OR IGNORE INTO documents (
                id, source, source_ref, title, status, index_state, created_at, updated_at
             ) VALUES (?1, 'google_drive', ?2, ?3, 'download_required', 'pending', ?4, ?4)",
            params![id, drive_file_id, title, timestamp],
        )?;

        let summary = self
            .connection
            .query_row(
                &format!(
                    "SELECT {SUMMARY_COLUMNS} FROM documents
                     WHERE source = 'google_drive' AND source_ref = ?1"
                ),
                params![drive_file_id],
                summary_from_row,
            )
            .optional()?
            .ok_or(LibraryDbError::DocumentNotFound)?;
        Ok(summary)
    }

    pub fn insert_local_batch(
        &mut self,
        documents: Vec<NewLocalDocument>,
    ) -> Result<Vec<DocumentSummary>> {
        let transaction = self.connection.transaction()?;
        let timestamp = portable_timestamp();
        let mut summaries = Vec::with_capacity(documents.len());

        for document in documents {
            transaction.execute(
                "INSERT OR IGNORE INTO documents (
                    id, source, content_hash, title, managed_path, status, index_state, created_at, updated_at
                 ) VALUES (?1, 'local_managed', ?2, ?3, ?4, 'processing', 'pending', ?5, ?5)",
                params![
                    document.id,
                    document.content_hash,
                    document.title,
                    document.managed_path,
                    timestamp,
                ],
            )?;

            let summary = transaction
                .query_row(
                    &format!(
                        "SELECT {SUMMARY_COLUMNS} FROM documents
                         WHERE source = 'local_managed' AND content_hash = ?1"
                    ),
                    params![document.content_hash],
                    summary_from_row,
                )
                .optional()?
                .ok_or(LibraryDbError::DocumentNotFound)?;
            summaries.push(summary);
        }

        transaction.commit()?;
        Ok(summaries)
    }

    pub fn search(&self, query: &str) -> Result<Vec<DocumentSummary>> {
        let mut matches = self.metadata_matches(query)?;
        let mut seen_ids = matches
            .iter()
            .map(|document| document.id.clone())
            .collect::<HashSet<_>>();

        // FTS interprets its own query language. Binding prevents SQL injection; invalid
        // FTS syntax is intentionally treated as no extracted-text matches.
        if let Ok(ids) = self.full_text_ids(query) {
            for id in ids {
                if matches.len() == 30 {
                    break;
                }
                if seen_ids.insert(id.clone()) {
                    if let Some(document) = self.summary_by_id(&id)? {
                        matches.push(document);
                    }
                }
            }
        }

        matches.truncate(30);
        Ok(matches)
    }

    pub fn update_read_page(&mut self, id: &str, page: i64, num_pages: Option<i64>) -> Result<DocumentSummary> {
        if page <= 0 {
            return Err(LibraryDbError::InvalidPage);
        }

        let updated = self.connection.execute(
            "UPDATE documents SET last_read_page = ?1, updated_at = ?2,
             num_pages = COALESCE(?3, num_pages) WHERE id = ?4",
            params![page, portable_timestamp(), num_pages, id],
        )?;
        if updated == 0 {
            return Err(LibraryDbError::DocumentNotFound);
        }

        self.summary_by_id(id)?
            .ok_or(LibraryDbError::DocumentNotFound)
    }

    pub fn list_page_tags(&self, document_id: &str) -> Result<Vec<PageTagSummary>> {
        let mut statement = self.connection.prepare(
            "SELECT id, document_id, page FROM page_tags WHERE document_id = ?1 ORDER BY page ASC",
        )?;
        let tags = statement
            .query_map(params![document_id], |row| {
                Ok(PageTagSummary {
                    id: row.get(0)?,
                    document_id: row.get(1)?,
                    page: row.get(2)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(tags)
    }

    pub fn toggle_page_tag(
        &mut self,
        document_id: &str,
        page: i64,
    ) -> Result<Vec<PageTagSummary>> {
        if page <= 0 {
            return Err(LibraryDbError::InvalidPage);
        }
        let transaction = self.connection.transaction()?;
        let exists = transaction
            .query_row(
                "SELECT 1 FROM page_tags WHERE document_id = ?1 AND page = ?2",
                params![document_id, page],
                |_| Ok(()),
            )
            .optional()?
            .is_some();
        if exists {
            transaction.execute(
                "DELETE FROM page_tags WHERE document_id = ?1 AND page = ?2",
                params![document_id, page],
            )?;
        } else {
            transaction.execute(
                "INSERT INTO page_tags (id, document_id, page, created_at) VALUES (?1, ?2, ?3, ?4)",
                params![
                    Uuid::new_v4().to_string(),
                    document_id,
                    page,
                    portable_timestamp(),
                ],
            )?;
        }
        transaction.commit()?;
        self.list_page_tags(document_id)
    }

    pub fn set_index_ready(
        &mut self,
        id: &str,
        text: &str,
        cover_path: Option<&str>,
        num_pages: i64,
    ) -> Result<()> {
        let transaction = self.connection.transaction()?;
        let updated = transaction.execute(
            "UPDATE documents
             SET status = 'ready', index_state = 'ready',
                 cover_path = COALESCE(?1, cover_path), num_pages = ?2,
                 index_claimed_at = NULL, updated_at = ?3
             WHERE id = ?4",
            params![cover_path, num_pages, portable_timestamp(), id],
        )?;
        if updated == 0 {
            return Err(LibraryDbError::DocumentNotFound);
        }
        transaction.execute(
            "DELETE FROM document_text WHERE document_id = ?1",
            params![id],
        )?;
        transaction.execute(
            "INSERT INTO document_text (document_id, body) VALUES (?1, ?2)",
            params![id, text],
        )?;
        transaction.commit()?;
        Ok(())
    }

    pub fn set_index_failed(&mut self, id: &str) -> Result<()> {
        let updated = self.connection.execute(
            "UPDATE documents
             SET status = 'ready', index_state = 'failed', index_claimed_at = NULL, updated_at = ?1
             WHERE id = ?2",
            params![portable_timestamp(), id],
        )?;
        if updated == 0 {
            return Err(LibraryDbError::DocumentNotFound);
        }
        Ok(())
    }

    pub fn delete_document(&mut self, id: &str) -> Result<Option<String>> {
        let managed_path = self
            .connection
            .query_row(
                "SELECT managed_path FROM documents WHERE id = ?1",
                params![id],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()?
            .flatten();

        let transaction = self.connection.transaction()?;
        transaction.execute(
            "DELETE FROM document_text WHERE document_id = ?1",
            params![id],
        )?;
        transaction.execute(
            "UPDATE activity_sessions SET context_id=NULL,updated_at=?1
             WHERE context_kind='document' AND context_id=?2",
            params![portable_timestamp(), id],
        )?;
        transaction.execute("DELETE FROM documents WHERE id = ?1", params![id])?;
        transaction.commit()?;

        Ok(managed_path)
    }

    pub fn rename_document(&mut self, id: &str, title: &str) -> Result<DocumentSummary> {
        let updated = self.connection.execute(
            "UPDATE documents SET title = ?1, updated_at = ?2 WHERE id = ?3",
            params![title, portable_timestamp(), id],
        )?;
        if updated == 0 {
            return Err(LibraryDbError::DocumentNotFound);
        }

        self.summary_by_id(id)?
            .ok_or(LibraryDbError::DocumentNotFound)
    }

    pub fn reset_pending_index_claims(&mut self) -> Result<()> {
        self.connection.execute(
            "UPDATE documents SET index_claimed_at = NULL WHERE index_state = 'pending'",
            [],
        )?;
        Ok(())
    }

    pub fn pending_indexing_records(&self) -> Result<Vec<IndexingRecord>> {
        let mut statement = self.connection.prepare(
            "SELECT id, source, source_ref, managed_path, status, index_state
             FROM documents
             WHERE (status = 'processing' OR (source = 'google_drive' AND status = 'ready'))
               AND index_state = 'pending'
             ORDER BY created_at ASC, id ASC",
        )?;
        let records = statement
            .query_map([], |row| {
                Ok(IndexingRecord {
                    id: row.get(0)?,
                    source: row.get(1)?,
                    source_ref: row.get(2)?,
                    managed_path: row.get(3)?,
                    status: row.get(4)?,
                    index_state: row.get(5)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(LibraryDbError::from)?;
        Ok(records)
    }

    pub fn claim_pending_index(&mut self, id: &str) -> Result<Option<IndexingRecord>> {
        let claimed = self.connection.execute(
            "UPDATE documents
             SET index_claimed_at = ?1
             WHERE id = ?2
               AND (status = 'processing' OR (source = 'google_drive' AND status = 'ready'))
               AND index_state = 'pending'
               AND index_claimed_at IS NULL",
            params![portable_timestamp(), id],
        )?;
        if claimed == 0 {
            return Ok(None);
        }
        self.indexing_record(id)
    }

    pub fn release_pending_index_claim(&mut self, id: &str) -> Result<()> {
        self.connection.execute(
            "UPDATE documents
             SET index_claimed_at = NULL
             WHERE id = ?1 AND index_state = 'pending'",
            params![id],
        )?;
        Ok(())
    }

    pub fn indexing_record(&self, id: &str) -> Result<Option<IndexingRecord>> {
        self.connection
            .query_row(
                "SELECT id, source, source_ref, managed_path, status, index_state FROM documents WHERE id = ?1",
                params![id],
                |row| {
                    Ok(IndexingRecord {
                        id: row.get(0)?,
                        source: row.get(1)?,
                        source_ref: row.get(2)?,
                        managed_path: row.get(3)?,
                        status: row.get(4)?,
                        index_state: row.get(5)?,
                    })
                },
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn set_document_status(&mut self, id: &str, status: &str) -> Result<()> {
        let updated = self.connection.execute(
            "UPDATE documents SET status = ?1, updated_at = ?2 WHERE id = ?3",
            params![status, portable_timestamp(), id],
        )?;
        if updated == 0 {
            return Err(LibraryDbError::DocumentNotFound);
        }
        Ok(())
    }

    pub fn set_cover_path(&mut self, id: &str, cover_path: Option<&str>) -> Result<DocumentSummary> {
        let updated = self.connection.execute(
            "UPDATE documents SET cover_path = ?1, updated_at = ?2 WHERE id = ?3",
            params![cover_path, portable_timestamp(), id],
        )?;
        if updated == 0 {
            return Err(LibraryDbError::DocumentNotFound);
        }
        self.summary_by_id(id)?
            .ok_or(LibraryDbError::DocumentNotFound)
    }

    pub fn clear_drive_cache(&mut self) -> Result<()> {
        self.connection.execute(
            "UPDATE documents SET status = 'download_required' WHERE source = 'google_drive'",
            [],
        )?;
        Ok(())
    }

    #[cfg(test)]
    pub(crate) fn install_insert_failure_for_test(&mut self) -> Result<()> {
        self.connection.execute_batch(
            "CREATE TRIGGER fail_local_document_insert_for_test
             BEFORE INSERT ON documents
             BEGIN
               SELECT RAISE(FAIL, 'test insert failure');
             END;",
        )?;
        Ok(())
    }

    fn metadata_matches(&self, query: &str) -> Result<Vec<DocumentSummary>> {
        let pattern = format!("%{}%", escape_like(query));
        let mut statement = self.connection.prepare(&format!(
            "SELECT {SUMMARY_COLUMNS} FROM documents
             WHERE LOWER(title) LIKE LOWER(?1) ESCAPE '\\'
                OR LOWER(COALESCE(author, '')) LIKE LOWER(?1) ESCAPE '\\'
             ORDER BY updated_at DESC, id ASC
             LIMIT 30"
        ))?;
        let summaries = statement
            .query_map(params![pattern], summary_from_row)?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(summaries)
    }

    fn full_text_ids(&self, query: &str) -> Result<Vec<String>> {
        let mut statement = self.connection.prepare(
            "SELECT document_id FROM document_text WHERE document_text MATCH ?1 LIMIT 30",
        )?;
        let ids = statement
            .query_map(params![query], |row| row.get(0))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(ids)
    }

    fn summary_by_id(&self, id: &str) -> Result<Option<DocumentSummary>> {
        let mut statement = self.connection.prepare(&format!(
            "SELECT {SUMMARY_COLUMNS} FROM documents WHERE id = ?1"
        ))?;
        Ok(statement
            .query_row(params![id], summary_from_row)
            .optional()?)
    }
}

fn database_path(app_data_directory: &Path) -> PathBuf {
    app_data_directory.join(DATABASE_FILE)
}

pub(crate) fn portable_timestamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        .to_string()
}

fn escape_like(query: &str) -> String {
    query
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

fn summary_from_row(row: &Row<'_>) -> rusqlite::Result<DocumentSummary> {
    let index_state: String = row.get(5)?;
    Ok(DocumentSummary {
        id: row.get(0)?,
        title: row.get(1)?,
        author: row.get(2)?,
        source: row.get(3)?,
        cover_url: row.get(4)?,
        indexed: index_state == "ready",
        status: row.get(6)?,
        last_read_page: row.get(7)?,
        num_pages: row.get(8)?,
    })
}
