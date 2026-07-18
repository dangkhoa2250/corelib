use std::collections::{HashMap, HashSet};
use std::fmt;

use chrono::{DateTime, FixedOffset, NaiveDate, Utc};
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

// ---------------------------------------------------------------------------
// Range + response types
// ---------------------------------------------------------------------------

/// Selected historical window for aggregate queries.
///
/// Range boundaries use local-day strings (`YYYY-MM-DD`) for `activity_sessions`.
/// For `review_logs.reviewed_at` (RFC3339 UTC), the start local-day is converted
/// to a UTC timestamp by treating the local day as a UTC date. The deterministic
/// test fixtures use `timezone_offset_minutes = 0`, so UTC dates line up exactly
/// with `local_day` strings.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StatisticsRange {
    Days7,
    Days30,
    Year1,
    All,
}

impl StatisticsRange {
    pub fn parse(value: &str) -> Result<Self> {
        match value {
            "7d" => Ok(Self::Days7),
            "30d" => Ok(Self::Days30),
            "1y" => Ok(Self::Year1),
            "all" => Ok(Self::All),
            _ => Err(StatisticsError::Validation(
                "invalid statistics range".into(),
            )),
        }
    }

    fn day_count(&self) -> Option<i64> {
        match self {
            Self::Days7 => Some(7),
            Self::Days30 => Some(30),
            Self::Year1 => Some(365),
            Self::All => None,
        }
    }
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityBucket {
    pub local_day: String,
    pub active_ms: i64,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatisticsOverview {
    pub active_ms: i64,
    pub reading_active_ms: i64,
    pub memora_active_ms: i64,
    pub current_streak: i64,
    pub active_days: i64,
    pub buckets: Vec<ActivityBucket>,
}

#[derive(Clone, Debug, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RatingDistribution {
    pub again: i64,
    pub hard: i64,
    pub good: i64,
    pub easy: i64,
}

#[derive(Clone, Debug, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DueForecast {
    pub today: i64,
    pub next_7_days: i64,
    pub next_30_days: i64,
}

