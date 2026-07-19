# Statistics Calendar Time Buckets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist local four-hour activity buckets and expose calendar Week/Month/Year personal-statistics queries with previous-period comparisons.

**Architecture:** SQLite stores small local-only time buckets at activity checkpoint time and one local minute value per real Memora review. Rust owns timezone-aware splitting, calendar boundaries, zero filling, and aggregation; the TypeScript bridge sends one typed calendar-period object. Existing daily analytics snapshots and Admin Analytics payloads remain unchanged.

**Tech Stack:** SQLite migrations, Rust, rusqlite, chrono, Tauri commands, TypeScript, Vitest.

**Design:** `docs/superpowers/specs/2026-07-19-statistics-dashboard-visual-refresh-design.md`

---

## File map

- Create `apps/desktop/src-tauri/migrations/0013_statistics_time_buckets.sql` for local time-of-day persistence.
- Modify `apps/desktop/src-tauri/src/library_db.rs` to register migration 0013.
- Modify `apps/desktop/src-tauri/src/statistics.rs` to split checkpoints, define calendar windows, and aggregate heatmap buckets.
- Modify `apps/desktop/src-tauri/src/statistics_tests.rs` with deterministic migration, splitting, period, and aggregation tests.
- Modify `apps/desktop/src-tauri/src/study_queue.rs` to persist a validated local minute for real reviews.
- Modify `apps/desktop/src-tauri/src/study_queue_tests.rs` and `apps/desktop/src-tauri/src/commands_tests.rs` for review persistence.
- Modify `apps/desktop/src-tauri/src/commands.rs` to accept personal periods and record the current local minute.
- Modify `apps/desktop/src/domain/statistics.ts` with period and time-bucket contracts.
- Modify `apps/desktop/src/lib/statistics.ts` and `apps/desktop/src/lib/statistics.test.ts` with the nested Tauri input contract.

## Task 1: Add local time-bucket persistence

**Files:**
- Create: `apps/desktop/src-tauri/migrations/0013_statistics_time_buckets.sql`
- Modify: `apps/desktop/src-tauri/src/library_db.rs`
- Test: `apps/desktop/src-tauri/src/statistics_tests.rs`

- [ ] **Step 1: Write the failing migration test**

Add this focused test beside the existing migration assertions:

```rust
#[test]
fn statistics_time_bucket_migration_creates_local_only_storage() {
    let (_directory, database) = db();
    let migration: String = database.connection.query_row(
        "SELECT id FROM schema_migrations WHERE id='0013_statistics_time_buckets'",
        [],
        |row| row.get(0),
    ).expect("time bucket migration");
    assert_eq!(migration, "0013_statistics_time_buckets");

    let table_count: i64 = database.connection.query_row(
        "SELECT COUNT(*) FROM sqlite_master
         WHERE type='table' AND name='activity_session_time_buckets'",
        [],
        |row| row.get(0),
    ).expect("time bucket table");
    assert_eq!(table_count, 1);

    let minute_column_count: i64 = database.connection.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('review_logs')
         WHERE name='local_minute_of_day'",
        [],
        |row| row.get(0),
    ).expect("review local minute column");
    assert_eq!(minute_column_count, 1);
}
```

- [ ] **Step 2: Run the migration test and verify RED**

Run:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml statistics_time_bucket_migration_creates_local_only_storage
```

Expected: FAIL because migration `0013_statistics_time_buckets` and its table/column do not exist.

- [ ] **Step 3: Add migration 0013 and register it**

Create exactly:

```sql
CREATE TABLE activity_session_time_buckets (
  session_id TEXT NOT NULL REFERENCES activity_sessions(id) ON DELETE CASCADE,
  local_day TEXT NOT NULL,
  bucket_start_hour INTEGER NOT NULL
    CHECK (bucket_start_hour IN (0, 4, 8, 12, 16, 20)),
  raw_active_ms INTEGER NOT NULL DEFAULT 0 CHECK (raw_active_ms >= 0),
  PRIMARY KEY (session_id, local_day, bucket_start_hour)
);

CREATE INDEX activity_session_time_buckets_day
  ON activity_session_time_buckets(local_day, bucket_start_hour);

ALTER TABLE review_logs
  ADD COLUMN local_minute_of_day INTEGER NOT NULL DEFAULT 0
  CHECK (local_minute_of_day >= 0 AND local_minute_of_day < 1440);
