# Statistics Local Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist trustworthy Reading and Memora activity locally, expose typed statistics queries, and instrument Reader and Review without changing learning semantics.

**Architecture:** SQLite and Rust own canonical activity persistence and aggregation. React uses small idle-aware hooks to submit bounded checkpoints; it never aggregates raw rows. Real Memora outcomes remain in `review_logs`, while Reading and Practice All use generic activity sessions.

**Tech Stack:** Tauri 2, Rust, rusqlite, chrono, React 19, TypeScript, Vitest, Testing Library.

**Design:** `docs/superpowers/specs/2026-07-18-extensible-statistics-platform-design.md`

---

## File map

**Create:**

- `apps/desktop/src-tauri/migrations/0011_statistics.sql` — activity schema.
- `apps/desktop/src-tauri/src/statistics.rs` — persistence and aggregate queries.
- `apps/desktop/src-tauri/src/statistics_tests.rs` — deterministic repository tests.
- `apps/desktop/src/domain/statistics.ts` — frontend types.
- `apps/desktop/src/lib/statistics.ts` and `statistics.test.ts` — Tauri bridge.
- `apps/desktop/src/features/statistics/useActiveTimer.ts` and `.test.tsx` — idle-aware timer.
- `apps/desktop/src/features/reader/useReadingActivitySession.ts` and `.test.tsx` — Reader coordinator.

**Modify:**

- `apps/desktop/src-tauri/src/library_db.rs`, `commands.rs`, `lib.rs`.
- `apps/desktop/src/features/reader/ReaderPage.tsx` and test.
- `apps/desktop/src/features/review/useElapsedTime.ts`, `ReviewPage.tsx`, and test.
- `apps/desktop/src/app/App.tsx`.

## Task 1: Add the statistics migration

**Files:**
- Create: `apps/desktop/src-tauri/migrations/0011_statistics.sql`
- Create: `apps/desktop/src-tauri/src/statistics_tests.rs`
- Modify: `apps/desktop/src-tauri/src/library_db.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

- [ ] **Step 1: Write the failing migration test**

Register `#[cfg(test)] mod statistics_tests;` in `lib.rs`, then create:

```rust
use rusqlite::params;
use tempfile::TempDir;
use crate::library_db::LibraryDatabase;

fn db() -> (TempDir, LibraryDatabase) {
    let directory = TempDir::new().expect("temporary statistics database");
    let database = LibraryDatabase::open(directory.path()).expect("open statistics database");
    (directory, database)
}

#[test]
fn statistics_migration_creates_tables() {
    let (_directory, database) = db();
    let id: String = database.connection.query_row(
        "SELECT id FROM schema_migrations WHERE id='0011_statistics'", [], |row| row.get(0),
    ).expect("statistics migration");
    assert_eq!(id, "0011_statistics");
    for table in ["activity_sessions", "reading_session_pages"] {
        let count: i64 = database.connection.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
            params![table], |row| row.get(0),
        ).expect("table lookup");
        assert_eq!(count, 1, "missing {table}");
    }
}
```

- [ ] **Step 2: Verify the test fails**

