use std::collections::{HashMap, HashSet};
use std::fmt;

use chrono::{DateTime, Datelike, Duration, FixedOffset, NaiveDate, TimeZone, Timelike, Utc};
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
// Calendar period + response types
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PeriodUnit {
    Week,
    Month,
    Year,
}

impl PeriodUnit {
    pub fn parse(value: &str) -> Result<Self> {
        match value {
            "week" => Ok(Self::Week),
            "month" => Ok(Self::Month),
            "year" => Ok(Self::Year),
            _ => Err(StatisticsError::Validation("invalid period unit".into())),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StatisticsPeriod {
    pub unit: PeriodUnit,
    pub anchor_local_day: NaiveDate,
}

impl StatisticsPeriod {
    pub fn new(unit: PeriodUnit, anchor_local_day: &str) -> Result<Self> {
        let anchor_local_day = NaiveDate::parse_from_str(anchor_local_day, "%Y-%m-%d")
            .map_err(|_| StatisticsError::Validation("invalid anchorLocalDay".into()))?;
        Ok(Self { unit, anchor_local_day })
    }

    pub fn parse(unit: &str, anchor_local_day: &str) -> Result<Self> {
        Self::new(PeriodUnit::parse(unit)?, anchor_local_day)
    }

    pub fn window(&self) -> Result<CalendarWindow> {
        CalendarWindow::for_period(self.unit, self.anchor_local_day)
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CalendarWindow {
    pub start: NaiveDate,
    pub end_exclusive: NaiveDate,
    start_text: String,
    today: String,
}

impl CalendarWindow {
    fn boundary_error() -> StatisticsError {
        StatisticsError::Validation("statistics period is outside the supported date range".into())
    }

    fn for_period(unit: PeriodUnit, anchor: NaiveDate) -> Result<Self> {
        let start = match unit {
            PeriodUnit::Week => anchor.checked_sub_signed(Duration::days(anchor.weekday().num_days_from_monday() as i64)).ok_or_else(Self::boundary_error)?,
            PeriodUnit::Month => anchor.with_day(1).ok_or_else(Self::boundary_error)?,
            PeriodUnit::Year => anchor.with_month(1).and_then(|day| day.with_day(1)).ok_or_else(Self::boundary_error)?,
        };
        let end_exclusive = match unit {
            PeriodUnit::Week => start.checked_add_signed(Duration::days(7)).ok_or_else(Self::boundary_error)?,
            PeriodUnit::Month => if start.month() == 12 {
                NaiveDate::from_ymd_opt(start.year().checked_add(1).ok_or_else(Self::boundary_error)?, 1, 1).ok_or_else(Self::boundary_error)?
            } else {
                NaiveDate::from_ymd_opt(start.year(), start.month() + 1, 1).ok_or_else(Self::boundary_error)?
            },
            PeriodUnit::Year => NaiveDate::from_ymd_opt(start.year().checked_add(1).ok_or_else(Self::boundary_error)?, 1, 1).ok_or_else(Self::boundary_error)?,
        };
        Self::from_dates(start, end_exclusive)
    }

    fn from_dates(start: NaiveDate, end_exclusive: NaiveDate) -> Result<Self> {
        Ok(Self {
            start,
            end_exclusive,
            start_text: format_local_day(start),
            today: format_local_day(end_exclusive.checked_sub_signed(Duration::days(1)).ok_or_else(Self::boundary_error)?),
        })
    }

    pub fn previous(&self) -> Result<Self> {
        let unit = self.end_exclusive.signed_duration_since(self.start).num_days();
        if unit == 7 {
            Self::from_dates(self.start.checked_sub_signed(Duration::days(7)).ok_or_else(Self::boundary_error)?, self.start)
        } else if self.start.month() == 1 && self.start.day() == 1 && self.end_exclusive.month() == 1 && self.end_exclusive.day() == 1 {
            Self::from_dates(
                NaiveDate::from_ymd_opt(self.start.year().checked_sub(1).ok_or_else(Self::boundary_error)?, 1, 1).ok_or_else(Self::boundary_error)?,
                self.start,
            )
        } else {
            let previous_end = self.start;
            let previous_start = if previous_end.month() == 1 {
                NaiveDate::from_ymd_opt(previous_end.year().checked_sub(1).ok_or_else(Self::boundary_error)?, 12, 1).ok_or_else(Self::boundary_error)?
            } else {
                NaiveDate::from_ymd_opt(previous_end.year(), previous_end.month() - 1, 1).ok_or_else(Self::boundary_error)?
            };
            Self::from_dates(previous_start, previous_end)
        }
    }

    fn start(&self) -> Option<&str> { Some(&self.start_text) }

    fn bucket_days(&self, _connection: &rusqlite::Connection, _today_local_day: &str, _now_utc: &str) -> Result<Vec<String>> {
        enumerate_days(&self.start_text, &self.today)
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
    pub previous_active_ms: i64,
    pub previous_active_days: i64,
    pub buckets: Vec<ActivityBucket>,
    pub time_buckets: Vec<StatisticsTimeBucket>,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatisticsTimeBucket {
    pub local_day: String,
    pub bucket_start_hour: i64,
    pub app_key: String,
    pub active_ms: i64,
    pub is_future: bool,
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

fn validate_activity_context(
    app_key: &str,
    activity_kind: &str,
    context_kind: Option<&str>,
    context_id: Option<&str>,
) -> Result<()> {
    match (context_kind, context_id) {
        (None, None) => Ok(()),
        (Some(kind), Some(id)) if !id.trim().is_empty() => {
            let expected = match (app_key, activity_kind) {
                ("reading", "reading") => "document",
                ("memora", "practice") => "deck",
                _ => return Err(StatisticsError::Validation("unsupported activity context".into())),
            };
            if kind == expected {
                Ok(())
            } else {
                Err(StatisticsError::Validation(format!(
                    "invalid context kind for {app_key}/{activity_kind}: {kind}"
                )))
            }
        }
        _ => Err(StatisticsError::Validation(
            "context_kind and context_id must both be present or absent".into(),
        )),
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

#[derive(Debug, PartialEq)]
struct TimeBucketDelta {
    local_day: String,
    bucket_start_hour: i64,
    active_ms: i64,
}

fn split_active_segment(
    occurred_at: &str,
    active_ms: i64,
    timezone_offset_minutes: i64,
) -> Result<Vec<TimeBucketDelta>> {
    if active_ms == 0 {
        return Ok(Vec::new());
    }

    let end = DateTime::<FixedOffset>::parse_from_rfc3339(occurred_at).map_err(|_| {
        StatisticsError::Validation(format!("invalid RFC3339 timestamp: {occurred_at}"))
    })?;
    let offset_seconds = timezone_offset_minutes.checked_mul(60).ok_or_else(|| {
        StatisticsError::Validation("timezone offset is outside the supported range".into())
    })?;
    let offset_seconds = i32::try_from(offset_seconds).map_err(|_| {
        StatisticsError::Validation("timezone offset is outside the supported range".into())
    })?;
    let offset = FixedOffset::east_opt(offset_seconds).ok_or_else(|| {
        StatisticsError::Validation("timezone offset is outside the supported range".into())
    })?;
    let end = end.with_timezone(&Utc);
    let mut current = end.checked_sub_signed(Duration::milliseconds(active_ms)).ok_or_else(|| {
        StatisticsError::Validation("active segment is outside the supported timestamp range".into())
    })?;
    let mut deltas = Vec::new();
    let mut total_active_ms = 0_i64;

    while current < end {
        let local_current = current.with_timezone(&offset);
        let bucket_start_hour = i64::from((local_current.hour() / 4) * 4);
        let next_boundary_local = if bucket_start_hour == 20 {
            local_current.date_naive().succ_opt().and_then(|day| day.and_hms_opt(0, 0, 0))
        } else {
            local_current.date_naive().and_hms_opt((bucket_start_hour + 4) as u32, 0, 0)
        }
        .ok_or_else(|| {
            StatisticsError::Validation("active segment is outside the supported timestamp range".into())
        })?;
        let next_boundary = offset
            .from_local_datetime(&next_boundary_local)
            .single()
            .ok_or_else(|| StatisticsError::Validation(
                "active segment is outside the supported timestamp range".into(),
            ))?
            .with_timezone(&Utc);
        let segment_end = std::cmp::min(next_boundary, end);
        let bucket_active_ms = (segment_end - current).num_milliseconds();
        if bucket_active_ms <= 0 {
            return Err(StatisticsError::Validation(
                "unable to split active segment into time buckets".into(),
            ));
        }
        total_active_ms = total_active_ms.checked_add(bucket_active_ms).ok_or_else(|| {
            StatisticsError::Validation("active segment duration is outside the supported range".into())
        })?;
        deltas.push(TimeBucketDelta {
            local_day: local_current.date_naive().format("%F").to_string(),
            bucket_start_hour,
            active_ms: bucket_active_ms,
        });
        current = segment_end;
    }

    if total_active_ms != active_ms {
        return Err(StatisticsError::Validation(
            "active segment duration could not be conserved".into(),
        ));
    }

    Ok(deltas)
}

impl LibraryDatabase {
    pub fn start_activity_session(&mut self, session: NewActivitySession) -> Result<()> {
        validate_app_activity(&session.app_key, &session.activity_kind)?;
        validate_activity_context(
            &session.app_key,
            &session.activity_kind,
            session.context_kind.as_deref(),
            session.context_id.as_deref(),
        )?;
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
        let session = transaction
            .query_row(
                "SELECT app_key, activity_kind, context_kind, context_id, timezone_offset_minutes
                 FROM activity_sessions WHERE id = ?1",
                params![checkpoint.session_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, Option<String>>(2)?, row.get::<_, Option<String>>(3)?, row.get::<_, i64>(4)?)),
            )
            .optional()?;
        let Some((app_key, activity_kind, context_kind, context_id, timezone_offset_minutes)) = session else {
            // Dropping the transaction rolls back any pending writes (none yet here,
            // but this guard keeps the invariant explicit).
            return Err(StatisticsError::SessionNotFound);
        };

        match (checkpoint.document_id.as_deref(), checkpoint.page) {
            (None, None) if checkpoint.page_visit_increment == 0 => {}
            (Some(document_id), Some(_))
                if app_key == "reading"
                    && activity_kind == "reading"
                    && context_kind.as_deref() == Some("document")
                    && context_id.as_deref() == Some(document_id) => {}
            (None, None) => {
                return Err(StatisticsError::Validation(
                    "page_visit_increment requires document_id and page".into(),
                ));
            }
            _ => {
                return Err(StatisticsError::Validation(
                    "page checkpoint must match its reading document session".into(),
                ));
            }
        }

        let bucket_deltas = split_active_segment(
            &checkpoint.occurred_at,
            checkpoint.active_ms,
            timezone_offset_minutes,
        )?;

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

        for delta in bucket_deltas {
            transaction.execute(
                "INSERT INTO activity_session_time_buckets(
                    session_id, local_day, bucket_start_hour, raw_active_ms
                 ) VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(session_id, local_day, bucket_start_hour) DO UPDATE SET
                    raw_active_ms = raw_active_ms + excluded.raw_active_ms",
                params![
                    checkpoint.session_id,
                    delta.local_day,
                    delta.bucket_start_hour,
                    delta.active_ms,
                ],
            )?;
        }

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
        period: &StatisticsPeriod,
        now_utc: &str,
        today_local_day: &str,
    ) -> Result<StatisticsOverview> {
        let window = period.window()?;
        let reading_active = query_window_activity_ms(&self.connection, "reading", &window)?;
        let practice_active = query_window_activity_ms(&self.connection, "practice", &window)?;
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

        let previous = window.previous()?;
        let previous_reading = query_window_activity_ms(&self.connection, "reading", &previous)?;
        let previous_practice = query_window_activity_ms(&self.connection, "practice", &previous)?;
        let previous_real = query_capped_review_ms(&self.connection, &previous, now_utc, ReviewScope::All)?;
        let previous_active_ms = previous_reading + previous_practice + previous_real;
        let previous_active_days = count_active_days_in_window(&lifetime_active_days, &previous);
        let time_buckets = build_time_buckets(&self.connection, &window, today_local_day)?;

        Ok(StatisticsOverview {
            active_ms,
            reading_active_ms: reading_active,
            memora_active_ms: memora_active,
            current_streak,
            active_days,
            previous_active_ms,
            previous_active_days,
            buckets,
            time_buckets,
        })
    }

    pub fn reading_statistics(
        &self,
        period: &StatisticsPeriod,
        now_utc: &str,
        today_local_day: &str,
    ) -> Result<ReadingStatistics> {
        let window = period.window()?;
        let active_ms =
            query_activity_active_ms(&self.connection, "reading", &window, None)?;
        let session_count =
            query_activity_session_count(&self.connection, "reading", &window)?;
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
        period: &StatisticsPeriod,
        now_utc: &str,
        today_local_day: &str,
    ) -> Result<DocumentStatistics> {
        let window = period.window()?;
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
        period: &StatisticsPeriod,
        now_utc: &str,
        today_local_day: &str,
    ) -> Result<MemoraStatistics> {
        let window = period.window()?;
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
        period: &StatisticsPeriod,
        now_utc: &str,
        today_local_day: &str,
    ) -> Result<DeckStatisticsDetail> {
        let window = period.window()?;
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
// Calendar window + scope helpers
// ---------------------------------------------------------------------------

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
    window: &CalendarWindow,
    now_utc: &str,
    today_local_day: &str,
    deck_scope: Option<&str>,
) -> Result<MemoraBody> {
    let scope = match deck_scope {
        Some(id) => ReviewScope::Deck(id),
        None => ReviewScope::All,
    };

    let practice_active_ms = query_activity_active_ms(connection, "practice", window, deck_scope)?;
    let real_ms = query_capped_review_ms(connection, window, now_utc, scope)?;
    let active_ms = real_ms + practice_active_ms;

    let real_session_count = query_real_study_session_count(connection, window, deck_scope)?;
    let practice_session_count = query_practice_session_count(connection, window, deck_scope)?;
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

fn parse_utc_timestamp(value: &str) -> Result<DateTime<Utc>> {
    DateTime::<FixedOffset>::parse_from_rfc3339(value)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|_| StatisticsError::Validation(format!("invalid RFC3339 timestamp: {value}")))
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

// Daily bucket builders materialize only the calendar window's enumerated
// days. Their existing query utility keeps this compatible with the
// zero-filling path; aggregate metrics use the strict helpers below.
fn activity_window_clause(start: Option<&str>) -> &'static str {
    if start.is_some() {
        "local_day <= ? AND local_day >= ?"
    } else {
        "local_day <= ?"
    }
}

fn query_activity_active_ms(
    connection: &rusqlite::Connection,
    activity_kind: &str,
    window: &CalendarWindow,
    deck_scope: Option<&str>,
) -> Result<i64> {
    let deck_clause = match (activity_kind, deck_scope) {
        ("practice", Some(_)) => "AND context_kind = 'deck' AND context_id = ?4",
        _ => "",
    };
    let sql = format!(
        "SELECT COALESCE(SUM(raw_active_ms), 0) FROM activity_sessions
         WHERE activity_kind = ?1 AND local_day >= ?2 AND local_day < ?3 {deck_clause}",
        deck_clause = deck_clause,
    );
    Ok(match deck_scope {
        Some(deck) => connection.query_row(&sql, params![activity_kind, format_local_day(window.start), format_local_day(window.end_exclusive), deck], |row| row.get(0))?,
        None => connection.query_row(&sql, params![activity_kind, format_local_day(window.start), format_local_day(window.end_exclusive)], |row| row.get(0))?,
    })
}

fn query_window_activity_ms(
    connection: &rusqlite::Connection,
    activity_kind: &str,
    window: &CalendarWindow,
) -> Result<i64> {
    Ok(connection.query_row(
        "SELECT COALESCE(SUM(raw_active_ms), 0) FROM activity_sessions
         WHERE activity_kind = ?1 AND local_day >= ?2 AND local_day < ?3",
        params![activity_kind, format_local_day(window.start), format_local_day(window.end_exclusive)],
        |row| row.get(0),
    )?)
}

fn query_activity_session_count(
    connection: &rusqlite::Connection,
    activity_kind: &str,
    window: &CalendarWindow,
) -> Result<i64> {
    Ok(connection.query_row(
        "SELECT COUNT(*) FROM activity_sessions WHERE activity_kind = ?1 AND local_day >= ?2 AND local_day < ?3",
        params![activity_kind, format_local_day(window.start), format_local_day(window.end_exclusive)],
        |row| row.get(0),
    )?)
}

fn query_practice_session_count(
    connection: &rusqlite::Connection,
    window: &CalendarWindow,
    deck_scope: Option<&str>,
) -> Result<i64> {
    let deck_clause = match deck_scope {
        Some(_) => "AND context_kind = 'deck' AND context_id = ?3",
        None => "",
    };
    let sql = format!(
        "SELECT COUNT(*) FROM activity_sessions
         WHERE activity_kind = 'practice'
           AND raw_active_ms > 0
           {deck_clause}
           AND local_day >= ?1 AND local_day < ?2",
        deck_clause = deck_clause,
    );
    Ok(match deck_scope {
        Some(deck) => connection.query_row(&sql, params![format_local_day(window.start), format_local_day(window.end_exclusive), deck], |row| row.get(0))?,
        None => connection.query_row(&sql, params![format_local_day(window.start), format_local_day(window.end_exclusive)], |row| row.get(0))?,
    })
}

struct PageMetrics {
    page_visits: i64,
    unique_pages: i64,
    revisits: i64,
}

fn query_reading_page_metrics(
    connection: &rusqlite::Connection,
    window: &CalendarWindow,
    document_id: Option<&str>,
) -> Result<PageMetrics> {
    let document_clause = match document_id {
        Some(_) => "AND reading_session_pages.document_id = ?3",
        None => "",
    };
    let sql = format!(
        "SELECT COALESCE(SUM(visit_count), 0), COUNT(DISTINCT page)
         FROM reading_session_pages
         JOIN activity_sessions ON activity_sessions.id = reading_session_pages.session_id
         WHERE activity_sessions.local_day >= ?1 AND activity_sessions.local_day < ?2 {document_clause}",
        document_clause = document_clause,
    );
    let (page_visits, unique_pages): (i64, i64) = match document_id {
        Some(id) => connection.query_row(&sql, params![format_local_day(window.start), format_local_day(window.end_exclusive), id], |row| Ok((row.get(0)?, row.get(1)?)))?,
        None => connection.query_row(&sql, params![format_local_day(window.start), format_local_day(window.end_exclusive)], |row| Ok((row.get(0)?, row.get(1)?)))?,
    };
    Ok(PageMetrics {
        page_visits,
        unique_pages,
        revisits: page_visits - unique_pages,
    })
}

fn query_document_session_count(
    connection: &rusqlite::Connection,
    window: &CalendarWindow,
    document_id: &str,
) -> Result<i64> {
    let sql =
        "SELECT COUNT(DISTINCT reading_session_pages.session_id)
         FROM reading_session_pages
         JOIN activity_sessions ON activity_sessions.id = reading_session_pages.session_id
         WHERE reading_session_pages.document_id = ?1
           AND activity_sessions.local_day >= ?2 AND activity_sessions.local_day < ?3";
    Ok(connection.query_row(sql, params![document_id, format_local_day(window.start), format_local_day(window.end_exclusive)], |row| row.get(0))?)
}

fn query_document_active_ms(
    connection: &rusqlite::Connection,
    window: &CalendarWindow,
    document_id: &str,
) -> Result<i64> {
    let sql =
        "SELECT COALESCE(SUM(reading_session_pages.raw_active_ms), 0)
         FROM reading_session_pages
         JOIN activity_sessions ON activity_sessions.id = reading_session_pages.session_id
         WHERE reading_session_pages.document_id = ?1
           AND activity_sessions.local_day >= ?2 AND activity_sessions.local_day < ?3";
    Ok(connection.query_row(sql, params![document_id, format_local_day(window.start), format_local_day(window.end_exclusive)], |row| row.get(0))?)
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
        "COALESCE(NULLIF(review_logs.local_day, ''), substr(review_logs.reviewed_at, 1, 10)) <= ? AND COALESCE(NULLIF(review_logs.local_day, ''), substr(review_logs.reviewed_at, 1, 10)) >= ?"
    } else {
        "COALESCE(NULLIF(review_logs.local_day, ''), substr(review_logs.reviewed_at, 1, 10)) <= ?"
    }
}

fn collect_review_rows(
    connection: &rusqlite::Connection,
    window: &CalendarWindow,
    _now_utc: &str,
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
    let mut stmt = connection.prepare(&sql)?;
    let review_map = |row: &rusqlite::Row<'_>| {
        Ok(ReviewRow {
            rating: row.get(0)?,
            prior_state: row.get(1)?,
            elapsed_ms: row.get(2)?,
        })
    };
    let rows = match (scope.bind_value(), window.start()) {
        (Some(value), Some(start)) => stmt
            .query_map(params![window.today, start, value], review_map)?
            .collect::<std::result::Result<Vec<_>, _>>()?,
        (Some(value), None) => stmt
            .query_map(params![window.today, value], review_map)?
            .collect::<std::result::Result<Vec<_>, _>>()?,
        (None, Some(start)) => stmt
            .query_map(params![window.today, start], review_map)?
            .collect::<std::result::Result<Vec<_>, _>>()?,
        (None, None) => stmt
            .query_map(params![window.today], review_map)?
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
    window: &CalendarWindow,
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
    window: &CalendarWindow,
    now_utc: &str,
    scope: ReviewScope,
) -> Result<i64> {
    Ok(collect_review_rows(connection, window, now_utc, scope)?.len() as i64)
}

fn query_rating_distribution(
    connection: &rusqlite::Connection,
    window: &CalendarWindow,
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
    window: &CalendarWindow,
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
    window: &CalendarWindow,
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
    window: &CalendarWindow,
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
    window: &CalendarWindow,
    deck_scope: Option<&str>,
) -> Result<i64> {
    let scope_clause = match deck_scope {
        Some(_) => "AND study_sessions.deck_id = ?",
        None => "",
    };
    let start_clause = if window.start().is_some() {
        "AND COALESCE(NULLIF(review_logs.local_day, ''), substr(review_logs.reviewed_at, 1, 10)) >= ?"
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
         JOIN review_logs
           ON review_logs.id = study_session_cards.review_log_id
         WHERE study_session_cards.consumed_at IS NOT NULL
           AND study_session_cards.review_log_id IS NOT NULL
           AND COALESCE(NULLIF(review_logs.local_day, ''), substr(review_logs.reviewed_at, 1, 10)) <= ?
           {start_clause}
           {scope_clause}",
        start_clause = start_clause,
        scope_clause = scope_clause,
    );
    let count: i64 = match (deck_scope, window.start()) {
        (Some(deck), Some(start)) => {
            connection.query_row(&sql, params![window.today, start, deck], |row| row.get(0))?
        }
        (Some(deck), None) => connection.query_row(&sql, params![window.today, deck], |row| row.get(0))?,
        (None, Some(start)) => connection.query_row(&sql, params![window.today, start], |row| row.get(0))?,
        (None, None) => connection.query_row(&sql, params![window.today], |row| row.get(0))?,
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
    _now_utc: &str,
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

    let mut review_stmt = connection.prepare(
        "SELECT DISTINCT COALESCE(NULLIF(local_day, ''), substr(reviewed_at, 1, 10))
         FROM review_logs
         WHERE COALESCE(NULLIF(local_day, ''), substr(reviewed_at, 1, 10)) <= ?1",
    )?;
    let review_rows: Vec<String> = review_stmt
        .query_map(params![today_local_day], |row| row.get(0))?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    for day in review_rows {
        days.insert(day);
    }

    Ok(days)
}

fn count_active_days_in_window(days: &HashSet<String>, window: &CalendarWindow) -> i64 {
    let start_date = window.start().expect("calendar windows have a start");
    days.iter()
        .filter(|day| day.as_str() >= start_date && day.as_str() <= window.today.as_str())
        .count() as i64
}

fn query_deck_active_days(
    connection: &rusqlite::Connection,
    window: &CalendarWindow,
    deck_id: &str,
) -> Result<i64> {
    // Deck-scoped active days combine: any review log on a card in this deck,
    // or 60s+ practice activity scoped to this deck. Reading activity does
    // not contribute to a deck's active-day count.
    let mut days: HashSet<String> = HashSet::new();

    let mut review_stmt = connection.prepare(
        "SELECT DISTINCT COALESCE(NULLIF(review_logs.local_day, ''), substr(review_logs.reviewed_at, 1, 10)) AS day
         FROM review_logs
         JOIN cards ON cards.id = review_logs.card_id
         WHERE cards.deck_id = ?1
           AND COALESCE(NULLIF(review_logs.local_day, ''), substr(review_logs.reviewed_at, 1, 10)) <= ?2",
    )?;
    let review_rows: Vec<String> = review_stmt
        .query_map(params![deck_id, window.today], |row| row.get(0))?
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

    let start_date = window.start().expect("calendar windows have a start");
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

// ---------------------------------------------------------------------------
// Bucket builders
// ---------------------------------------------------------------------------

fn build_total_buckets(
    connection: &rusqlite::Connection,
    bucket_days: &[String],
    window: &CalendarWindow,
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
        "SELECT COALESCE(NULLIF(review_logs.local_day, ''), substr(review_logs.reviewed_at, 1, 10)), MIN(elapsed_ms, ?)
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
    window: &CalendarWindow,
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
    window: &CalendarWindow,
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
        "SELECT COALESCE(NULLIF(review_logs.local_day, ''), substr(review_logs.reviewed_at, 1, 10)), MIN(elapsed_ms, ?)
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

fn build_time_buckets(
    connection: &rusqlite::Connection,
    window: &CalendarWindow,
    today_local_day: &str,
) -> Result<Vec<StatisticsTimeBucket>> {
    let mut values: HashMap<(String, i64, String), i64> = HashMap::new();
    let mut statement = connection.prepare(
        "SELECT buckets.local_day, buckets.bucket_start_hour, sessions.app_key,
                COALESCE(SUM(buckets.raw_active_ms), 0)
         FROM activity_session_time_buckets buckets
         JOIN activity_sessions sessions ON sessions.id = buckets.session_id
         WHERE buckets.local_day >= ?1 AND buckets.local_day < ?2
           AND ((sessions.app_key = 'reading' AND sessions.activity_kind = 'reading')
             OR (sessions.app_key = 'memora' AND sessions.activity_kind = 'practice'))
         GROUP BY buckets.local_day, buckets.bucket_start_hour, sessions.app_key",
    )?;
    let rows = statement.query_map(params![format_local_day(window.start), format_local_day(window.end_exclusive)], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?, row.get::<_, String>(2)?, row.get::<_, i64>(3)?))
    })?;
    for row in rows {
        let (day, hour, app_key, active_ms) = row?;
        values.insert((day, hour, app_key), active_ms);
    }
    let mut review_statement = connection.prepare(
        "SELECT COALESCE(NULLIF(local_day, ''), substr(reviewed_at, 1, 10)),
                (local_minute_of_day / 240) * 4, COALESCE(SUM(MIN(elapsed_ms, ?3)), 0)
         FROM review_logs
         WHERE COALESCE(NULLIF(local_day, ''), substr(reviewed_at, 1, 10)) >= ?1
           AND COALESCE(NULLIF(local_day, ''), substr(reviewed_at, 1, 10)) < ?2
         GROUP BY 1, 2",
    )?;
    let review_rows = review_statement.query_map(
        params![format_local_day(window.start), format_local_day(window.end_exclusive), REVIEW_TIME_CAP_MS],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?, row.get::<_, i64>(2)?)),
    )?;
    for row in review_rows {
        let (day, hour, active_ms) = row?;
        *values.entry((day, hour, "memora".into())).or_insert(0) += active_ms;
    }

    let mut buckets = Vec::new();
    for day in enumerate_days(&format_local_day(window.start), &window.today)? {
        let is_future = day.as_str() > today_local_day;
        for bucket_start_hour in [0, 4, 8, 12, 16, 20] {
            for app_key in ["reading", "memora"] {
                buckets.push(StatisticsTimeBucket {
                    active_ms: if is_future { 0 } else { values.get(&(day.clone(), bucket_start_hour, app_key.into())).copied().unwrap_or(0) },
                    local_day: day.clone(),
                    bucket_start_hour,
                    app_key: app_key.into(),
                    is_future,
                });
            }
        }
    }
    Ok(buckets)
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
    window: &CalendarWindow,
    _now_utc: &str,
    deck_scope: Option<&str>,
) -> Result<Vec<(String, i64)>> {
    let mut stmt = connection.prepare(sql)?;
    let extract = |row: &rusqlite::Row<'_>| -> rusqlite::Result<(String, i64)> {
        let local_day: String = row.get(0)?;
        let total: i64 = row.get(1)?;
        Ok((local_day, total))
    };
    let rows: Vec<(String, i64)> = match (window.start(), deck_scope) {
        (Some(start), Some(deck)) => stmt
            .query_map(params![REVIEW_TIME_CAP_MS, window.today, start, deck], extract)?
            .collect::<std::result::Result<Vec<_>, _>>()?,
        (Some(start), None) => stmt
            .query_map(params![REVIEW_TIME_CAP_MS, window.today, start], extract)?
            .collect::<std::result::Result<Vec<_>, _>>()?,
        (None, Some(deck)) => stmt
            .query_map(params![REVIEW_TIME_CAP_MS, window.today, deck], extract)?
            .collect::<std::result::Result<Vec<_>, _>>()?,
        (None, None) => stmt
            .query_map(params![REVIEW_TIME_CAP_MS, window.today], extract)?
            .collect::<std::result::Result<Vec<_>, _>>()?,
    };
    Ok(rows)
}

// ---------------------------------------------------------------------------
// Daily snapshot queries (consent-bounded, numeric-only fields)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailySnapshotQuery {
    pub consent_started_at: String,
    pub from_local_day: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyStatisticsSnapshot {
    pub schema_version: i64,
    pub local_day: String,
    pub app_key: String,
    pub active_ms: i64,
    pub active_day: bool,
    pub session_count: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_visit_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unique_page_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub real_review_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub again_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hard_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub good_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub easy_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lapse_count: Option<i64>,
}

pub fn get_daily_statistics_snapshots(
    conn: &rusqlite::Connection,
    query: &DailySnapshotQuery,
) -> Result<Vec<DailyStatisticsSnapshot>> {
    let mut snapshots: Vec<DailyStatisticsSnapshot> = Vec::new();

    // Reading snapshots: aggregate by local_day from activity_sessions +
    // reading_session_pages. Only numeric fields are exposed — no IDs, pages,
    // titles, or text content.
    // Use CTEs to avoid duplication from the LEFT JOIN on pages.
    let reading_sql = "
        WITH session_agg AS (
            SELECT local_day,
                   SUM(raw_active_ms) AS active_ms,
                   COUNT(DISTINCT id) AS session_count
            FROM activity_sessions
            WHERE app_key = 'reading'
              AND local_day >= ?1
              AND local_day <= ?2
              AND started_at >= ?3
            GROUP BY local_day
        ),
        page_agg AS (
            SELECT a.local_day,
                   COALESCE(SUM(p.visit_count), 0) AS page_visits,
                   COUNT(DISTINCT p.page) AS unique_pages
            FROM reading_session_pages p
            JOIN activity_sessions a ON a.id = p.session_id
            WHERE a.app_key = 'reading'
              AND a.local_day >= ?1
              AND a.local_day <= ?2
              AND a.started_at >= ?3
            GROUP BY a.local_day
        )
        SELECT s.local_day, s.active_ms, s.session_count,
               COALESCE(p.page_visits, 0), COALESCE(p.unique_pages, 0)
        FROM session_agg s
        LEFT JOIN page_agg p ON p.local_day = s.local_day
        ORDER BY s.local_day
    ";
    {
        let mut stmt = conn.prepare(reading_sql)?;
        let rows = stmt
            .query_map(params![query.from_local_day, today_upper_bound(), query.consent_started_at], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, i64>(4)?,
                ))
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        for (local_day, active_ms, session_count, page_visits, unique_pages) in rows {
            snapshots.push(DailyStatisticsSnapshot {
                schema_version: 1,
                local_day,
                app_key: "reading".to_string(),
                active_ms,
                active_day: active_ms >= ACTIVE_DAY_THRESHOLD_MS,
                session_count,
                page_visit_count: Some(page_visits),
                unique_page_count: Some(unique_pages),
                real_review_count: None,
                again_count: None,
                hard_count: None,
                good_count: None,
                easy_count: None,
                lapse_count: None,
            });
        }
    }

    // Practice contributes both active time and sessions. Sessions with no
    // acknowledged active time are not learning sessions.
    let practice_sql = "
        SELECT local_day,
               COALESCE(SUM(raw_active_ms), 0),
               COUNT(DISTINCT CASE WHEN raw_active_ms > 0 THEN id END)
        FROM activity_sessions
        WHERE activity_kind = 'practice'
          AND local_day >= ?1
          AND local_day <= ?2
          AND started_at >= ?3
        GROUP BY local_day
    ";
    let mut practice_by_day: HashMap<String, (i64, i64)> = HashMap::new();
    {
        let mut stmt = conn.prepare(practice_sql)?;
        let rows = stmt
            .query_map(params![query.from_local_day, today_upper_bound(), query.consent_started_at], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        for (day, active_ms, count) in rows {
            practice_by_day.insert(day, (active_ms, count));
        }
    }

    // Real reviews use the local day captured at rating time. The fallback is
    // only for pre-migration development rows.
    let memora_sql = "
        SELECT COALESCE(NULLIF(review_logs.local_day, ''), substr(reviewed_at, 1, 10)) as review_day,
               COUNT(*),
               SUM(MIN(elapsed_ms, ?1)),
               SUM(CASE WHEN rating = 'again' THEN 1 ELSE 0 END),
               SUM(CASE WHEN rating = 'hard' THEN 1 ELSE 0 END),
               SUM(CASE WHEN rating = 'good' THEN 1 ELSE 0 END),
               SUM(CASE WHEN rating = 'easy' THEN 1 ELSE 0 END),
               SUM(CASE WHEN prior_state = 'review' AND rating = 'again' THEN 1 ELSE 0 END),
               COUNT(DISTINCT study_session_cards.session_id)
        FROM review_logs
        LEFT JOIN study_session_cards
          ON study_session_cards.review_log_id = review_logs.id
        WHERE reviewed_at >= ?2
          AND reviewed_at <= ?3
          AND COALESCE(NULLIF(review_logs.local_day, ''), substr(reviewed_at, 1, 10)) >= ?4
        GROUP BY review_day
        ORDER BY review_day
    ";
    #[derive(Clone, Copy, Default)]
    struct ReviewDayAggregate {
        review_count: i64,
        active_ms: i64,
        again: i64,
        hard: i64,
        good: i64,
        easy: i64,
        lapses: i64,
        session_count: i64,
    }
    let mut reviews_by_day: HashMap<String, ReviewDayAggregate> = HashMap::new();
    {
        let now_utc = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        let mut stmt = conn.prepare(memora_sql)?;
        let rows = stmt
            .query_map(
                params![REVIEW_TIME_CAP_MS, query.consent_started_at, now_utc, query.from_local_day],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, i64>(2)?,
                        row.get::<_, i64>(3)?,
                        row.get::<_, i64>(4)?,
                        row.get::<_, i64>(5)?,
                        row.get::<_, i64>(6)?,
                        row.get::<_, i64>(7)?,
                        row.get::<_, i64>(8)?,
                    ))
                },
            )?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        for (day, review_count, active_ms, again, hard, good, easy, lapses, session_count) in rows {
            reviews_by_day.insert(
                day,
                ReviewDayAggregate {
                    review_count,
                    active_ms,
                    again,
                    hard,
                    good,
                    easy,
                    lapses,
                    session_count,
                },
            );
        }
    }

    let mut memora_days: Vec<String> = practice_by_day
        .keys()
        .chain(reviews_by_day.keys())
        .cloned()
        .collect();
    memora_days.sort();
    memora_days.dedup();
    for local_day in memora_days {
        let (practice_ms, practice_sessions) =
            practice_by_day.get(&local_day).copied().unwrap_or((0, 0));
        let reviews = reviews_by_day.get(&local_day).copied().unwrap_or_default();
        let active_ms = practice_ms + reviews.active_ms;
        snapshots.push(DailyStatisticsSnapshot {
            schema_version: 1,
            local_day,
            app_key: "memora".to_string(),
            active_ms,
            active_day: active_ms >= ACTIVE_DAY_THRESHOLD_MS || reviews.review_count > 0,
            session_count: practice_sessions + reviews.session_count,
            page_visit_count: None,
            unique_page_count: None,
            real_review_count: Some(reviews.review_count),
            again_count: Some(reviews.again),
            hard_count: Some(reviews.hard),
            good_count: Some(reviews.good),
            easy_count: Some(reviews.easy),
            lapse_count: Some(reviews.lapses),
        });
    }

    snapshots.sort_by(|a, b| a.local_day.cmp(&b.local_day).then(a.app_key.cmp(&b.app_key)));
    Ok(snapshots)
}
