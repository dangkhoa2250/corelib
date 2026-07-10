use std::{
    collections::HashSet,
    fmt, fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use rusqlite::{params, Connection, OptionalExtension, Row, TransactionBehavior};

use crate::model::DocumentSummary;

const DATABASE_FILE: &str = "library.sqlite3";
const MIGRATION_ID: &str = "0001_library";
const MIGRATION: &str = include_str!("../migrations/0001_library.sql");
const SUMMARY_COLUMNS: &str =
    "id, title, author, source, cover_path, index_state, status, last_read_page";

pub type Result<T> = std::result::Result<T, LibraryDbError>;

#[derive(Debug)]
pub enum LibraryDbError {
    Io(std::io::Error),
    Sql(rusqlite::Error),
    InvalidPage,
    DocumentNotFound,
}

impl fmt::Display for LibraryDbError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(_) => formatter.write_str("unable to access the library data directory"),
            Self::Sql(_) => formatter.write_str("unable to access the library database"),
            Self::InvalidPage => formatter.write_str("page must be positive"),
            Self::DocumentNotFound => formatter.write_str("document not found"),
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
    connection: Connection,
}

pub struct NewLocalDocument {
    pub id: String,
    pub title: String,
    pub content_hash: String,
    pub managed_path: String,
}

impl LibraryDatabase {
    pub fn open(app_data_directory: impl AsRef<Path>) -> Result<Self> {
        let app_data_directory = app_data_directory.as_ref();
        fs::create_dir_all(app_data_directory)?;

        let mut connection = Connection::open(database_path(app_data_directory))?;
        let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
        transaction.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY NOT NULL);",
        )?;
        let migration_is_applied = transaction
            .query_row(
                "SELECT 1 FROM schema_migrations WHERE id = ?1",
                params![MIGRATION_ID],
                |_| Ok(()),
            )
            .optional()?
            .is_some();
        if !migration_is_applied {
            transaction.execute_batch(MIGRATION)?;
            transaction.execute(
                "INSERT INTO schema_migrations (id) VALUES (?1)",
                params![MIGRATION_ID],
            )?;
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

    pub fn insert_local(&mut self, document: NewLocalDocument) -> Result<DocumentSummary> {
        self.insert_local_batch(vec![document])?
            .into_iter()
            .next()
            .ok_or(LibraryDbError::DocumentNotFound)
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
                 ) VALUES (?1, 'local_managed', ?2, ?3, ?4, 'ready', 'pending', ?5, ?5)",
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

    pub fn update_read_page(&mut self, id: &str, page: i64) -> Result<DocumentSummary> {
        if page <= 0 {
            return Err(LibraryDbError::InvalidPage);
        }

        let updated = self.connection.execute(
            "UPDATE documents SET last_read_page = ?1, updated_at = ?2 WHERE id = ?3",
            params![page, portable_timestamp(), id],
        )?;
        if updated == 0 {
            return Err(LibraryDbError::DocumentNotFound);
        }

        self.summary_by_id(id)?
            .ok_or(LibraryDbError::DocumentNotFound)
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

fn portable_timestamp() -> String {
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
    })
}