```

Increase the `MIGRATIONS` array length from 12 to 13 in `library_db.rs` and append:

```rust
(
    "0013_statistics_time_buckets",
    include_str!("../migrations/0013_statistics_time_buckets.sql"),
),
```

- [ ] **Step 4: Verify GREEN and upgrade safety**

Run:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml statistics_time_bucket_migration_creates_local_only_storage
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml library_db_tests
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/migrations/0013_statistics_time_buckets.sql apps/desktop/src-tauri/src/library_db.rs apps/desktop/src-tauri/src/statistics_tests.rs
git commit -m "feat: add local statistics time buckets"
```

## Task 2: Split Reading and Practice checkpoints into four-hour buckets

**Files:**
- Modify: `apps/desktop/src-tauri/src/statistics.rs`
- Test: `apps/desktop/src-tauri/src/statistics_tests.rs`

- [ ] **Step 1: Write failing checkpoint-splitting tests**

Create one session with `timezone_offset_minutes: 0`, then checkpoint a ten-minute segment ending at 04:05 UTC:

```rust
#[test]
fn checkpoint_splits_active_time_across_four_hour_boundaries() {
    let (_directory, mut database) = db();
    database.start_activity_session(NewActivitySession {
        id: "split-session".into(),
        app_key: "reading".into(),
        activity_kind: "reading".into(),
        context_kind: None,
        context_id: None,
        occurred_at: "2026-07-19T03:55:00.000Z".into(),
        local_day: "2026-07-19".into(),
        timezone_offset_minutes: 0,
    }).expect("start");
    database.checkpoint_activity_session(ActivityCheckpoint {
        session_id: "split-session".into(),
        occurred_at: "2026-07-19T04:05:00.000Z".into(),
        active_ms: 600_000,
        document_id: None,
        page: None,
        page_visit_increment: 0,
    }).expect("checkpoint");

    let rows: Vec<(String, i64, i64)> = database.connection.prepare(
        "SELECT local_day,bucket_start_hour,raw_active_ms
         FROM activity_session_time_buckets
         WHERE session_id='split-session'
         ORDER BY local_day,bucket_start_hour",
    ).unwrap().query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
      .unwrap().map(Result::unwrap).collect();
    assert_eq!(rows, vec![
        ("2026-07-19".into(), 0, 300_000),
        ("2026-07-19".into(), 4, 300_000),
    ]);
}
```

Add a second test with `timezone_offset_minutes: -540` and a segment crossing local midnight; assert the rows use the two correct local dates. Add an idempotency test that a rejected page checkpoint inserts no time buckets.

- [ ] **Step 2: Run the focused tests and verify RED**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml checkpoint_splits_active_time_across_four_hour_boundaries
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml checkpoint_time_buckets_use_session_timezone_offset
```

Expected: FAIL because checkpointing does not write `activity_session_time_buckets`.

- [ ] **Step 3: Implement deterministic segment splitting**

Add a private value type and helper in `statistics.rs`:

```rust
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
    let end = DateTime::parse_from_rfc3339(occurred_at)
        .map_err(|_| StatisticsError::Validation("invalid occurred_at".into()))?
        .with_timezone(&Utc);
    let start = end - chrono::Duration::milliseconds(active_ms);
    let offset = chrono::FixedOffset::west_opt(
        i32::try_from(timezone_offset_minutes * 60)
            .map_err(|_| StatisticsError::Validation("invalid timezone offset".into()))?,
    ).ok_or_else(|| StatisticsError::Validation("invalid timezone offset".into()))?;

    let mut cursor = start;
    let mut deltas = Vec::new();
    while cursor < end {
        let local = cursor.with_timezone(&offset);
        let bucket_hour = i64::from((local.hour() / 4) * 4);
        let next_local = local.date_naive()
            .and_hms_opt((bucket_hour as u32) + 4, 0, 0)
            .unwrap_or_else(|| (local.date_naive() + chrono::Days::new(1)).and_hms_opt(0, 0, 0).unwrap());
        let boundary = next_local.and_local_timezone(offset).single().unwrap().with_timezone(&Utc);
        let segment_end = std::cmp::min(boundary, end);
        deltas.push(TimeBucketDelta {
            local_day: local.date_naive().to_string(),
            bucket_start_hour: bucket_hour,
            active_ms: (segment_end - cursor).num_milliseconds(),
        });
        cursor = segment_end;
    }
    Ok(deltas)
}
```

Import `chrono::{DateTime, Timelike, Utc}`. In `checkpoint_activity_session`, include `timezone_offset_minutes` in the existing session query. After all checkpoint validation and before commit, upsert every delta inside the same transaction:

```rust
for delta in split_active_segment(
    &checkpoint.occurred_at,
    checkpoint.active_ms,
    timezone_offset_minutes,
)? {
    transaction.execute(
        "INSERT INTO activity_session_time_buckets(
           session_id,local_day,bucket_start_hour,raw_active_ms
         ) VALUES(?1,?2,?3,?4)
         ON CONFLICT(session_id,local_day,bucket_start_hour) DO UPDATE SET
           raw_active_ms=raw_active_ms+excluded.raw_active_ms",
        params![checkpoint.session_id, delta.local_day, delta.bucket_start_hour, delta.active_ms],
    )?;
}
```

- [ ] **Step 4: Verify focused and existing lifecycle tests**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml checkpoint_splits_active_time_across_four_hour_boundaries
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml checkpoint_time_buckets_use_session_timezone_offset
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml statistics_tests
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/statistics.rs apps/desktop/src-tauri/src/statistics_tests.rs
git commit -m "feat: bucket activity checkpoints by local time"
```