#[derive(Clone, Debug, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CardStateCounts {
    pub new: i64,
    pub learning: i64,
    pub review: i64,
    pub relearning: i64,
    pub suspended: i64,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingStatistics {
    pub active_ms: i64,
    pub session_count: i64,
    pub average_session_ms: Option<f64>,
    pub page_visits: i64,
    pub unique_pages: i64,
    pub revisits: i64,
    pub buckets: Vec<ActivityBucket>,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentStatistics {
    pub document_id: String,
    pub active_ms: i64,
    pub session_count: i64,
    pub average_session_ms: Option<f64>,
    pub page_visits: i64,
    pub unique_pages: i64,
    pub revisits: i64,
    pub coverage: f64,
    pub real_reviews: i64,
    pub recall_rate: Option<f64>,
    pub again_count: i64,
    pub lapses: i64,
    pub buckets: Vec<ActivityBucket>,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoraStatistics {
    pub active_ms: i64,
    pub practice_active_ms: i64,
    pub session_count: i64,
    pub real_reviews: i64,
    pub recall_rate: Option<f64>,
    pub rating_distribution: RatingDistribution,
    pub average_answer_ms: Option<f64>,
    pub card_states: CardStateCounts,
    pub lapse_rate: Option<f64>,
    pub active_days: i64,
    pub due_forecast: DueForecast,
    pub buckets: Vec<ActivityBucket>,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeckStatisticsDetail {
    pub deck_id: String,
    pub active_ms: i64,
    pub session_count: i64,
    pub real_reviews: i64,
    pub recall_rate: Option<f64>,
    pub rating_distribution: RatingDistribution,
    pub average_answer_ms: Option<f64>,
    pub card_states: CardStateCounts,
    pub lapse_rate: Option<f64>,
    pub due_forecast: DueForecast,
    pub buckets: Vec<ActivityBucket>,
}

const ACTIVE_DAY_THRESHOLD_MS: i64 = 60_000;
const REVIEW_TIME_CAP_MS: i64 = 300_000;

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
        // Unknown session ids and retries with the same timestamp are no-ops
        // (UPDATE affects 0 rows or writes the same value). A different timestamp
        // will overwrite ended_at/updated_at; crash-recovery callers should replay
        // the original close timestamp to keep the session idempotent.
        transaction.execute(
            "UPDATE activity_sessions
             SET ended_at = ?1, updated_at = ?1
             WHERE id = ?2",
            params![occurred_at, session_id],
        )?;
        transaction.commit()?;
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Personal aggregate queries
    // -----------------------------------------------------------------------

    pub fn statistics_overview(
        &self,
        range: StatisticsRange,
        now_utc: &str,
        today_local_day: &str,
    ) -> Result<StatisticsOverview> {
        let window = RangeWindow::compute(range, today_local_day)?;
        let reading_active =
            query_activity_active_ms(&self.connection, Some("reading"), window.start(), None)?;
        let practice_active =
            query_activity_active_ms(&self.connection, Some("practice"), window.start(), None)?;
        let real_ms =
            query_capped_review_ms(&self.connection, &window, now_utc, ReviewScope::All)?;
        let memora_active = real_ms + practice_active;
        let active_ms = reading_active + memora_active;

        let lifetime_active_days =
            query_lifetime_active_days(&self.connection, today_local_day, now_utc)?;
        let current_streak = compute_current_streak(&lifetime_active_days, today_local_day)?;
        let active_days = count_active_days_in_window(&lifetime_active_days, &window);

        let bucket_days = window.bucket_days(&self.connection, today_local_day, now_utc)?;
        let buckets = build_total_buckets(&self.connection, &bucket_days, &window, now_utc)?;

        Ok(StatisticsOverview {
            active_ms,
            reading_active_ms: reading_active,
            memora_active_ms: memora_active,
            current_streak,
            active_days,
            buckets,
        })
    }

    pub fn reading_statistics(
        &self,
        range: StatisticsRange,
        now_utc: &str,
        today_local_day: &str,
    ) -> Result<ReadingStatistics> {
        let window = RangeWindow::compute(range, today_local_day)?;
        let active_ms =
            query_activity_active_ms(&self.connection, Some("reading"), window.start(), None)?;
        let session_count =
            query_activity_session_count(&self.connection, Some("reading"), window.start())?;
        let average_session_ms = average(active_ms, session_count);

        let page_metrics = query_reading_page_metrics(&self.connection, &window, None)?;
        let bucket_days = window.bucket_days(&self.connection, today_local_day, now_utc)?;
        let buckets = build_reading_buckets(&self.connection, &bucket_days, &window, None)?;

        Ok(ReadingStatistics {
            active_ms,
            session_count,
            average_session_ms,
            page_visits: page_metrics.page_visits,
            unique_pages: page_metrics.unique_pages,
            revisits: page_metrics.revisits,
            buckets,
        })
    }

    pub fn document_statistics(
        &self,
        document_id: &str,
        range: StatisticsRange,
        now_utc: &str,
        today_local_day: &str,
    ) -> Result<DocumentStatistics> {
        let window = RangeWindow::compute(range, today_local_day)?;
        let scope = ReviewScope::Document(document_id);

        let page_metrics = query_reading_page_metrics(&self.connection, &window, Some(document_id))?;
        let session_count = query_document_session_count(&self.connection, &window, document_id)?;
        let active_ms = query_document_active_ms(&self.connection, &window, document_id)?;
        let average_session_ms = average(active_ms, session_count);

        let real_reviews = query_count_real_reviews(&self.connection, &window, now_utc, scope)?;
        let rating = query_rating_distribution(&self.connection, &window, now_utc, scope)?;
        let recall_rate = recall_rate_from(&rating);
        let lapses = query_count_lapses(&self.connection, &window, now_utc, scope)?;

        let coverage = query_document_coverage(&self.connection, document_id)?;

        let bucket_days = window.bucket_days(&self.connection, today_local_day, now_utc)?;
        let buckets =
            build_reading_buckets(&self.connection, &bucket_days, &window, Some(document_id))?;

        Ok(DocumentStatistics {
            document_id: document_id.to_string(),
            active_ms,
            session_count,
            average_session_ms,
            page_visits: page_metrics.page_visits,
            unique_pages: page_metrics.unique_pages,
            revisits: page_metrics.revisits,
            coverage,
            real_reviews,
            recall_rate,
            again_count: rating.again,
            lapses,
            buckets,
        })
    }

    pub fn memora_statistics(
        &self,
        range: StatisticsRange,
        now_utc: &str,
        today_local_day: &str,
    ) -> Result<MemoraStatistics> {
        let window = RangeWindow::compute(range, today_local_day)?;
        let body = build_memora_body(&self.connection, &window, now_utc, today_local_day, None)?;
        Ok(MemoraStatistics {
            active_ms: body.active_ms,
            practice_active_ms: body.practice_active_ms,
            session_count: body.session_count,
            real_reviews: body.real_reviews,
            recall_rate: body.recall_rate,
            rating_distribution: body.rating,
            average_answer_ms: body.average_answer_ms,
            card_states: query_card_states(&self.connection, None)?,
            lapse_rate: body.lapse_rate,
            active_days: body.active_days,
            due_forecast: body.due_forecast,
            buckets: body.buckets,
        })
    }

    pub fn deck_statistics_detail(
        &self,
        deck_id: &str,
        range: StatisticsRange,
        now_utc: &str,
        today_local_day: &str,
    ) -> Result<DeckStatisticsDetail> {
        let window = RangeWindow::compute(range, today_local_day)?;
        let body = build_memora_body(
            &self.connection,
            &window,
            now_utc,
            today_local_day,
            Some(deck_id),
        )?;
        Ok(DeckStatisticsDetail {
            deck_id: deck_id.to_string(),
            active_ms: body.active_ms,
            session_count: body.session_count,
            real_reviews: body.real_reviews,
            recall_rate: body.recall_rate,
            rating_distribution: body.rating,
            average_answer_ms: body.average_answer_ms,
            card_states: query_card_states(&self.connection, Some(deck_id))?,
            lapse_rate: body.lapse_rate,
            due_forecast: body.due_forecast,
            buckets: body.buckets,
        })
    }
}

// ---------------------------------------------------------------------------
// Range window + scope helpers
// ---------------------------------------------------------------------------

/// Resolved `[start_local_day, today_local_day]` window for a query.
///
/// `start` is `None` for `StatisticsRange::All`. UTC equivalents are derived
/// by treating the local-day string as a UTC date (see the module-level
/// comment on `StatisticsRange`).
struct RangeWindow {
    start: Option<String>,
    today: String,
}

impl RangeWindow {
    fn compute(range: StatisticsRange, today_local_day: &str) -> Result<Self> {
        let today_date = parse_local_day(today_local_day)?;
        let start = range
            .day_count()
            .map(|days| format_local_day(today_date - chrono::Duration::days(days - 1)));
        Ok(Self {
            start,
            today: today_local_day.to_string(),
        })
    }

    fn start(&self) -> Option<&str> {
        self.start.as_deref()
    }

    /// Ordered list of local days covered by this window.
    ///
    /// Bounded ranges enumerate `[start, today]` inclusive so the UI always
    /// sees a zero-filled grid. For `All`, walk from the earliest activity
    /// day (review or activity) up to today; if there is no activity yet,
    /// return an empty list.
    fn bucket_days(
        &self,
        connection: &rusqlite::Connection,
        today_local_day: &str,
        now_utc: &str,
    ) -> Result<Vec<String>> {
        match &self.start {
            Some(start) => enumerate_days(start, &self.today),
            None => {
                let earliest = earliest_activity_day(connection, today_local_day, now_utc)?;
                match earliest {
                    Some(day) => enumerate_days(&day, &self.today),
                    None => Ok(Vec::new()),
                }
            }
        }
    }

    /// RFC3339 UTC timestamp for the start of the start local day. `None` when
    /// the range is `All` (no lower bound).
    fn start_utc(&self) -> Result<Option<String>> {
        match self.start.as_deref() {
            Some(day) => Ok(Some(local_day_to_utc_start(day)?)),
            None => Ok(None),
        }
    }
}

#[derive(Clone, Copy)]
enum ReviewScope<'a> {
    All,
    Deck(&'a str),
    Document(&'a str),
}

impl<'a> ReviewScope<'a> {
    fn join_clause(self) -> &'static str {
        match self {
            Self::All => "",
            Self::Deck(_) => "JOIN cards ON cards.id = review_logs.card_id",
            Self::Document(_) => {
                "JOIN card_sources ON card_sources.card_id = review_logs.card_id"
            }
        }
    }

    fn bind_value(self) -> Option<&'a str> {
        match self {
            Self::All => None,
            Self::Deck(id) | Self::Document(id) => Some(id),
        }
    }
}

struct MemoraBody {
    active_ms: i64,
    practice_active_ms: i64,
    session_count: i64,
    real_reviews: i64,
    recall_rate: Option<f64>,
    rating: RatingDistribution,
    average_answer_ms: Option<f64>,
    lapse_rate: Option<f64>,
    active_days: i64,
    due_forecast: DueForecast,
    buckets: Vec<ActivityBucket>,
}

fn build_memora_body(
    connection: &rusqlite::Connection,
    window: &RangeWindow,
    now_utc: &str,
    today_local_day: &str,
    deck_scope: Option<&str>,
) -> Result<MemoraBody> {
    let scope = match deck_scope {
        Some(id) => ReviewScope::Deck(id),
        None => ReviewScope::All,
    };

    let practice_active_ms = query_activity_active_ms(connection, Some("practice"), window.start(), deck_scope)?;
    let real_ms = query_capped_review_ms(connection, window, now_utc, scope)?;
    let active_ms = real_ms + practice_active_ms;

    let real_session_count = query_real_study_session_count(connection, window, deck_scope)?;
    let practice_session_count = query_practice_session_count(connection, window.start(), deck_scope)?;
    let session_count = real_session_count + practice_session_count;

    let real_reviews = query_count_real_reviews(connection, window, now_utc, scope)?;
    let rating = query_rating_distribution(connection, window, now_utc, scope)?;
    let recall_rate = recall_rate_from(&rating);
    let average_answer_ms = query_average_answer_ms(connection, window, now_utc, scope)?;
    let lapse_rate = query_lapse_rate(connection, window, now_utc, scope)?;

    let active_days = match deck_scope {
        Some(deck_id) => query_deck_active_days(connection, window, deck_id)?,
        None => {
            let lifetime = query_lifetime_active_days(connection, today_local_day, now_utc)?;
            count_active_days_in_window(&lifetime, window)
        }
    };

    let due_forecast = query_due_forecast(connection, now_utc, deck_scope)?;

    let bucket_days = window.bucket_days(connection, today_local_day, now_utc)?;
    let buckets = build_memora_buckets(connection, &bucket_days, window, now_utc, deck_scope)?;

    Ok(MemoraBody {
        active_ms,
        practice_active_ms,
        session_count,
        real_reviews,
        recall_rate,
        rating,
        average_answer_ms,
        lapse_rate,
        active_days,
        due_forecast,
        buckets,
    })
}

// ---------------------------------------------------------------------------
// Small datetime + math helpers
// ---------------------------------------------------------------------------

fn parse_local_day(value: &str) -> Result<NaiveDate> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| StatisticsError::Validation(format!("invalid local day: {value}")))
}