Run:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml statistics_migration_creates_tables
```

Expected: FAIL because migration `0011_statistics` is absent.

- [ ] **Step 3: Add the migration**

```sql
CREATE TABLE activity_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  app_key TEXT NOT NULL,
  activity_kind TEXT NOT NULL,
  context_kind TEXT,
  context_id TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  local_day TEXT NOT NULL,
  timezone_offset_minutes INTEGER NOT NULL,
  raw_active_ms INTEGER NOT NULL DEFAULT 0 CHECK (raw_active_ms >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX activity_sessions_day_app ON activity_sessions(local_day, app_key);
CREATE INDEX activity_sessions_context_day ON activity_sessions(context_kind, context_id, local_day);
CREATE INDEX activity_sessions_started ON activity_sessions(started_at);

CREATE TABLE reading_session_pages (
  session_id TEXT NOT NULL REFERENCES activity_sessions(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page INTEGER NOT NULL CHECK (page > 0),
  raw_active_ms INTEGER NOT NULL DEFAULT 0 CHECK (raw_active_ms >= 0),
  visit_count INTEGER NOT NULL CHECK (visit_count > 0),
  first_visited_at TEXT NOT NULL,
  last_visited_at TEXT NOT NULL,
  PRIMARY KEY(session_id, document_id, page)
);
CREATE INDEX reading_session_pages_document_page
  ON reading_session_pages(document_id, page, last_visited_at);
```

Change `MIGRATIONS` from length 10 to 11 and append the new `include_str!` entry.

- [ ] **Step 4: Verify migration and upgrades pass**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml statistics_migration_creates_tables
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml library_db_tests
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/migrations/0011_statistics.sql apps/desktop/src-tauri/src/library_db.rs apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/src/statistics_tests.rs
git commit -m "feat: add local statistics schema"
```

## Task 2: Implement activity-session persistence

**Files:**
- Create: `apps/desktop/src-tauri/src/statistics.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Test: `apps/desktop/src-tauri/src/statistics_tests.rs`

- [ ] **Step 1: Write failing lifecycle tests**

Use an inserted `documents` row and assert one checkpoint updates the session and page atomically:

```rust
use crate::statistics::{ActivityCheckpoint, NewActivitySession};

database.start_activity_session(NewActivitySession {
    id: "session-1".into(), app_key: "reading".into(), activity_kind: "reading".into(),
    context_kind: Some("document".into()), context_id: Some("doc-1".into()),
    occurred_at: "2026-07-18T01:00:00.000Z".into(), local_day: "2026-07-18".into(),
    timezone_offset_minutes: 540,
}).expect("start");
database.checkpoint_activity_session(ActivityCheckpoint {
    session_id: "session-1".into(), occurred_at: "2026-07-18T01:00:15.000Z".into(),
    active_ms: 15_000, document_id: Some("doc-1".into()), page: Some(8),
    page_visit_increment: 1,
}).expect("checkpoint");
let values: (i64, i64, i64) = database.connection.query_row(
    "SELECT s.raw_active_ms,p.raw_active_ms,p.visit_count FROM activity_sessions s
     JOIN reading_session_pages p ON p.session_id=s.id WHERE s.id='session-1' AND p.page=8",
    [], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
).expect("activity values");
assert_eq!(values, (15_000, 15_000, 1));
```

Add separate assertions that unknown app/activity pairs, negative increments, invalid RFC3339 timestamps, invalid `YYYY-MM-DD`, and page 0 produce errors with no partial writes.

- [ ] **Step 2: Verify compile failure**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml statistics_tests
```

Expected: compile FAIL because the module and methods are undefined.

- [ ] **Step 3: Implement the repository boundary**

Define these exact inputs:

```rust
pub struct NewActivitySession {
    pub id: String, pub app_key: String, pub activity_kind: String,
    pub context_kind: Option<String>, pub context_id: Option<String>,
    pub occurred_at: String, pub local_day: String, pub timezone_offset_minutes: i64,
}
pub struct ActivityCheckpoint {
    pub session_id: String, pub occurred_at: String, pub active_ms: i64,
    pub document_id: Option<String>, pub page: Option<i64>, pub page_visit_increment: i64,
}
```

Implement `LibraryDatabase::{start_activity_session, checkpoint_activity_session, finish_activity_session}` in `statistics.rs`. Validate only `(reading, reading)` and `(memora, practice)` initially. Parse dates with chrono. Use one SQLite transaction for the session increment and this page upsert:

```sql
INSERT INTO reading_session_pages(
  session_id,document_id,page,raw_active_ms,visit_count,first_visited_at,last_visited_at
) VALUES(?1,?2,?3,?4,MAX(1,?5),?6,?6)
ON CONFLICT(session_id,document_id,page) DO UPDATE SET
  raw_active_ms=raw_active_ms+excluded.raw_active_ms,
  visit_count=visit_count+?5,
  last_visited_at=excluded.last_visited_at;
```

Register `pub mod statistics;` in `lib.rs`.

- [ ] **Step 4: Verify tests and clippy**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml statistics_tests
cargo clippy --all-targets --all-features --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings
```

Expected: PASS with no warnings.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/statistics.rs apps/desktop/src-tauri/src/statistics_tests.rs apps/desktop/src-tauri/src/lib.rs
git commit -m "feat: persist local activity sessions"
```

## Task 3: Preserve aggregate activity when an item is deleted

**Files:**
- Modify: `apps/desktop/src-tauri/src/library_db.rs`
- Modify: `apps/desktop/src-tauri/src/learning.rs`
- Test: `apps/desktop/src-tauri/src/statistics_tests.rs`

- [ ] **Step 1: Write the failing deletion test**

Insert a document, session, and page checkpoint. Delete the document and assert:

```rust
let remaining: (i64, Option<String>) = database.connection.query_row(
    "SELECT raw_active_ms,context_id FROM activity_sessions WHERE id='session-1'",
    [], |row| Ok((row.get(0)?, row.get(1)?)),
).expect("aggregate remains");
let pages: i64 = database.connection.query_row(
    "SELECT COUNT(*) FROM reading_session_pages", [], |row| row.get(0),
).expect("page count");
assert_eq!(remaining, (15_000, None));
assert_eq!(pages, 0);
```

Add the parallel deck case: create a deck and a `memora/practice` session with `raw_active_ms=15_000`, delete the deck, then assert the session remains with `context_id=NULL` and the aggregate Memora time is still 15 seconds.

- [ ] **Step 2: Verify the test fails**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml deleting_document_preserves_aggregate_reading_activity
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml deleting_deck_preserves_aggregate_practice_activity
```

Expected: FAIL because document and deck `context_id` values remain populated.

- [ ] **Step 3: Update the existing deletion transaction**

Before `DELETE FROM documents`, execute:

```rust
transaction.execute(
    "UPDATE activity_sessions SET context_id=NULL,updated_at=?1
     WHERE context_kind='document' AND context_id=?2",
    params![portable_timestamp(), id],
)?;
```

Let the page foreign key cascade remove page rows.

In `LearningDatabase::delete_deck`, use the existing transaction and execute the equivalent update before `DELETE FROM decks`:

```rust
tx.execute(
    "UPDATE activity_sessions SET context_id=NULL,updated_at=?1
     WHERE context_kind='deck' AND context_id=?2",
    params![now, id],
)?;
```

- [ ] **Step 4: Verify deletion tests**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml deleting_document_preserves_aggregate_reading_activity
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml deleting_deck_preserves_aggregate_practice_activity
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml library_db_tests
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml learning_tests
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/library_db.rs apps/desktop/src-tauri/src/learning.rs apps/desktop/src-tauri/src/statistics_tests.rs
git commit -m "fix: preserve aggregate activity on item deletion"
```

## Task 4: Implement personal aggregate queries

**Files:**
- Modify: `apps/desktop/src-tauri/src/statistics.rs`
- Test: `apps/desktop/src-tauri/src/statistics_tests.rs`

- [ ] **Step 1: Write deterministic failing metric tests**

At fixed local day `2026-07-18`, arrange Reading visits `[1, 2, 2, 4]` on a ten-page document and real reviews Again=1 at 600,000ms plus Good=2 at 30,000ms. The Again review must have `prior_state='review'`.

```rust
let overview = database.statistics_overview(
    StatisticsRange::Days30, fixed_now, "2026-07-18",
).expect("overview");
let document = database.document_statistics(
    "doc-1", StatisticsRange::All, fixed_now, "2026-07-18",
).expect("document statistics");
assert_eq!(document.unique_pages, 3);
assert_eq!(document.page_visits, 4);
assert_eq!(document.revisits, 1);
assert_eq!(document.coverage, 0.3);
assert_eq!(document.real_reviews, 3);
assert_eq!(document.recall_rate, Some(2.0 / 3.0));
assert_eq!(document.lapses, 1);
assert_eq!(overview.memora_active_ms, 360_000); // capped 5m + 30s + 30s
```

Add tests for zero denominators (`None`, not `0%`), local-day range boundaries, active-day threshold, streak ending yesterday, a streak longer than the selected `7d` range remaining untruncated, deck scope, Practice All exclusion from recall/lapse, and due forecast excluding suspended/deleted cards.

- [ ] **Step 2: Verify missing-query failure**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml statistics_tests
```

Expected: compile FAIL because range and view models do not exist.

- [ ] **Step 3: Add range and response types**

```rust
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StatisticsRange { Days7, Days30, Year1, All }

impl StatisticsRange {
    pub fn parse(value: &str) -> Result<Self> {
        match value {
            "7d" => Ok(Self::Days7), "30d" => Ok(Self::Days30),
            "1y" => Ok(Self::Year1), "all" => Ok(Self::All),
            _ => Err(invalid("invalid statistics range")),
        }
    }
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityBucket { pub local_day: String, pub active_ms: i64 }

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
```

Add these exact response shapes; all derive `Serialize` with camelCase names:

```rust
pub struct RatingDistribution { pub again: i64, pub hard: i64, pub good: i64, pub easy: i64 }
pub struct DueForecast { pub today: i64, pub next_7_days: i64, pub next_30_days: i64 }
pub struct CardStateCounts {
    pub new: i64, pub learning: i64, pub review: i64,
    pub relearning: i64, pub suspended: i64,
}
pub struct ReadingStatistics {
    pub active_ms: i64, pub session_count: i64, pub average_session_ms: Option<f64>,
    pub page_visits: i64, pub unique_pages: i64, pub revisits: i64,
    pub buckets: Vec<ActivityBucket>,
}
pub struct DocumentStatistics {
    pub document_id: String, pub active_ms: i64, pub session_count: i64,
    pub average_session_ms: Option<f64>, pub page_visits: i64, pub unique_pages: i64,
    pub revisits: i64, pub coverage: f64, pub real_reviews: i64,
    pub recall_rate: Option<f64>, pub again_count: i64, pub lapses: i64,
    pub buckets: Vec<ActivityBucket>,
}
pub struct MemoraStatistics {
    pub active_ms: i64, pub practice_active_ms: i64, pub session_count: i64,
    pub real_reviews: i64, pub recall_rate: Option<f64>,
    pub rating_distribution: RatingDistribution, pub average_answer_ms: Option<f64>,
    pub card_states: CardStateCounts, pub lapse_rate: Option<f64>,
    pub active_days: i64, pub due_forecast: DueForecast, pub buckets: Vec<ActivityBucket>,
}
pub struct DeckStatisticsDetail {
    pub deck_id: String, pub active_ms: i64, pub session_count: i64,
    pub real_reviews: i64, pub recall_rate: Option<f64>,
    pub rating_distribution: RatingDistribution, pub average_answer_ms: Option<f64>,
    pub card_states: CardStateCounts, pub lapse_rate: Option<f64>,
    pub due_forecast: DueForecast, pub buckets: Vec<ActivityBucket>,
}
```

Implement query methods in separate private helpers. Required SQL semantics:

- Reading time: `activity_sessions.activity_kind='reading'`.
- Practice time: `activity_sessions.activity_kind='practice'`.
- Real-study time: `SUM(MIN(review_logs.elapsed_ms,300000))`.
- Memora `active_ms` and Overview's Memora contribution: capped real-study time plus Practice time; `practice_active_ms` is the Practice subset and must not be added a second time in the UI.
- Memora `session_count`: real study sessions with at least one persisted review plus Practice sessions with `raw_active_ms > 0`. Real outcome denominators remain real reviews only.
- Active day: at least 60,000ms combined or one real review.
- Current streak: query lifetime active days independently of the selected range; count backward from today when active, otherwise from yesterday, and return zero when neither is active.
- Visits: `SUM(visit_count)`; unique pages: `COUNT(DISTINCT page)`; revisits: visits minus unique pages.
- Document learning: `card_sources -> review_logs`.
- Deck learning: `cards -> review_logs`.
- Lapse: `prior_state='review' AND rating='again'` only.
- Due forecast: active, non-deleted, non-suspended cards only.
- Card states and due forecast are current snapshots independent of the selected historical range. Document coverage is lifetime; all other visit/time/outcome fields obey the selected range.

Return zero-filled daily buckets so the UI never manufactures missing dates.

- [ ] **Step 4: Verify statistics tests**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml statistics_tests
```

Expected: PASS for all ranges and definitions.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/statistics.rs apps/desktop/src-tauri/src/statistics_tests.rs
git commit -m "feat: query personal statistics"
```

## Task 5: Expose typed Tauri commands

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Create: `apps/desktop/src/domain/statistics.ts`
- Create: `apps/desktop/src/lib/statistics.ts`
- Create: `apps/desktop/src/lib/statistics.test.ts`

- [ ] **Step 1: Write failing bridge tests**

```ts
import { expect, test, vi } from "vitest";
import { checkpointActivitySession, getStatisticsOverview } from "./statistics";

test("uses the typed Tauri statistics contract", async () => {
  const call = vi.fn().mockResolvedValue({ activeMs: 0, readingActiveMs: 0, memoraActiveMs: 0, currentStreak: 0, activeDays: 0, buckets: [] });
  await getStatisticsOverview("30d", call);
  await checkpointActivitySession({
    sessionId: "s1", occurredAt: "2026-07-18T00:00:00Z", activeMs: 15000,
    documentId: "d1", page: 2, pageVisitIncrement: 1,
  }, call);
  expect(call).toHaveBeenNthCalledWith(1, "get_statistics_overview", { range: "30d" });
  expect(call).toHaveBeenNthCalledWith(2, "checkpoint_activity_session", {
    input: expect.objectContaining({ sessionId: "s1", activeMs: 15000 }),
  });
});
```

- [ ] **Step 2: Verify module-not-found failure**

```bash
cd apps/desktop && npm test -- src/lib/statistics.test.ts
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement types, wrappers, and commands**

Start `domain/statistics.ts` with:

```ts
export type StatisticsRange = "7d" | "30d" | "1y" | "all";
export interface ActivityBucket { localDay: string; activeMs: number; }
export interface StatisticsOverview {
  activeMs: number; readingActiveMs: number; memoraActiveMs: number;
  currentStreak: number; activeDays: number; buckets: ActivityBucket[];
}
export interface ActivityCheckpointInput {
  sessionId: string; occurredAt: string; activeMs: number;
  documentId?: string | null; page?: number | null; pageVisitIncrement: number;
}
export interface StartActivitySessionInput {
  id: string; appKey: "reading" | "memora"; activityKind: "reading" | "practice";
  contextKind?: "document" | "deck" | null; contextId?: string | null;
  occurredAt: string; localDay: string; timezoneOffsetMinutes: number;
}
```

Define all Task 4 payloads once in this domain file. Add wrappers in `lib/statistics.ts`. Add camelCase `Deserialize` command inputs in `commands.rs`, parse ranges with `StatisticsRange::parse`, and register:

```rust
commands::get_statistics_overview,
commands::get_reading_statistics,
commands::get_document_statistics,
commands::get_memora_statistics,
commands::get_deck_statistics_detail,
commands::start_activity_session,
commands::checkpoint_activity_session,
commands::finish_activity_session,
```

Do not alter existing `get_deck_statistics`; the detailed query has a distinct command and type.

- [ ] **Step 4: Verify bridge and build**

```bash
cd apps/desktop
npm test -- src/lib/statistics.test.ts
npm run build
cd ../..
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml commands_tests
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml statistics_tests
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/commands.rs apps/desktop/src-tauri/src/lib.rs apps/desktop/src/domain/statistics.ts apps/desktop/src/lib/statistics.ts apps/desktop/src/lib/statistics.test.ts
git commit -m "feat: expose typed statistics commands"
```

## Task 6: Build the idle-aware timer

**Files:**
- Create: `apps/desktop/src/features/statistics/useActiveTimer.ts`
- Create: `apps/desktop/src/features/statistics/useActiveTimer.test.tsx`
- Modify: `apps/desktop/src/features/review/useElapsedTime.ts`

- [ ] **Step 1: Write fake-timer tests**

```tsx
test("pauses after 90 seconds and resumes on activity", () => {
  vi.useFakeTimers();
  render(<TimerHarness idleAfterMs={90_000} />);
  act(() => vi.advanceTimersByTime(120_000));
  expect(screen.getByTestId("elapsed")).toHaveTextContent("90000");
  fireEvent.pointerDown(window);
  act(() => vi.advanceTimersByTime(10_000));
  expect(screen.getByTestId("elapsed")).toHaveTextContent("100000");
  vi.useRealTimers();
});
```

Also test hidden-document pause, explicit reset, `running=false`, and global-listener cleanup.

- [ ] **Step 2: Verify failure**

```bash
cd apps/desktop && npm test -- src/features/statistics/useActiveTimer.test.tsx
```

Expected: FAIL because the hook is missing.

- [ ] **Step 3: Implement the shared timer**

```ts
export interface ActiveTimer {
  activeMs: number;
  markActivity(): void;
  reset(): void;
  snapshot(): number;
}
export function useActiveTimer(options: {
  idleAfterMs?: number;
  running?: boolean;
}): ActiveTimer;
```

Accumulate segments with `performance.now()`, clamp the open segment at its idle deadline, pause while `document.visibilityState === "hidden"`, and listen to pointer, keyboard, wheel, and scroll activity. Refactor `useElapsedTime` into a compatibility wrapper while preserving its numeric return type.

- [ ] **Step 4: Verify timer and Review tests**

```bash
cd apps/desktop && npm test -- src/features/statistics/useActiveTimer.test.tsx src/features/review/ReviewPage.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/statistics/useActiveTimer.ts apps/desktop/src/features/statistics/useActiveTimer.test.tsx apps/desktop/src/features/review/useElapsedTime.ts apps/desktop/src/features/review/ReviewPage.test.tsx
git commit -m "feat: measure idle-aware active time"
```

## Task 7: Instrument Reader and Practice All

**Files:**
- Create: `apps/desktop/src/features/reader/useReadingActivitySession.ts`
- Create: `apps/desktop/src/features/reader/useReadingActivitySession.test.tsx`
- Modify: `apps/desktop/src/features/reader/ReaderPage.tsx`
- Modify: `apps/desktop/src/features/reader/ReaderPage.test.tsx`
- Modify: `apps/desktop/src/features/review/ReviewPage.tsx`
- Modify: `apps/desktop/src/features/review/ReviewPage.test.tsx`
- Modify: `apps/desktop/src/app/App.tsx`

- [ ] **Step 1: Write failing instrumentation tests**

For Reader, assert start on first activity, checkpoint every 15 seconds and on primary-page change, visit increment only on a real page transition, finish on unmount, and API failures never block Reader.

For Review, assert:

```tsx
expect(onRate).toHaveBeenCalledWith("session-1", expect.anything(), "good", 90_000);
expect(activityApi.start).toHaveBeenCalledWith(expect.objectContaining({
  appKey: "memora", activityKind: "practice",
}));
expect(activityApi.finish).toHaveBeenCalled();
```

Practice tests must also assert `rate_study_card` is never called.

- [ ] **Step 2: Verify failures**

```bash
cd apps/desktop
npm test -- src/features/reader/useReadingActivitySession.test.tsx src/features/review/ReviewPage.test.tsx
```

Expected: FAIL because persistence hooks are not integrated.

- [ ] **Step 3: Implement focused coordinators**

Define one injected boundary:

```ts
export interface StatisticsActivityApi {
  start(input: StartActivitySessionInput): Promise<void>;
  checkpoint(input: ActivityCheckpointInput): Promise<void>;
  finish(sessionId: string, occurredAt: string): Promise<void>;
}
```

`useReadingActivitySession(documentId, primaryPage, api)` owns UUID, idle timer, serialized checkpoints, visits, and cleanup. Reuse existing `ReaderPage.currentPage` as the primary page; do not add a second visibility observer.

In real study, submit `useActiveTimer().snapshot()` to `onRate`; Rust owns the five-minute aggregate cap. In Practice All, record one `memora/practice` activity session using `sourceDeck.id`, checkpoint it, and finish on completion, Back, or unmount. Instrumentation errors remain silent.

- [ ] **Step 4: Verify relevant suites and build**

```bash
cd apps/desktop
npm test -- src/features/reader/useReadingActivitySession.test.tsx src/features/reader/ReaderPage.test.tsx src/features/review/ReviewPage.test.tsx src/app/App.test.tsx
npm run build
```

Expected: PASS. Reader remains usable after rejected checkpoints, and Practice All remains consequence-free.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/reader/useReadingActivitySession.ts apps/desktop/src/features/reader/useReadingActivitySession.test.tsx apps/desktop/src/features/reader/ReaderPage.tsx apps/desktop/src/features/reader/ReaderPage.test.tsx apps/desktop/src/features/review/ReviewPage.tsx apps/desktop/src/features/review/ReviewPage.test.tsx apps/desktop/src/app/App.tsx
git commit -m "feat: instrument reading and practice activity"
```

## Task 8: Verify the local foundation

**Files:** Modify only if verification exposes a defect in Tasks 1-7.

- [ ] **Step 1: Run frontend verification**

```bash
cd apps/desktop
npm test
npm run build
```

Expected: all tests pass and the production build succeeds.

- [ ] **Step 2: Run Rust verification**

```bash
cargo test --all-targets --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo clippy --all-targets --all-features --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings
```

Expected: PASS with no warnings.

- [ ] **Step 3: Confirm scope and worktree state**

```bash
git diff --check
git status --short
git rev-parse --short HEAD
```

Expected: no uncommitted implementation changes. Record the commit for the next plan.

- [ ] **Step 4: Fix only verified defects**

If verification exposes a defect, stop this task and append a named defect task containing: one failing test, its exact failing command, the focused implementation, the passing command, and a defect-specific commit. Do not make an unplanned generic fix or create an empty verification commit.

- [ ] **Step 5: Hand off dependency**

Provide the clean commit hash and confirm the typed functions in `apps/desktop/src/lib/statistics.ts` are ready for the Personal Dashboard plan.