## Task 3: Persist the local time of real Memora reviews

**Files:**
- Modify: `apps/desktop/src-tauri/src/study_queue.rs`
- Modify: `apps/desktop/src-tauri/src/commands.rs`
- Test: `apps/desktop/src-tauri/src/study_queue_tests.rs`
- Test: `apps/desktop/src-tauri/src/commands_tests.rs`

- [ ] **Step 1: Write failing validation and persistence tests**

Extend the `StudyRating` test helper to set `local_minute_of_day: 13 * 60 + 15`, then assert:

```rust
let local_minute: i64 = database.connection.query_row(
    "SELECT local_minute_of_day FROM review_logs WHERE id=?1",
    params![result.review_log_id],
    |row| row.get(0),
).expect("review local minute");
assert_eq!(local_minute, 795);
```

Add tests that `-1` and `1440` return `InvalidLearning("local review minute must be between 0 and 1439")` without inserting a review log.

- [ ] **Step 2: Run the tests and verify RED**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml review_log_persists_local_minute_of_day
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml rate_study_card_rejects_invalid_local_minute
```

Expected: compile FAIL because `StudyRating` has no `local_minute_of_day`.

- [ ] **Step 3: Add the field, validation, and insert parameter**

Add to `StudyRating`:

```rust
pub local_minute_of_day: i64,
```

At the beginning of `rate_study_card`, validate:

```rust
if !(0..1440).contains(&rating.local_minute_of_day) {
    return Err(LibraryDbError::InvalidLearning(
        "local review minute must be between 0 and 1439".into(),
    ));
}
```

Extend the review insert column list and values with `local_minute_of_day`. In the Tauri command, compute one local timestamp and pass both fields:

```rust
let local_now = chrono::Local::now();
let study_day = local_now.date_naive().to_string();
let local_minute_of_day = i64::from(local_now.hour() * 60 + local_now.minute());
```

Import `chrono::Timelike` in `commands.rs`, then set `local_minute_of_day` in `StudyRating`.

- [ ] **Step 4: Verify Memora tests**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml study_queue_tests
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml commands_tests
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/study_queue.rs apps/desktop/src-tauri/src/commands.rs apps/desktop/src-tauri/src/study_queue_tests.rs apps/desktop/src-tauri/src/commands_tests.rs
git commit -m "feat: record local time for real reviews"
```

## Task 4: Replace rolling personal ranges with calendar periods

**Files:**
- Modify: `apps/desktop/src-tauri/src/statistics.rs`
- Test: `apps/desktop/src-tauri/src/statistics_tests.rs`

- [ ] **Step 1: Write failing calendar-window tests**

Add these assertions using a public or test-visible `StatisticsPeriod` and `PeriodUnit`:

```rust
#[test]
fn calendar_periods_compute_exact_local_boundaries() {
    assert_eq!(
        StatisticsPeriod::new(PeriodUnit::Week, "2026-07-19").unwrap().bounds().unwrap(),
        ("2026-07-13".into(), "2026-07-20".into()),
    );
    assert_eq!(
        StatisticsPeriod::new(PeriodUnit::Month, "2026-02-18").unwrap().bounds().unwrap(),
        ("2026-02-01".into(), "2026-03-01".into()),
    );
    assert_eq!(
        StatisticsPeriod::new(PeriodUnit::Year, "2024-05-01").unwrap().bounds().unwrap(),
        ("2024-01-01".into(), "2025-01-01".into()),
    );
}
```