fn format_local_day(date: NaiveDate) -> String {
    date.format("%Y-%m-%d").to_string()
}

fn enumerate_days(start: &str, end: &str) -> Result<Vec<String>> {
    let mut days = Vec::new();
    let mut current = parse_local_day(start)?;
    let last = parse_local_day(end)?;
    while current <= last {
        days.push(format_local_day(current));
        current += chrono::Duration::days(1);
    }
    Ok(days)
}

fn local_day_to_utc_start(local_day: &str) -> Result<String> {
    let date = parse_local_day(local_day)?;
    Ok(format!("{}T00:00:00.000Z", date.format("%Y-%m-%d")))
}

fn parse_utc_timestamp(value: &str) -> Result<DateTime<Utc>> {
    DateTime::<FixedOffset>::parse_from_rfc3339(value)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|_| StatisticsError::Validation(format!("invalid RFC3339 timestamp: {value}")))
}

fn utc_timestamp_to_local_day(value: &str) -> Option<String> {
    DateTime::<FixedOffset>::parse_from_rfc3339(value)
        .ok()
        .map(|dt| dt.format("%Y-%m-%d").to_string())
}

fn average(total_ms: i64, count: i64) -> Option<f64> {
    if count <= 0 {
        None
    } else {
        Some(total_ms as f64 / count as f64)
    }
}

fn recall_rate_from(rating: &RatingDistribution) -> Option<f64> {
    let total = rating.again + rating.hard + rating.good + rating.easy;
    if total == 0 {
        None
    } else {
        let recalled = rating.hard + rating.good + rating.easy;
        Some(recalled as f64 / total as f64)
    }
}

/// Static upper bound used in `local_day <= ?` so callers don't have to thread
/// `today_local_day` through every helper. The string compares greater than any
/// plausible local-day value, so any real local_day sorts before it.
fn today_upper_bound() -> &'static str {
    "9999-12-31"
}

// ---------------------------------------------------------------------------
// Activity session helpers
// ---------------------------------------------------------------------------

fn activity_window_clause(start: Option<&str>) -> &'static str {
    if start.is_some() {
        "local_day <= ? AND local_day >= ?"
    } else {
        "local_day <= ?"
    }
}

