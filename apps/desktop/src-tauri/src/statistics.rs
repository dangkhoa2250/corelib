use std::fmt;

use chrono::{DateTime, FixedOffset, NaiveDate};
use rusqlite::{params, OptionalExtension};

use crate::library_db::LibraryDatabase;

pub type Result<T> = std::result::Result<T, StatisticsError>;

#[derive(Debug)]
pub enum StatisticsError {
    Sql(rusqlite::Error),
    Validation(String),
    SessionNotFound,
}

impl fmt::Display for StatisticsError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Sql(_) => formatter.write_str("unable to access the statistics database"),
            Self::Validation(message) => formatter.write_str(message),
            Self::SessionNotFound => formatter.write_str("activity session not found"),
        }
    }
}

impl std::error::Error for StatisticsError {}

impl From<rusqlite::Error> for StatisticsError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Sql(error)
    }
}

pub struct NewActivitySession {
    pub id: String,
    pub app_key: String,
    pub activity_kind: String,
    pub context_kind: Option<String>,
    pub context_id: Option<String>,
    pub occurred_at: String,
    pub local_day: String,
    pub timezone_offset_minutes: i64,
}

pub struct ActivityCheckpoint {
    pub session_id: String,
    pub occurred_at: String,
    pub active_ms: i64,
    pub document_id: Option<String>,
    pub page: Option<i64>,
    pub page_visit_increment: i64,
}

fn validate_app_activity(app_key: &str, activity_kind: &str) -> Result<()> {
    let is_known = matches!(
        (app_key, activity_kind),
        ("reading", "reading") | ("memora", "practice")
    );
    if is_known {
        Ok(())
    } else {
        Err(StatisticsError::Validation(format!(
            "unsupported app/activity pair: {app_key}/{activity_kind}"
        )))
    }
}

fn validate_occurred_at(occurred_at: &str) -> Result<()> {
    DateTime::<FixedOffset>::parse_from_rfc3339(occurred_at)
        .map(|_| ())
        .map_err(|_| {
            StatisticsError::Validation(format!(
                "invalid RFC3339 timestamp: {occurred_at}"
            ))
        })
}

fn validate_local_day(local_day: &str) -> Result<()> {
    NaiveDate::parse_from_str(local_day, "%Y-%m-%d")
        .map(|_| ())
        .map_err(|_| StatisticsError::Validation(format!("invalid local day: {local_day}")))
}

impl LibraryDatabase {
    pub fn start_activity_session(&mut self, session: NewActivitySession) -> Result<()> {
        validate_app_activity(&session.app_key, &session.activity_kind)?;
        validate_occurred_at(&session.occurred_at)?;
        validate_local_day(&session.local_day)?;

        let transaction = self.connection.transaction()?;
        transaction.execute(
            "INSERT INTO activity_sessions (
                id, app_key, activity_kind, context_kind, context_id,
                started_at, ended_at, local_day, timezone_offset_minutes,
                raw_active_ms, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, ?7, ?8, 0, ?6, ?6)",
            params![
                session.id,
                session.app_key,
                session.activity_kind,
                session.context_kind,
                session.context_id,
                session.occurred_at,
                session.local_day,
                session.timezone_offset_minutes,
            ],
        )?;
        transaction.commit()?;
        Ok(())
    }

    pub fn checkpoint_activity_session(&mut self, checkpoint: ActivityCheckpoint) -> Result<()> {
        if checkpoint.active_ms < 0 {
            return Err(StatisticsError::Validation(format!(
                "active_ms must be non-negative: {}",
                checkpoint.active_ms
            )));
        }
        if checkpoint.page_visit_increment < 0 {
            return Err(StatisticsError::Validation(format!(
                "page_visit_increment must be non-negative: {}",
                checkpoint.page_visit_increment
            )));
        }
        if let Some(page) = checkpoint.page {
            if page <= 0 {
                return Err(StatisticsError::Validation(format!(
                    "page must be positive: {page}"
                )));
            }
        }
        validate_occurred_at(&checkpoint.occurred_at)?;

        let transaction = self.connection.transaction()?;
        let session_exists = transaction
            .query_row(
                "SELECT 1 FROM activity_sessions WHERE id = ?1",
                params![checkpoint.session_id],
                |_| Ok(()),
            )
            .optional()?
            .is_some();
        if !session_exists {
            // Dropping the transaction rolls back any pending writes (none yet here,
            // but this guard keeps the invariant explicit).
            return Err(StatisticsError::SessionNotFound);
        }

        transaction.execute(
            "UPDATE activity_sessions
             SET raw_active_ms = raw_active_ms + ?1,
                 ended_at = ?2,
                 updated_at = ?2
             WHERE id = ?3",
            params![
                checkpoint.active_ms,
                checkpoint.occurred_at,
                checkpoint.session_id,
            ],
        )?;

        if let (Some(document_id), Some(page)) =
            (checkpoint.document_id.as_deref(), checkpoint.page)
        {
            transaction.execute(
                "INSERT INTO reading_session_pages(
                    session_id, document_id, page, raw_active_ms, visit_count,
                    first_visited_at, last_visited_at
                 ) VALUES (?1, ?2, ?3, ?4, MAX(1, ?5), ?6, ?6)
                 ON CONFLICT(session_id, document_id, page) DO UPDATE SET
                    raw_active_ms = raw_active_ms + excluded.raw_active_ms,
                    visit_count = visit_count + ?5,
                    last_visited_at = excluded.last_visited_at;",
                params![
                    checkpoint.session_id,
                    document_id,
                    page,
                    checkpoint.active_ms,
                    checkpoint.page_visit_increment,
                    checkpoint.occurred_at,
                ],
            )?;
        }

        transaction.commit()?;
        Ok(())
    }

    pub fn finish_activity_session(&mut self, session_id: &str, occurred_at: &str) -> Result<()> {
        validate_occurred_at(occurred_at)?;
        let transaction = self.connection.transaction()?;
        // Idempotent: unknown sessions and already-finished sessions are no-ops so
        // crash-recovery callers can safely retry the finish without surfacing
        // a "missing row" error.
        transaction.execute(
            "UPDATE activity_sessions
             SET ended_at = ?1, updated_at = ?1
             WHERE id = ?2",
            params![occurred_at, session_id],
        )?;
        transaction.commit()?;
        Ok(())
    }
}