Add tests for leap-year February, ISO week spanning two years, invalid unit/date, and previous-period boundaries.

- [ ] **Step 2: Run tests and verify RED**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml calendar_periods_compute_exact_local_boundaries
```

Expected: compile FAIL because calendar period types do not exist.

- [ ] **Step 3: Implement the calendar period model**

Replace personal use of `StatisticsRange` with:

```rust
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum PeriodUnit { Week, Month, Year }

impl PeriodUnit {
    pub fn parse(value: &str) -> Result<Self> {
        match value {
            "week" => Ok(Self::Week),
            "month" => Ok(Self::Month),
            "year" => Ok(Self::Year),
            _ => Err(StatisticsError::Validation("invalid statistics period unit".into())),
        }
    }
}

#[derive(Clone, Debug)]
pub struct StatisticsPeriod {
    pub unit: PeriodUnit,
    pub anchor_local_day: NaiveDate,
}

impl StatisticsPeriod {
    pub fn new(unit: PeriodUnit, anchor: &str) -> Result<Self> {
        Ok(Self {
            unit,
            anchor_local_day: NaiveDate::parse_from_str(anchor, "%Y-%m-%d")
                .map_err(|_| StatisticsError::Validation("invalid anchorLocalDay".into()))?,
        })
    }
}
```

Implement one `CalendarWindow { start: NaiveDate, end_exclusive: NaiveDate }` helper. Week subtracts `weekday().num_days_from_monday()`, Month uses day 1 and the next month, and Year uses January 1 and next January 1. `previous()` subtracts seven days, one calendar month, or one calendar year from the current start and recomputes a window.

Change personal repository methods (`statistics_overview`, `reading_statistics`, `document_statistics`, `memora_statistics`, and `deck_statistics_detail`) to receive `&StatisticsPeriod`. Keep daily analytics snapshot functions unchanged.

- [ ] **Step 4: Verify calendar and existing aggregate tests**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml calendar_periods
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml statistics_tests
```

Expected: PASS after updating existing test calls from rolling enums to anchored periods.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/statistics.rs apps/desktop/src-tauri/src/statistics_tests.rs
git commit -m "feat: query personal statistics by calendar period"
```

## Task 5: Aggregate zero-filled heatmap buckets and KPI comparisons

**Files:**
- Modify: `apps/desktop/src-tauri/src/statistics.rs`
- Test: `apps/desktop/src-tauri/src/statistics_tests.rs`

- [ ] **Step 1: Write failing overview aggregation tests**

Seed Reading time buckets in two four-hour bands and one real review at local minute 795. Assert the overview returns app-split values and zero-filled dates:

```rust
let overview = database.statistics_overview(
    &StatisticsPeriod::new(PeriodUnit::Week, "2026-07-19").unwrap(),
    FIXED_NOW,
    TODAY_LOCAL_DAY,
).unwrap();
assert_eq!(overview.time_buckets.len(), 7 * 6 * 2);
assert!(overview.time_buckets.iter().any(|bucket|
    bucket.local_day == "2026-07-16"
        && bucket.bucket_start_hour == 12
        && bucket.app_key == "memora"
        && bucket.active_ms == 300_000
));
assert_eq!(overview.previous_active_ms, 120_000);
assert_eq!(overview.previous_active_days, 1);
```

Add a Year test that a December/January ISO week is assigned to the selected calendar year only by local-day filtering. Add a test that future dates in the current period are returned as zero but marked `is_future: true`.

- [ ] **Step 2: Run tests and verify RED**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml overview_returns_zero_filled_app_time_buckets
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml overview_returns_previous_calendar_period_comparisons
```

Expected: compile FAIL because `StatisticsOverview` has no time buckets or comparison fields.

- [ ] **Step 3: Add serialized bucket types and aggregation**

Add:

```rust
#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatisticsTimeBucket {
    pub local_day: String,
    pub bucket_start_hour: i64,
    pub app_key: String,
    pub active_ms: i64,
    pub is_future: bool,
}
```

Extend `StatisticsOverview` with:

```rust
pub previous_active_ms: i64,
pub previous_active_days: i64,
pub time_buckets: Vec<StatisticsTimeBucket>,
```