fn query_activity_active_ms(
    connection: &rusqlite::Connection,
    activity_kind: Option<&str>,
    start: Option<&str>,
    deck_scope: Option<&str>,
) -> Result<i64> {
    let kind_clause = match activity_kind {
        Some(_) => "activity_kind = ? AND",
        None => "",
    };
    let deck_clause = match (activity_kind, deck_scope) {
        (Some("practice"), Some(_)) => "context_kind = 'deck' AND context_id = ? AND",
        _ => "",
    };
    let sql = format!(
        "SELECT COALESCE(SUM(raw_active_ms), 0) FROM activity_sessions
         WHERE {kind_clause} {deck_clause} {window}",
        kind_clause = kind_clause,
        deck_clause = deck_clause,
        window = activity_window_clause(start),
    );
    Ok(match (activity_kind, deck_scope, start) {
        (Some(kind), Some(deck), Some(start_str)) => connection.query_row(
            &sql,
            params![kind, deck, today_upper_bound(), start_str],
            |row| row.get(0),
        )?,
        (Some(kind), Some(deck), None) => connection.query_row(
            &sql,
            params![kind, deck, today_upper_bound()],
            |row| row.get(0),
        )?,
        (Some(kind), None, Some(start_str)) => connection.query_row(
            &sql,
            params![kind, today_upper_bound(), start_str],
            |row| row.get(0),
        )?,
        (Some(kind), None, None) => connection.query_row(
            &sql,
            params![kind, today_upper_bound()],
            |row| row.get(0),
        )?,
        (None, _, Some(start_str)) => connection.query_row(
            &sql,
            params![today_upper_bound(), start_str],
            |row| row.get(0),
        )?,
        (None, _, None) => connection.query_row(
            &sql,
            params![today_upper_bound()],
            |row| row.get(0),
        )?,
    })
}

fn query_activity_session_count(
    connection: &rusqlite::Connection,
    activity_kind: Option<&str>,
    start: Option<&str>,
) -> Result<i64> {
    let kind_clause = match activity_kind {
        Some(_) => "activity_kind = ? AND",
        None => "",
    };
    let sql = format!(
        "SELECT COUNT(*) FROM activity_sessions
         WHERE {kind_clause} {window}",
        kind_clause = kind_clause,
        window = activity_window_clause(start),
    );
    Ok(match (activity_kind, start) {
        (Some(kind), Some(start_str)) => connection.query_row(
            &sql,
            params![kind, today_upper_bound(), start_str],
            |row| row.get(0),
        )?,
        (Some(kind), None) => connection.query_row(
            &sql,
            params![kind, today_upper_bound()],
            |row| row.get(0),
        )?,
        (None, Some(start_str)) => connection.query_row(
            &sql,
            params![today_upper_bound(), start_str],
            |row| row.get(0),
        )?,
        (None, None) => connection.query_row(&sql, params![today_upper_bound()], |row| {
            row.get(0)
        })?,
    })
}

fn query_practice_session_count(
    connection: &rusqlite::Connection,
    start: Option<&str>,
    deck_scope: Option<&str>,
) -> Result<i64> {
    let deck_clause = match deck_scope {
        Some(_) => "AND context_kind = 'deck' AND context_id = ?",
        None => "",
    };
    let sql = format!(
        "SELECT COUNT(*) FROM activity_sessions
         WHERE activity_kind = 'practice'
           AND raw_active_ms > 0
           {deck_clause}
           AND {window}",
        deck_clause = deck_clause,
        window = activity_window_clause(start),
    );
    Ok(match (deck_scope, start) {
        (Some(deck), Some(start_str)) => connection.query_row(
            &sql,
            params![deck, today_upper_bound(), start_str],
            |row| row.get(0),
        )?,
        (Some(deck), None) => connection.query_row(
            &sql,
            params![deck, today_upper_bound()],
            |row| row.get(0),
        )?,
        (None, Some(start_str)) => connection.query_row(
            &sql,
            params![today_upper_bound(), start_str],
            |row| row.get(0),
        )?,
        (None, None) => connection.query_row(
            &sql,
            params![today_upper_bound()],
            |row| row.get(0),
        )?,
    })
}

struct PageMetrics {
    page_visits: i64,
    unique_pages: i64,
    revisits: i64,
}