Query Reading/Practice from `activity_session_time_buckets JOIN activity_sessions`; query real review time with `MIN(elapsed_ms, 300000)` and bucket start `(local_minute_of_day / 240) * 4`. Merge Practice and real reviews under `app_key = "memora"`. Build every `(local day, six bucket starts, reading/memora)` combination in Rust so an empty period still renders a stable grid.

Reuse the same active-day rule for the previous calendar window. Do not include future dates in active-day or threshold calculations.

- [ ] **Step 4: Verify aggregates and privacy boundary**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml overview_returns_zero_filled_app_time_buckets
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml overview_returns_previous_calendar_period_comparisons
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml daily_snapshots
```

Expected: PASS, and daily analytics snapshots remain unchanged without time-of-day fields.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/statistics.rs apps/desktop/src-tauri/src/statistics_tests.rs
git commit -m "feat: aggregate statistics time heatmap data"
```

## Task 6: Expose the typed Tauri calendar-period contract

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands.rs`
- Modify: `apps/desktop/src/domain/statistics.ts`
- Modify: `apps/desktop/src/lib/statistics.ts`
- Test: `apps/desktop/src/lib/statistics.test.ts`

- [ ] **Step 1: Write failing bridge tests**

Replace the personal getter expectation with:

```ts
const period = { unit: "month" as const, anchorLocalDay: "2026-07-19" };
await getStatisticsOverview(period, call);
expect(call).toHaveBeenCalledWith("get_statistics_overview", {
  input: { period },
});
```

Repeat the exact nested `input: { period }` assertion for Reading and Memora, and `input: { documentId, period }` / `input: { deckId, period }` for detail getters.

- [ ] **Step 2: Run bridge tests and verify RED**

```bash
cd apps/desktop && npm test -- src/lib/statistics.test.ts
```

Expected: FAIL because getters still accept and send `range`.

- [ ] **Step 3: Define frontend types and update both command boundaries**

In `domain/statistics.ts`, replace the personal range type with:

```ts
export type StatisticsPeriodUnit = "week" | "month" | "year";
export interface StatisticsPeriod {
  unit: StatisticsPeriodUnit;
  anchorLocalDay: string;
}
export type StatisticsBucketStartHour = 0 | 4 | 8 | 12 | 16 | 20;
export interface StatisticsTimeBucket {
  localDay: string;
  bucketStartHour: StatisticsBucketStartHour;
  appKey: string;
  activeMs: number;
  isFuture: boolean;
}
```

Extend `StatisticsOverview` with `previousActiveMs`, `previousActiveDays`, and `timeBuckets`.

In Rust, define one deserialized command input:

```rust
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatisticsPeriodInput {
    pub unit: String,
    pub anchor_local_day: String,
}
```

Each personal getter input contains `period: StatisticsPeriodInput`. Convert it through `PeriodUnit::parse` and `StatisticsPeriod::new`, then call the repository. Update TypeScript getters to accept `StatisticsPeriod` and send `{ input: { period } }`.

- [ ] **Step 4: Verify bridge, Rust commands, and build types**

```bash
cd apps/desktop && npm test -- src/lib/statistics.test.ts
npm run build
cd ../.. && cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml commands_tests
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/commands.rs apps/desktop/src/domain/statistics.ts apps/desktop/src/lib/statistics.ts apps/desktop/src/lib/statistics.test.ts
git commit -m "feat: expose calendar statistics periods"
```

## Task 7: Run backend and contract verification

**Files:**
- Verify only.

- [ ] **Step 1: Run all Rust tests**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

Expected: all library and integration tests PASS.

- [ ] **Step 2: Run Clippy with warnings denied**

```bash
cargo clippy --all-targets --all-features --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings
```

Expected: PASS with no warnings.

- [ ] **Step 3: Run the focused frontend bridge suite**

```bash
cd apps/desktop && npm test -- src/lib/statistics.test.ts
```

Expected: PASS.

- [ ] **Step 4: Confirm hourly data is not uploaded**

```bash
rg -n "timeBuckets|bucketStartHour|localMinuteOfDay" services/pocketbase apps/desktop/src/features/statistics/StatisticsAnalyticsSync.tsx
```

Expected: no PocketBase upload schema or sync payload contains any of those fields.

- [ ] **Step 5: Commit any verification-only corrections**

```bash
git status --short
```

Expected: no uncommitted changes from verification. If a test-driven correction was required, commit only its test and implementation with `fix: correct statistics time bucket aggregation`.