fn query_reading_page_metrics(
    connection: &rusqlite::Connection,
    window: &RangeWindow,
    document_id: Option<&str>,
) -> Result<PageMetrics> {
    let document_clause = match document_id {
        Some(_) => "AND reading_session_pages.document_id = ?",
        None => "",
    };
    let sql = format!(
        "SELECT COALESCE(SUM(visit_count), 0), COUNT(DISTINCT page)
         FROM reading_session_pages
         JOIN activity_sessions ON activity_sessions.id = reading_session_pages.session_id
         WHERE {window} {document_clause}",
        window = activity_window_clause(window.start()),
        document_clause = document_clause,
    );
    let (page_visits, unique_pages): (i64, i64) = match (document_id, window.start()) {
        (Some(id), Some(start)) => connection.query_row(
            &sql,
            params![today_upper_bound(), start, id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?,
        (Some(id), None) => connection.query_row(
            &sql,
            params![today_upper_bound(), id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?,
        (None, Some(start)) => connection.query_row(
            &sql,
            params![today_upper_bound(), start],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?,
        (None, None) => connection.query_row(&sql, params![today_upper_bound()], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })?,
    };
    Ok(PageMetrics {
        page_visits,
        unique_pages,
        revisits: page_visits - unique_pages,
    })
}

fn query_document_session_count(
    connection: &rusqlite::Connection,
    window: &RangeWindow,
    document_id: &str,
) -> Result<i64> {
    let sql = format!(
        "SELECT COUNT(DISTINCT reading_session_pages.session_id)
         FROM reading_session_pages
         JOIN activity_sessions ON activity_sessions.id = reading_session_pages.session_id
         WHERE reading_session_pages.document_id = ?1 AND {window}",
        window = activity_window_clause(window.start()),
    );
    Ok(if let Some(start) = window.start() {
        connection.query_row(
            &sql,
            params![document_id, today_upper_bound(), start],
            |row| row.get(0),
        )?
    } else {
        connection.query_row(&sql, params![document_id, today_upper_bound()], |row| {
            row.get(0)
        })?
    })
}

fn query_document_active_ms(
    connection: &rusqlite::Connection,
    window: &RangeWindow,
    document_id: &str,
) -> Result<i64> {
    let sql = format!(
        "SELECT COALESCE(SUM(reading_session_pages.raw_active_ms), 0)
         FROM reading_session_pages
         JOIN activity_sessions ON activity_sessions.id = reading_session_pages.session_id
         WHERE reading_session_pages.document_id = ?1 AND {window}",
        window = activity_window_clause(window.start()),
    );
    Ok(if let Some(start) = window.start() {
        connection.query_row(
            &sql,
            params![document_id, today_upper_bound(), start],
            |row| row.get(0),
        )?
    } else {
        connection.query_row(&sql, params![document_id, today_upper_bound()], |row| {
            row.get(0)
        })?
    })
}

fn query_document_coverage(
    connection: &rusqlite::Connection,
    document_id: &str,
) -> Result<f64> {
    let num_pages: Option<i64> = connection
        .query_row(
            "SELECT num_pages FROM documents WHERE id = ?1",
            params![document_id],
            |row| row.get(0),
        )
        .optional()?
        .flatten();
    let unique_pages_lifetime: i64 = connection.query_row(
        "SELECT COUNT(DISTINCT page) FROM reading_session_pages WHERE document_id = ?1",
        params![document_id],
        |row| row.get(0),
    )?;
    let pages = num_pages.unwrap_or(0);
    if pages <= 0 {
        return Ok(0.0);
    }
    Ok(unique_pages_lifetime as f64 / pages as f64)
}

// ---------------------------------------------------------------------------
// Review log helpers (range + scope aware)
// ---------------------------------------------------------------------------

fn review_window_clause(start: Option<&str>) -> &'static str {
    if start.is_some() {
        "review_logs.reviewed_at <= ? AND review_logs.reviewed_at >= ?"
    } else {
        "review_logs.reviewed_at <= ?"
    }
}

fn collect_review_rows(
    connection: &rusqlite::Connection,
    window: &RangeWindow,
    now_utc: &str,
    scope: ReviewScope,
) -> Result<Vec<ReviewRow>> {
    let join = scope.join_clause();
    let scope_filter = match scope {
        ReviewScope::All => "",
        ReviewScope::Deck(_) => "AND cards.deck_id = ?",
        ReviewScope::Document(_) => "AND card_sources.document_id = ?",
    };
    let sql = format!(
        "SELECT review_logs.rating, review_logs.prior_state, review_logs.elapsed_ms
         FROM review_logs
         {join}
         WHERE {where_clause} {scope_filter}",
        join = join,
        where_clause = review_window_clause(window.start()),
        scope_filter = scope_filter,
    );
    let start_utc = window.start_utc()?;
    let mut stmt = connection.prepare(&sql)?;
    let review_map = |row: &rusqlite::Row<'_>| {
        Ok(ReviewRow {
            rating: row.get(0)?,
            prior_state: row.get(1)?,
            elapsed_ms: row.get(2)?,
        })
    };
    let rows = match (scope.bind_value(), start_utc.as_deref()) {
        (Some(value), Some(start)) => stmt
            .query_map(params![now_utc, start, value], review_map)?
            .collect::<std::result::Result<Vec<_>, _>>()?,
        (Some(value), None) => stmt
            .query_map(params![now_utc, value], review_map)?
            .collect::<std::result::Result<Vec<_>, _>>()?,
        (None, Some(start)) => stmt
            .query_map(params![now_utc, start], review_map)?
            .collect::<std::result::Result<Vec<_>, _>>()?,
        (None, None) => stmt
            .query_map(params![now_utc], review_map)?
            .collect::<std::result::Result<Vec<_>, _>>()?,
    };
    Ok(rows)
}

#[derive(Debug, Clone)]
struct ReviewRow {
    rating: String,
    prior_state: String,
    elapsed_ms: i64,
}

fn query_capped_review_ms(
    connection: &rusqlite::Connection,
    window: &RangeWindow,
    now_utc: &str,
    scope: ReviewScope,
) -> Result<i64> {
    let rows = collect_review_rows(connection, window, now_utc, scope)?;
    let total: i64 = rows
        .iter()
        .map(|row| row.elapsed_ms.min(REVIEW_TIME_CAP_MS))
        .sum();
    Ok(total)
}

fn query_count_real_reviews(
    connection: &rusqlite::Connection,
    window: &RangeWindow,
    now_utc: &str,
    scope: ReviewScope,
) -> Result<i64> {
    Ok(collect_review_rows(connection, window, now_utc, scope)?.len() as i64)
}

fn query_rating_distribution(
    connection: &rusqlite::Connection,
    window: &RangeWindow,
    now_utc: &str,
    scope: ReviewScope,
) -> Result<RatingDistribution> {
    let mut distribution = RatingDistribution::default();
    for row in collect_review_rows(connection, window, now_utc, scope)? {
        match row.rating.as_str() {
            "again" => distribution.again += 1,
            "hard" => distribution.hard += 1,
            "good" => distribution.good += 1,
            "easy" => distribution.easy += 1,
            _ => {}
        }
    }
    Ok(distribution)
}

fn query_count_lapses(
    connection: &rusqlite::Connection,
    window: &RangeWindow,
    now_utc: &str,
    scope: ReviewScope,
) -> Result<i64> {
    let rows = collect_review_rows(connection, window, now_utc, scope)?;
    Ok(rows
        .iter()
        .filter(|row| row.prior_state == "review" && row.rating == "again")
        .count() as i64)
}

fn query_lapse_rate(
    connection: &rusqlite::Connection,
    window: &RangeWindow,
    now_utc: &str,
    scope: ReviewScope,
) -> Result<Option<f64>> {
    let rows = collect_review_rows(connection, window, now_utc, scope)?;
    let denominator = rows.iter().filter(|row| row.prior_state == "review").count();
    if denominator == 0 {
        return Ok(None);
    }
    let lapses = rows
        .iter()
        .filter(|row| row.prior_state == "review" && row.rating == "again")
        .count();
    Ok(Some(lapses as f64 / denominator as f64))
}

fn query_average_answer_ms(
    connection: &rusqlite::Connection,
    window: &RangeWindow,
    now_utc: &str,
    scope: ReviewScope,
) -> Result<Option<f64>> {
    let rows = collect_review_rows(connection, window, now_utc, scope)?;
    if rows.is_empty() {
        return Ok(None);
    }
    let total: i64 = rows
        .iter()
        .map(|row| row.elapsed_ms.min(REVIEW_TIME_CAP_MS))
        .sum();
    Ok(Some(total as f64 / rows.len() as f64))
}

// ---------------------------------------------------------------------------
// Real study + practice session helpers
// ---------------------------------------------------------------------------

fn query_real_study_session_count(
    connection: &rusqlite::Connection,
    window: &RangeWindow,
    deck_scope: Option<&str>,
) -> Result<i64> {
    let scope_clause = match deck_scope {
        Some(_) => "AND study_sessions.deck_id = ?",
        None => "",
    };
    let start_clause = if window.start().is_some() {
        "AND study_sessions.created_at >= ?"
    } else {
        ""
    };
    // Parameters are bound positionally; the order depends on which optional
    // clauses are present. We always pass the upper bound first.
    let sql = format!(
        "SELECT COUNT(DISTINCT study_sessions.id)
         FROM study_sessions
         JOIN study_session_cards
           ON study_session_cards.session_id = study_sessions.id
         WHERE study_session_cards.consumed_at IS NOT NULL
           AND study_session_cards.review_log_id IS NOT NULL
           AND study_sessions.created_at <= ?
           {start_clause}
           {scope_clause}",
        start_clause = start_clause,
        scope_clause = scope_clause,
    );
    let start_utc = window.start_utc()?;
    let upper = "9999-12-31T23:59:59.999Z";
    let count: i64 = match (deck_scope, start_utc.as_deref()) {
        (Some(deck), Some(start)) => {
            connection.query_row(&sql, params![upper, start, deck], |row| row.get(0))?
        }
        (Some(deck), None) => connection.query_row(&sql, params![upper, deck], |row| row.get(0))?,
        (None, Some(start)) => connection.query_row(&sql, params![upper, start], |row| row.get(0))?,
        (None, None) => connection.query_row(&sql, params![upper], |row| row.get(0))?,
    };
    Ok(count)
}

// ---------------------------------------------------------------------------
// Snapshot helpers (not range-bounded)
// ---------------------------------------------------------------------------

fn query_card_states(
    connection: &rusqlite::Connection,
    deck_id: Option<&str>,
) -> Result<CardStateCounts> {
    let (sql, has_param) = match deck_id {
        Some(_) => (
            "SELECT state, COUNT(*) FROM cards
             WHERE deleted_at IS NULL AND deck_id = ?1
             GROUP BY state",
            true,
        ),
        None => (
            "SELECT state, COUNT(*) FROM cards
             WHERE deleted_at IS NULL
             GROUP BY state",
            false,
        ),
    };
    let mut counts = CardStateCounts::default();
    let mut stmt = connection.prepare(sql)?;
    let rows: Vec<(String, i64)> = if has_param {
        let id = deck_id.expect("present when has_param");
        stmt
            .query_map(params![id], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<std::result::Result<Vec<_>, _>>()?
    } else {
        stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<std::result::Result<Vec<_>, _>>()?
    };
    for (state, count) in rows {
        match state.as_str() {
            "new" => counts.new += count,
            "learning" => counts.learning += count,
            "review" => counts.review += count,
            "relearning" => counts.relearning += count,
            "suspended" => counts.suspended += count,
            _ => {}
        }
    }
    Ok(counts)
}

fn query_due_forecast(
    connection: &rusqlite::Connection,
    now_utc: &str,
    deck_id: Option<&str>,
) -> Result<DueForecast> {
    let now = parse_utc_timestamp(now_utc)?;
    let in_7_days = now + chrono::Duration::days(7);
    let in_30_days = now + chrono::Duration::days(30);
    let now_str = now.to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let in_7_str = in_7_days.to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let in_30_str = in_30_days.to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

    let deck_clause = match deck_id {
        Some(_) => "AND deck_id = ?",
        None => "",
    };
    let sql = format!(
        "SELECT
            SUM(CASE WHEN due_at <= ?1 THEN 1 ELSE 0 END) AS today,
            SUM(CASE WHEN due_at > ?1 AND due_at <= ?2 THEN 1 ELSE 0 END) AS next_7,
            SUM(CASE WHEN due_at > ?2 AND due_at <= ?3 THEN 1 ELSE 0 END) AS next_30
         FROM cards
         WHERE deleted_at IS NULL AND state != 'suspended' {deck_clause}",
        deck_clause = deck_clause,
    );
    let (today, next_7, next_30): (Option<i64>, Option<i64>, Option<i64>) = match deck_id {
        Some(id) => connection.query_row(&sql, params![now_str, in_7_str, in_30_str, id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })?,
        None => connection.query_row(&sql, params![now_str, in_7_str, in_30_str], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })?,
    };
    Ok(DueForecast {
        today: today.unwrap_or(0),
        next_7_days: next_7.unwrap_or(0),
        next_30_days: next_30.unwrap_or(0),
    })
}

// ---------------------------------------------------------------------------
// Active day + streak helpers
// ---------------------------------------------------------------------------

fn query_lifetime_active_days(
    connection: &rusqlite::Connection,
    today_local_day: &str,
    now_utc: &str,
) -> Result<HashSet<String>> {
    let mut days: HashSet<String> = HashSet::new();

    let mut stmt = connection.prepare(
        "SELECT local_day, SUM(raw_active_ms) AS total
         FROM activity_sessions
         WHERE local_day <= ?1
         GROUP BY local_day",
    )?;
    let rows: Vec<(String, i64)> = stmt
        .query_map(params![today_local_day], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    for (day, total) in rows {
        if total >= ACTIVE_DAY_THRESHOLD_MS {
            days.insert(day);
        }
    }

    let mut review_stmt =
        connection.prepare("SELECT DISTINCT reviewed_at FROM review_logs WHERE reviewed_at <= ?1")?;
    let review_rows: Vec<String> = review_stmt
        .query_map(params![now_utc], |row| row.get(0))?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    for reviewed_at in review_rows {
        if let Some(day) = utc_timestamp_to_local_day(&reviewed_at) {
            days.insert(day);
        }
    }

    Ok(days)
}

fn count_active_days_in_window(days: &HashSet<String>, window: &RangeWindow) -> i64 {
    let start_date = match window.start() {
        Some(day) => day,
        None => return days.len() as i64,
    };
    days.iter()
        .filter(|day| day.as_str() >= start_date && day.as_str() <= window.today.as_str())
        .count() as i64
}

fn query_deck_active_days(
    connection: &rusqlite::Connection,
    window: &RangeWindow,
    deck_id: &str,
) -> Result<i64> {
    // Deck-scoped active days combine: any review log on a card in this deck,
    // or 60s+ practice activity scoped to this deck. Reading activity does
    // not contribute to a deck's active-day count.
    let mut days: HashSet<String> = HashSet::new();

    let mut review_stmt = connection.prepare(
        "SELECT DISTINCT strftime('%Y-%m-%d', review_logs.reviewed_at) AS day
         FROM review_logs
         JOIN cards ON cards.id = review_logs.card_id
         WHERE cards.deck_id = ?1
           AND review_logs.reviewed_at <= ?2",
    )?;
    let upper = "9999-12-31T23:59:59.999Z";
    let review_rows: Vec<String> = review_stmt
        .query_map(params![deck_id, upper], |row| row.get(0))?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    for day in review_rows {
        days.insert(day);
    }

    let mut activity_stmt = connection.prepare(
        "SELECT local_day, SUM(raw_active_ms) AS total
         FROM activity_sessions
         WHERE activity_kind = 'practice'
           AND context_kind = 'deck'
           AND context_id = ?1
           AND local_day <= ?2
         GROUP BY local_day",
    )?;
    let activity_rows: Vec<(String, i64)> = activity_stmt
        .query_map(params![deck_id, window.today], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    for (day, total) in activity_rows {
        if total >= ACTIVE_DAY_THRESHOLD_MS {
            days.insert(day);
        }
    }

    let start_date = match window.start() {
        Some(day) => day,
        None => return Ok(days.len() as i64),
    };
    Ok(days
        .iter()
        .filter(|day| day.as_str() >= start_date && day.as_str() <= window.today.as_str())
        .count() as i64)
}

fn compute_current_streak(active_days: &HashSet<String>, today_local_day: &str) -> Result<i64> {
    let today = parse_local_day(today_local_day)?;
    let yesterday = today - chrono::Duration::days(1);

    let streak_from = if active_days.contains(today_local_day) {
        Some(today)
    } else if active_days.contains(&format_local_day(yesterday)) {
        Some(yesterday)
    } else {
        None
    };

    let mut streak = 0i64;
    if let Some(mut cursor) = streak_from {
        loop {
            let key = format_local_day(cursor);
            if active_days.contains(&key) {
                streak += 1;
                cursor -= chrono::Duration::days(1);
            } else {
                break;
            }
        }
    }
    Ok(streak)
}

fn earliest_activity_day(
    connection: &rusqlite::Connection,
    today_local_day: &str,
    now_utc: &str,
) -> Result<Option<String>> {
    let activity_day: Option<String> = connection
        .query_row(
            "SELECT MIN(local_day) FROM activity_sessions WHERE local_day <= ?1",
            params![today_local_day],
            |row| row.get(0),
        )
        .optional()?
        .flatten();
    let review_day: Option<String> = connection
        .query_row(
            "SELECT MIN(reviewed_at) FROM review_logs WHERE reviewed_at <= ?1",
            params![now_utc],
            |row| row.get::<_, Option<String>>(0),
        )?
        .and_then(|value| utc_timestamp_to_local_day(&value));
    Ok(activity_day.into_iter().chain(review_day).min())
}

// ---------------------------------------------------------------------------
// Bucket builders
// ---------------------------------------------------------------------------

fn build_total_buckets(
    connection: &rusqlite::Connection,
    bucket_days: &[String],
    window: &RangeWindow,
    now_utc: &str,
) -> Result<Vec<ActivityBucket>> {
    let mut daily: HashMap<String, i64> = HashMap::new();

    // All activity_sessions.raw_active_ms per day (Reading + Practice).
    let activity_sql = format!(
        "SELECT local_day, COALESCE(SUM(raw_active_ms), 0)
         FROM activity_sessions
         WHERE {window}
         GROUP BY local_day",
        window = activity_window_clause(window.start()),
    );
    for (day, value) in query_daily_activity_sums(connection, &activity_sql, window.start(), None)? {
        *daily.entry(day).or_insert(0) += value;
    }

    // Capped real-study time per day, across all review logs.
    let review_sql = format!(
        "SELECT reviewed_at, MIN(elapsed_ms, ?)
         FROM review_logs
         WHERE {review_window}",
        review_window = review_window_clause(window.start()),
    );
    for (day, value) in query_daily_review_sums(connection, &review_sql, window, now_utc, None)? {
        *daily.entry(day).or_insert(0) += value;
    }

    materialize_buckets(bucket_days, &daily)
}

fn build_reading_buckets(
    connection: &rusqlite::Connection,
    bucket_days: &[String],
    window: &RangeWindow,
    document_id: Option<&str>,
) -> Result<Vec<ActivityBucket>> {
    let mut daily: HashMap<String, i64> = HashMap::new();

    let rows: Vec<(String, i64)> = match document_id {
        Some(id) => {
            let sql = format!(
                "SELECT activity_sessions.local_day,
                        COALESCE(SUM(reading_session_pages.raw_active_ms), 0)
                 FROM reading_session_pages
                 JOIN activity_sessions
                   ON activity_sessions.id = reading_session_pages.session_id
                 WHERE {window} AND reading_session_pages.document_id = ?
                 GROUP BY activity_sessions.local_day",
                window = activity_window_clause(window.start()),
            );
            let mut stmt = connection.prepare(&sql)?;
            if let Some(start) = window.start() {
                stmt
                    .query_map(params![today_upper_bound(), start, id], |row| {
                        Ok((row.get(0)?, row.get(1)?))
                    })?
                    .collect::<std::result::Result<Vec<_>, _>>()?
            } else {
                stmt
                    .query_map(params![today_upper_bound(), id], |row| {
                        Ok((row.get(0)?, row.get(1)?))
                    })?
                    .collect::<std::result::Result<Vec<_>, _>>()?
            }
        }
        None => {
            let sql = format!(
                "SELECT local_day, COALESCE(SUM(raw_active_ms), 0)
                 FROM activity_sessions
                 WHERE activity_kind = 'reading' AND {window}
                 GROUP BY local_day",
                window = activity_window_clause(window.start()),
            );
            query_daily_activity_sums(connection, &sql, window.start(), None)?
        }
    };
    for (day, value) in rows {
        daily.insert(day, value);
    }
    materialize_buckets(bucket_days, &daily)
}

fn build_memora_buckets(
    connection: &rusqlite::Connection,
    bucket_days: &[String],
    window: &RangeWindow,
    now_utc: &str,
    deck_scope: Option<&str>,
) -> Result<Vec<ActivityBucket>> {
    let mut daily: HashMap<String, i64> = HashMap::new();

    // Practice activity per day. Deck-scoped: filter by context_kind/context_id.
    let deck_filter_practice = match deck_scope {
        Some(_) => "AND context_kind = 'deck' AND context_id = ?",
        None => "",
    };
    let practice_sql = format!(
        "SELECT local_day, COALESCE(SUM(raw_active_ms), 0)
         FROM activity_sessions
         WHERE activity_kind = 'practice' {deck_filter_practice} AND {window}
         GROUP BY local_day",
        deck_filter_practice = deck_filter_practice,
        window = activity_window_clause(window.start()),
    );
    for (day, value) in query_daily_activity_sums(connection, &practice_sql, window.start(), deck_scope)? {
        *daily.entry(day).or_insert(0) += value;
    }

    // Capped real-study time per day, scoped to deck if applicable.
    let (review_join, review_extra) = match deck_scope {
        Some(_) => (
            "JOIN cards ON cards.id = review_logs.card_id",
            "AND cards.deleted_at IS NULL AND cards.deck_id = ?",
        ),
        None => ("", ""),
    };
    let review_sql = format!(
        "SELECT reviewed_at, MIN(elapsed_ms, ?)
         FROM review_logs
         {review_join}
         WHERE {review_window} {review_extra}",
        review_join = review_join,
        review_window = review_window_clause(window.start()),
        review_extra = review_extra,
    );
    for (day, value) in query_daily_review_sums(connection, &review_sql, window, now_utc, deck_scope)? {
        *daily.entry(day).or_insert(0) += value;
    }

    materialize_buckets(bucket_days, &daily)
}

fn materialize_buckets(
    bucket_days: &[String],
    daily: &HashMap<String, i64>,
) -> Result<Vec<ActivityBucket>> {
    Ok(bucket_days
        .iter()
        .map(|day| ActivityBucket {
            local_day: day.clone(),
            active_ms: daily.get(day).copied().unwrap_or(0),
        })
        .collect())
}

fn query_daily_activity_sums(
    connection: &rusqlite::Connection,
    sql: &str,
    start: Option<&str>,
    deck_scope: Option<&str>,
) -> Result<Vec<(String, i64)>> {
    let mut stmt = connection.prepare(sql)?;
    let rows: Vec<(String, i64)> = match (start, deck_scope) {
        (Some(start_str), Some(deck_id)) => stmt
            .query_map(params![deck_id, today_upper_bound(), start_str], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?,
        (Some(start_str), None) => stmt
            .query_map(params![today_upper_bound(), start_str], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?,
        (None, Some(deck_id)) => stmt
            .query_map(params![deck_id, today_upper_bound()], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?,
        (None, None) => stmt
            .query_map(params![today_upper_bound()], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?,
    };
    Ok(rows)
}

fn query_daily_review_sums(
    connection: &rusqlite::Connection,
    sql: &str,
    window: &RangeWindow,
    now_utc: &str,
    deck_scope: Option<&str>,
) -> Result<Vec<(String, i64)>> {
    let start_utc = window.start_utc()?;
    let mut stmt = connection.prepare(sql)?;
    let extract = |row: &rusqlite::Row<'_>| -> rusqlite::Result<(String, i64)> {
        let reviewed_at: String = row.get(0)?;
        let total: i64 = row.get(1)?;
        let day = utc_timestamp_to_local_day(&reviewed_at).unwrap_or_else(|| reviewed_at.clone());
        Ok((day, total))
    };
    let rows: Vec<(String, i64)> = match (start_utc.as_deref(), deck_scope) {
        (Some(start), Some(deck)) => stmt
            .query_map(params![REVIEW_TIME_CAP_MS, now_utc, start, deck], extract)?
            .collect::<std::result::Result<Vec<_>, _>>()?,
        (Some(start), None) => stmt
            .query_map(params![REVIEW_TIME_CAP_MS, now_utc, start], extract)?
            .collect::<std::result::Result<Vec<_>, _>>()?,
        (None, Some(deck)) => stmt
            .query_map(params![REVIEW_TIME_CAP_MS, now_utc, deck], extract)?
            .collect::<std::result::Result<Vec<_>, _>>()?,
        (None, None) => stmt
            .query_map(params![REVIEW_TIME_CAP_MS, now_utc], extract)?
            .collect::<std::result::Result<Vec<_>, _>>()?,
    };
    Ok(rows)
}
