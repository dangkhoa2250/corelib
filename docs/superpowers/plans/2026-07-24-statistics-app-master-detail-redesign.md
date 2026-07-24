# Statistics App Master-Detail Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the oversized generic Reading and Memora detail dashboards with a compact, searchable master-detail workspace that exposes app, document, and deck Heatmaps and renders selected item detail in place.

**Architecture:** `StatisticsPage` remains the only scope coordinator. Two built-in workspaces adapt Library documents and Memora decks into a shared `StatisticsMasterDetail` component, while four content loaders render aggregate or item detail with shared icon-free metric and distribution primitives. Rust extends the four existing statistics payloads with zero-filled, context-scoped time buckets; no migration or new Tauri command is introduced.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library, CSS, Tauri 2, Rust, rusqlite, existing Corelib `ScrollArea`, `Combobox`, statistics Heatmap/Graph primitives.

**Design:** `docs/superpowers/specs/2026-07-24-statistics-app-master-detail-redesign-design.md`

**Planning source:** `5033c4d`

---

## Worktree and ownership rules

- Work only in `/Users/jason/project/corelib/.worktrees/statistics`.
- Before implementation, record:

```bash
git rev-parse --short HEAD
git status --short
```

- The current Vitest cache modification at
  `node_modules/.vite/vitest/da39a3ee5e6b4b0d3255bfef95601890afd80709/results.json`
  is pre-existing user-owned state. Never stage, restore, or overwrite it.
- Add only exact source/test/doc paths to each commit.
- Do not add a database migration.
- Do not add a second Statistics stylesheet.
- Do not add a public route or Command Palette action. Scoped entity selection
  is internal state under the existing `route.statistics` destination.

## File map

### Backend contracts and aggregation

- Modify `apps/desktop/src-tauri/src/statistics.rs`
  - add `time_buckets` to four response structs;
  - materialize app/document/deck-scoped time buckets.
- Modify `apps/desktop/src-tauri/src/statistics_tests.rs`
  - prove zero-fill, future handling, review caps, and no scope leakage.
- Modify `apps/desktop/src/domain/statistics.ts`
  - mirror the four extended payloads.
- Modify `apps/desktop/src/lib/statistics.test.ts`
  - pin unchanged command inputs and extended response fixtures.

### Shared UI

- Create `apps/desktop/src/features/statistics/components/StatisticsMetricStrip.tsx`
- Create `apps/desktop/src/features/statistics/components/StatisticsMetricStrip.test.tsx`
- Create `apps/desktop/src/features/statistics/components/StatisticsDetailSection.tsx`
- Create `apps/desktop/src/features/statistics/components/StatisticsDetailSection.test.tsx`
- Create `apps/desktop/src/features/statistics/components/RatingDistribution.tsx`
- Create `apps/desktop/src/features/statistics/components/RatingDistribution.test.tsx`
- Create `apps/desktop/src/features/statistics/components/StatisticsMasterDetail.tsx`
- Create `apps/desktop/src/features/statistics/components/StatisticsMasterDetail.test.tsx`
- Modify `apps/desktop/src/features/statistics/components/ActivityChartCard.tsx`
- Modify `apps/desktop/src/features/statistics/components/ActivityChartCard.test.tsx`

### Built-in workspaces and routing

- Create `apps/desktop/src/features/statistics/pages/ReadingStatisticsWorkspace.tsx`
- Create `apps/desktop/src/features/statistics/pages/ReadingStatisticsWorkspace.test.tsx`
- Create `apps/desktop/src/features/statistics/pages/MemoraStatisticsWorkspace.tsx`
- Create `apps/desktop/src/features/statistics/pages/MemoraStatisticsWorkspace.test.tsx`
- Modify the four existing built-in statistics pages and tests:
  - `ReadingStatisticsPage.tsx`
  - `ReadingStatisticsPage.test.tsx`
  - `DocumentStatisticsPage.tsx`
  - `DocumentStatisticsPage.test.tsx`
  - `MemoraStatisticsPage.tsx`
  - `MemoraStatisticsPage.test.tsx`
  - `DeckStatisticsPage.tsx`
  - `DeckStatisticsPage.test.tsx`
- Modify `apps/desktop/src/features/statistics/StatisticsPage.tsx`
- Modify `apps/desktop/src/features/statistics/StatisticsPage.test.tsx`
- Modify `apps/desktop/src/app/App.tsx`
- Modify `apps/desktop/src/app/App.test.tsx`

### Styling and verification

- Modify `apps/desktop/src/features/statistics/statistics.css`
- Modify `apps/desktop/src/styles/tokens.test.ts`
- Modify `apps/desktop/src/features/statistics/components/StatisticsShell.test.tsx`
- Verify, but do not change unless a regression is exposed:
  - `apps/desktop/src/components/ScrollArea.tsx`
  - `apps/desktop/src/components/ScrollArea.test.tsx`
  - `apps/desktop/src/app/commandRegistry.test.ts`
- Modify `design-qa.md` with fresh evidence from the implementing revision.

## Task 1: Add scoped time buckets to Rust detail payloads

**Files:**

- Modify: `apps/desktop/src-tauri/src/statistics.rs`
- Test: `apps/desktop/src-tauri/src/statistics_tests.rs`

- [ ] **Step 1: Add failing repository tests for Reading and document scope**

Add these tests beside
`week_overview_zero_fills_local_time_buckets_and_marks_future_days`:

```rust
fn bucket_ms(
    buckets: &[crate::statistics::StatisticsTimeBucket],
    day: &str,
    hour: i64,
) -> i64 {
    buckets
        .iter()
        .find(|bucket| bucket.local_day == day && bucket.bucket_start_hour == hour)
        .map(|bucket| bucket.active_ms)
        .unwrap_or(-1)
}

#[test]
fn reading_and_document_details_return_scoped_zero_filled_time_buckets() {
    let (_directory, mut database) = db();
    seed_document_with_pages(&mut database, "doc-a", 10);
    seed_document_with_pages(&mut database, "doc-b", 10);

    start_session(
        &mut database, "read-a", "reading", "reading",
        "2026-07-18T08:00:00.000Z", "2026-07-18",
        Some("document"), Some("doc-a"),
    );
    checkpoint(
        &mut database, "read-a", "2026-07-18T08:02:00.000Z",
        120_000, Some("doc-a"), Some(1), 1,
    );
    start_session(
        &mut database, "read-b", "reading", "reading",
        "2026-07-18T12:00:00.000Z", "2026-07-18",
        Some("document"), Some("doc-b"),
    );
    checkpoint(
        &mut database, "read-b", "2026-07-18T12:01:00.000Z",
        60_000, Some("doc-b"), Some(1), 1,
    );

    let selected = period(PeriodUnit::Week, "2026-07-18");
    let reading = database
        .reading_statistics(&selected, FIXED_NOW, TODAY_LOCAL_DAY)
        .expect("reading");
    let document = database
        .document_statistics("doc-a", &selected, FIXED_NOW, TODAY_LOCAL_DAY)
        .expect("doc-a");

    assert_eq!(reading.time_buckets.len(), 7 * 6);
    assert_eq!(document.time_buckets.len(), 7 * 6);
    assert_eq!(bucket_ms(&reading.time_buckets, "2026-07-18", 8), 120_000);
    assert_eq!(bucket_ms(&reading.time_buckets, "2026-07-18", 12), 60_000);
    assert_eq!(bucket_ms(&document.time_buckets, "2026-07-18", 8), 120_000);
    assert_eq!(bucket_ms(&document.time_buckets, "2026-07-18", 12), 0);
    assert!(document.time_buckets.iter().all(|bucket| bucket.app_key == "reading"));
    assert!(document.time_buckets.iter()
        .filter(|bucket| bucket.local_day.as_str() > TODAY_LOCAL_DAY)
        .all(|bucket| bucket.is_future && bucket.active_ms == 0));
}
```

- [ ] **Step 2: Add failing repository tests for Memora/deck practice and review scope**

Append:

```rust
#[test]
fn memora_and_deck_details_return_practice_plus_scoped_review_time_buckets() {
    let (_directory, mut database) = db();
    seed_document_with_pages(&mut database, "source-doc", 10);
    let deck_a = database.create_deck("Deck A").expect("deck a");
    let deck_b = database.create_deck("Deck B").expect("deck b");
    let card_a = create_card_for_document(
        &mut database, "Deck A", "source-doc", 1, "card-a",
    );
    let card_b = create_card_for_document(
        &mut database, "Deck B", "source-doc", 1, "card-b",
    );

    insert_review_log(
        &database, "review-a", &card_a,
        "2026-07-18T09:00:00.000Z", "good", "review", "review", 600_000,
    );
    insert_review_log(
        &database, "review-b", &card_b,
        "2026-07-18T13:00:00.000Z", "hard", "review", "review", 30_000,
    );

    start_session(
        &mut database, "practice-a", "memora", "practice",
        "2026-07-18T08:00:00.000Z", "2026-07-18",
        Some("deck"), Some(&deck_a.id),
    );
    checkpoint(
        &mut database, "practice-a", "2026-07-18T08:01:00.000Z",
        60_000, None, None, 0,
    );
    start_session(
        &mut database, "practice-b", "memora", "practice",
        "2026-07-18T12:00:00.000Z", "2026-07-18",
        Some("deck"), Some(&deck_b.id),
    );
    checkpoint(
        &mut database, "practice-b", "2026-07-18T12:01:00.000Z",
        60_000, None, None, 0,
    );

    let selected = period(PeriodUnit::Week, "2026-07-18");
    let memora = database
        .memora_statistics(&selected, FIXED_NOW, TODAY_LOCAL_DAY)
        .expect("memora");
    let detail_a = database
        .deck_statistics_detail(&deck_a.id, &selected, FIXED_NOW, TODAY_LOCAL_DAY)
        .expect("deck a detail");

    assert_eq!(memora.time_buckets.len(), 7 * 6);
    assert_eq!(detail_a.time_buckets.len(), 7 * 6);
    assert_eq!(bucket_ms(&memora.time_buckets, "2026-07-18", 8), 360_000);
    assert_eq!(bucket_ms(&memora.time_buckets, "2026-07-18", 12), 90_000);
    assert_eq!(bucket_ms(&detail_a.time_buckets, "2026-07-18", 8), 360_000);
    assert_eq!(bucket_ms(&detail_a.time_buckets, "2026-07-18", 12), 0);
    assert!(detail_a.time_buckets.iter().all(|bucket| bucket.app_key == "memora"));
}
```

The `600_000` review must contribute `300_000`, preserving the existing
five-minute cap.

In the existing
`activity_without_time_buckets_falls_back_once_to_the_session_day` test, add
this regression assertion so legacy daily Graph totals are retained without
inventing a Heatmap time:

```rust
assert_eq!(
    overview
        .time_buckets
        .iter()
        .filter(|bucket| {
            bucket.app_key == "reading" && bucket.local_day == "2026-07-02"
        })
        .map(|bucket| bucket.active_ms)
        .sum::<i64>(),
    0,
);
```

- [ ] **Step 3: Run the two new Rust tests and verify RED**

Run:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml \
  reading_and_document_details_return_scoped_zero_filled_time_buckets
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml \
  memora_and_deck_details_return_practice_plus_scoped_review_time_buckets
```

Expected: both commands fail to compile because the four response structs do
not expose `time_buckets`.

- [ ] **Step 4: Add the response fields and a scoped time-bucket helper**

In each Rust response struct, add:

```rust
pub time_buckets: Vec<StatisticsTimeBucket>,
```

Replace the overview-only helper with an explicit scope:

```rust
#[derive(Clone, Copy)]
enum TimeBucketScope<'a> {
    Overview,
    Reading,
    Document(&'a str),
    Memora,
    Deck(&'a str),
}

impl TimeBucketScope<'_> {
    fn includes_memora(self) -> bool {
        matches!(self, Self::Overview | Self::Memora | Self::Deck(_))
    }
}
```

Change the helper signature:

```rust
fn build_time_buckets(
    connection: &rusqlite::Connection,
    window: &CalendarWindow,
    today_local_day: &str,
    scope: TimeBucketScope<'_>,
) -> Result<Vec<StatisticsTimeBucket>>
```

Build activity-session values with a scoped query:

```rust
let activity_scope = match scope {
    TimeBucketScope::Overview => (
        "AND ((sessions.app_key = 'reading' AND sessions.activity_kind = 'reading')
           OR (sessions.app_key = 'memora' AND sessions.activity_kind = 'practice'))",
        None,
    ),
    TimeBucketScope::Reading => (
        "AND sessions.app_key = 'reading' AND sessions.activity_kind = 'reading'",
        None,
    ),
    TimeBucketScope::Document(id) => (
        "AND sessions.app_key = 'reading' AND sessions.activity_kind = 'reading'
         AND sessions.context_kind = 'document' AND sessions.context_id = ?3",
        Some(id),
    ),
    TimeBucketScope::Memora => (
        "AND sessions.app_key = 'memora' AND sessions.activity_kind = 'practice'",
        None,
    ),
    TimeBucketScope::Deck(id) => (
        "AND sessions.app_key = 'memora' AND sessions.activity_kind = 'practice'
         AND sessions.context_kind = 'deck' AND sessions.context_id = ?3",
        Some(id),
    ),
};
let activity_sql = format!(
    "SELECT buckets.local_day, buckets.bucket_start_hour, sessions.app_key,
            COALESCE(SUM(buckets.raw_active_ms), 0)
     FROM activity_session_time_buckets buckets
     JOIN activity_sessions sessions ON sessions.id = buckets.session_id
     WHERE buckets.local_day >= ?1 AND buckets.local_day < ?2
       {activity_filter}
     GROUP BY buckets.local_day, buckets.bucket_start_hour, sessions.app_key",
    activity_filter = activity_scope.0,
);
let mut statement = connection.prepare(&activity_sql)?;
let row_map = |row: &rusqlite::Row<'_>| {
    Ok((
        row.get::<_, String>(0)?,
        row.get::<_, i64>(1)?,
        row.get::<_, String>(2)?,
        row.get::<_, i64>(3)?,
    ))
};
let activity_rows = match activity_scope.1 {
    Some(id) => statement
        .query_map(
            params![
                format_local_day(window.start),
                format_local_day(window.end_exclusive),
                id,
            ],
            row_map,
        )?
        .collect::<std::result::Result<Vec<_>, _>>()?,
    None => statement
        .query_map(
            params![
                format_local_day(window.start),
                format_local_day(window.end_exclusive),
            ],
            row_map,
        )?
        .collect::<std::result::Result<Vec<_>, _>>()?,
};
for (day, hour, app_key, active_ms) in activity_rows {
    values.insert((day, hour, app_key), active_ms);
}
```

Only merge real-review rows when `scope.includes_memora()`. Use the exact
scoped query shape below so deck detail cannot leak reviews from another deck:

```rust
if scope.includes_memora() {
    let (review_join, review_filter, deck_id) = match scope {
        TimeBucketScope::Deck(id) => (
            "JOIN cards ON cards.id = review_logs.card_id",
            "AND cards.deck_id = ?4",
            Some(id),
        ),
        _ => ("", "", None),
    };
    let review_sql = format!(
        "SELECT COALESCE(
                    NULLIF(review_logs.local_day, ''),
                    substr(review_logs.reviewed_at, 1, 10)
                ),
                (review_logs.local_minute_of_day / 240) * 4,
                COALESCE(SUM(MIN(review_logs.elapsed_ms, ?3)), 0)
         FROM review_logs
         {review_join}
         WHERE COALESCE(
                   NULLIF(review_logs.local_day, ''),
                   substr(review_logs.reviewed_at, 1, 10)
               ) >= ?1
           AND COALESCE(
                   NULLIF(review_logs.local_day, ''),
                   substr(review_logs.reviewed_at, 1, 10)
               ) < ?2
           {review_filter}
         GROUP BY 1, 2",
    );
    let mut review_statement = connection.prepare(&review_sql)?;
    let extract = |row: &rusqlite::Row<'_>| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, i64>(2)?,
        ))
    };
    let review_rows = match deck_id {
        Some(id) => review_statement
            .query_map(
                params![
                    format_local_day(window.start),
                    format_local_day(window.end_exclusive),
                    REVIEW_TIME_CAP_MS,
                    id,
                ],
                extract,
            )?
            .collect::<std::result::Result<Vec<_>, _>>()?,
        None => review_statement
            .query_map(
                params![
                    format_local_day(window.start),
                    format_local_day(window.end_exclusive),
                    REVIEW_TIME_CAP_MS,
                ],
                extract,
            )?
            .collect::<std::result::Result<Vec<_>, _>>()?,
    };
    for (day, hour, active_ms) in review_rows {
        *values.entry((day, hour, "memora".into())).or_insert(0) += active_ms;
    }
}
```

Materialize only the app keys appropriate to the scope:

```rust
let app_keys: &[&str] = match scope {
    TimeBucketScope::Overview => &["reading", "memora"],
    TimeBucketScope::Reading | TimeBucketScope::Document(_) => &["reading"],
    TimeBucketScope::Memora | TimeBucketScope::Deck(_) => &["memora"],
};

for day in enumerate_days(&format_local_day(window.start), &window.today)? {
    let is_future = day.as_str() > today_local_day;
    for bucket_start_hour in [0, 4, 8, 12, 16, 20] {
        for app_key in app_keys {
            buckets.push(StatisticsTimeBucket {
                local_day: day.clone(),
                bucket_start_hour,
                app_key: (*app_key).into(),
                active_ms: if is_future {
                    0
                } else {
                    values
                        .get(&(day.clone(), bucket_start_hour, (*app_key).into()))
                        .copied()
                        .unwrap_or(0)
                },
                is_future,
            });
        }
    }
}
```

Wire the helper into the five query functions:

```rust
// overview
time_buckets: build_time_buckets(
    &self.connection, &window, today_local_day, TimeBucketScope::Overview,
)?,

// Reading
time_buckets: build_time_buckets(
    &self.connection, &window, today_local_day, TimeBucketScope::Reading,
)?,

// document
time_buckets: build_time_buckets(
    &self.connection, &window, today_local_day,
    TimeBucketScope::Document(document_id),
)?,

// Memora
time_buckets: build_time_buckets(
    &self.connection, &window, today_local_day, TimeBucketScope::Memora,
)?,

// deck
time_buckets: build_time_buckets(
    &self.connection, &window, today_local_day, TimeBucketScope::Deck(deck_id),
)?,
```

- [ ] **Step 5: Run focused and complete statistics repository tests**

Run:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml \
  reading_and_document_details_return_scoped_zero_filled_time_buckets
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml \
  memora_and_deck_details_return_practice_plus_scoped_review_time_buckets
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml statistics_tests
```

Expected: PASS. The full statistics module must retain all existing period,
cross-midnight, cap, daily-bucket, and snapshot behavior.

- [ ] **Step 6: Commit the Rust contract**

```bash
git add apps/desktop/src-tauri/src/statistics.rs \
  apps/desktop/src-tauri/src/statistics_tests.rs
git commit -m "feat: expose scoped statistics time buckets"
```

## Task 2: Mirror time buckets through the TypeScript contract

**Files:**

- Modify: `apps/desktop/src/domain/statistics.ts`
- Test: `apps/desktop/src/lib/statistics.test.ts`
- Modify fixtures in:
  - `apps/desktop/src/features/statistics/pages/ReadingStatisticsPage.test.tsx`
  - `apps/desktop/src/features/statistics/pages/DocumentStatisticsPage.test.tsx`
  - `apps/desktop/src/features/statistics/pages/MemoraStatisticsPage.test.tsx`
  - `apps/desktop/src/features/statistics/pages/DeckStatisticsPage.test.tsx`

- [ ] **Step 1: Add failing bridge contract assertions**

In `src/lib/statistics.test.ts`, import `expectTypeOf` plus the four response
types and `StatisticsTimeBucket`. Add these compile-time assertions at the
start of the contract test:

```ts
expectTypeOf<ReadingStatistics["timeBuckets"]>()
  .toEqualTypeOf<StatisticsTimeBucket[]>();
expectTypeOf<DocumentStatistics["timeBuckets"]>()
  .toEqualTypeOf<StatisticsTimeBucket[]>();
expectTypeOf<MemoraStatistics["timeBuckets"]>()
  .toEqualTypeOf<StatisticsTimeBucket[]>();
expectTypeOf<DeckStatisticsDetail["timeBuckets"]>()
  .toEqualTypeOf<StatisticsTimeBucket[]>();
```

Change the existing mock's `timeBuckets` from `[]` to one concrete bucket:

```ts
timeBuckets: [{
  localDay: "2026-07-18",
  bucketStartHour: 8,
  appKey: "reading",
  activeMs: 60_000,
  isFuture: false,
}],
```

Capture the four wrapper results and assert the bridge returns the bucket
unchanged while existing command calls remain:

```ts
const reading = await getReadingStatistics(period, call);
const document = await getDocumentStatistics("doc-1", period, call);
const memora = await getMemoraStatistics(period, call);
const deck = await getDeckStatisticsDetail("deck-1", period, call);

expect(call).toHaveBeenCalledWith("get_document_statistics", {
  input: { documentId: "doc-1", period },
});
for (const result of [reading, document, memora, deck]) {
  expect(result.timeBuckets[0]).toEqual({
    localDay: "2026-07-18",
    bucketStartHour: 8,
    appKey: "reading",
    activeMs: 60_000,
    isFuture: false,
  });
}
```

- [ ] **Step 2: Run the bridge test and verify RED**

Run the production type-check first:

```bash
cd apps/desktop
npm run build
```

Expected: FAIL with TypeScript excess-property errors because the four detail
interfaces do not declare `timeBuckets`. This is the contract RED; Vitest alone
transpiles TypeScript and is not sufficient evidence for this step.

- [ ] **Step 3: Extend the four domain interfaces**

Add this property to `ReadingStatistics`, `DocumentStatistics`,
`MemoraStatistics`, and `DeckStatisticsDetail`:

```ts
timeBuckets: StatisticsTimeBucket[];
```

Do not change wrapper names, commands, or inputs in `src/lib/statistics.ts`.

- [ ] **Step 4: Update existing page fixtures**

Every existing Reading/Document fixture receives:

```ts
timeBuckets: [],
```

Every existing Memora/Deck fixture receives the same property. Where a fixture
is shared, annotate it with `satisfies` and its corresponding response type so
future required contract fields fail the production type-check.

- [ ] **Step 5: Run bridge and existing page tests**

Run:

```bash
cd apps/desktop
npm test -- \
  src/lib/statistics.test.ts \
  src/features/statistics/pages/ReadingStatisticsPage.test.tsx \
  src/features/statistics/pages/DocumentStatisticsPage.test.tsx \
  src/features/statistics/pages/MemoraStatisticsPage.test.tsx \
  src/features/statistics/pages/DeckStatisticsPage.test.tsx
npm run build
```

Expected: tests PASS with unchanged Tauri command inputs, then the production
type-check/build exits 0.

- [ ] **Step 6: Commit the TypeScript contract**

```bash
git add apps/desktop/src/domain/statistics.ts \
  apps/desktop/src/lib/statistics.test.ts \
  apps/desktop/src/features/statistics/pages/ReadingStatisticsPage.test.tsx \
  apps/desktop/src/features/statistics/pages/DocumentStatisticsPage.test.tsx \
  apps/desktop/src/features/statistics/pages/MemoraStatisticsPage.test.tsx \
  apps/desktop/src/features/statistics/pages/DeckStatisticsPage.test.tsx
git commit -m "feat: extend statistics detail payloads"
```

## Task 3: Build compact detail primitives

**Files:**

- Create: `apps/desktop/src/features/statistics/components/StatisticsMetricStrip.tsx`
- Create: `apps/desktop/src/features/statistics/components/StatisticsMetricStrip.test.tsx`
- Create: `apps/desktop/src/features/statistics/components/StatisticsDetailSection.tsx`
- Create: `apps/desktop/src/features/statistics/components/StatisticsDetailSection.test.tsx`
- Create: `apps/desktop/src/features/statistics/components/RatingDistribution.tsx`
- Create: `apps/desktop/src/features/statistics/components/RatingDistribution.test.tsx`

- [ ] **Step 1: Write failing primitive tests**

`StatisticsMetricStrip.test.tsx`:

```tsx
test("renders semantic icon-free primary and secondary metrics", () => {
  render(
    <StatisticsMetricStrip
      ariaLabel="Reading summary"
      metrics={[
        { id: "active", label: "Active time", value: "3m", emphasis: "primary" },
        { id: "sessions", label: "Sessions", value: "10", emphasis: "secondary" },
      ]}
    />,
  );

  expect(screen.getByRole("list", { name: "Reading summary" })).toBeInTheDocument();
  expect(screen.getByText("Active time").tagName).toBe("DT");
  expect(screen.getByText("3m").tagName).toBe("DD");
  expect(document.querySelector(".statistics-kpi-card__icon")).toBeNull();
});
```

`StatisticsDetailSection.test.tsx`:

```tsx
test("keeps loading and errors inside an embedded detail section", async () => {
  const onRetry = vi.fn();
  const { rerender } = render(
    <StatisticsDetailSection title="Activity" state="loading" />,
  );
  expect(screen.getByRole("status")).toBeInTheDocument();

  rerender(
    <StatisticsDetailSection
      title="Activity"
      state="error"
      errorMessage="Unable to load"
      onRetry={onRetry}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(onRetry).toHaveBeenCalledOnce();
  expect(screen.getByText("Activity").closest("section")).toHaveClass(
    "statistics-detail-section",
  );
});
```

`RatingDistribution.test.tsx`:

```tsx
test("renders truthful zero and non-zero rating distributions", () => {
  const { rerender } = render(
    <RatingDistribution
      distribution={{ again: 0, hard: 0, good: 0, easy: 0 }}
    />,
  );
  expect(screen.getByLabelText("Rating distribution: no reviews")).toBeInTheDocument();
  expect(screen.getAllByText("0")).toHaveLength(4);

  rerender(
    <RatingDistribution
      distribution={{ again: 1, hard: 2, good: 6, easy: 1 }}
    />,
  );
  expect(screen.getByLabelText(
    "Rating distribution: Again 1, Hard 2, Good 6, Easy 1",
  )).toBeInTheDocument();
  expect(screen.getByTestId("rating-good-segment")).toHaveStyle({ flexGrow: "6" });
});
```

- [ ] **Step 2: Run primitive tests and verify RED**

Run:

```bash
cd apps/desktop
npm test -- \
  src/features/statistics/components/StatisticsMetricStrip.test.tsx \
  src/features/statistics/components/StatisticsDetailSection.test.tsx \
  src/features/statistics/components/RatingDistribution.test.tsx
```

Expected: FAIL because the three modules do not exist.

- [ ] **Step 3: Implement `StatisticsMetricStrip`**

Use this public contract and semantic structure:

```tsx
export interface StatisticsMetric {
  id: string;
  label: string;
  value: string;
  help?: string;
  emphasis?: "primary" | "secondary";
}

interface StatisticsMetricStripProps {
  ariaLabel: string;
  metrics: StatisticsMetric[];
}

export function StatisticsMetricStrip({
  ariaLabel,
  metrics,
}: StatisticsMetricStripProps) {
  return (
    <dl className="statistics-metric-strip" role="list" aria-label={ariaLabel}>
      {metrics.map((metric) => (
        <div
          className="statistics-metric-strip__item"
          data-emphasis={metric.emphasis ?? "secondary"}
          key={metric.id}
          role="listitem"
        >
          <dt>{metric.label}</dt>
          <dd>{metric.value}</dd>
          {metric.help ? <span>{metric.help}</span> : null}
        </div>
      ))}
    </dl>
  );
}
```

- [ ] **Step 4: Implement embedded sections and rating distribution**

`StatisticsDetailSection` must reuse `StatisticsSkeleton`,
`StatisticsEmptyState`, and `StatisticsErrorState`, but render
`statistics-detail-section`, not `statistics-section`. Use this contract and
state rendering:

```tsx
interface StatisticsDetailSectionProps {
  title: string;
  action?: ReactNode;
  state?: "loading" | "empty" | "error" | "loaded";
  errorMessage?: string;
  onRetry?(): void;
  children?: ReactNode;
}

export function StatisticsDetailSection({
  title,
  action,
  state = "loaded",
  errorMessage,
  onRetry,
  children,
}: StatisticsDetailSectionProps) {
  return (
    <section className="statistics-detail-section">
      <div className="statistics-section__header">
        <h2 className="statistics-section__title">{title}</h2>
        {action ? (
          <div className="statistics-section__action">{action}</div>
        ) : null}
      </div>
      {state === "loading" ? <StatisticsSkeleton /> : null}
      {state === "empty" ? <StatisticsEmptyState /> : null}
      {state === "error" ? (
        <StatisticsErrorState message={errorMessage} onRetry={onRetry} />
      ) : null}
      {state === "loaded" ? children : null}
    </section>
  );
}
```

`RatingDistribution` must:

```tsx
const entries = [
  ["again", "Again"],
  ["hard", "Hard"],
  ["good", "Good"],
  ["easy", "Easy"],
] as const;

const total = entries.reduce((sum, [key]) => sum + distribution[key], 0);
const ariaLabel = total === 0
  ? "Rating distribution: no reviews"
  : `Rating distribution: ${entries
      .map(([key, label]) => `${label} ${distribution[key]}`)
      .join(", ")}`;
```

Render one bar segment per entry with:

```tsx
style={{ flexGrow: total === 0 ? 0 : distribution[key] }}
```

and a labelled value row below. Use classes only for colors; do not add raw
colors or gradients.

- [ ] **Step 5: Run primitive tests**

Run the command from Step 2.

Expected: PASS.

- [ ] **Step 6: Commit the primitives**

```bash
git add apps/desktop/src/features/statistics/components/StatisticsMetricStrip.tsx \
  apps/desktop/src/features/statistics/components/StatisticsMetricStrip.test.tsx \
  apps/desktop/src/features/statistics/components/StatisticsDetailSection.tsx \
  apps/desktop/src/features/statistics/components/StatisticsDetailSection.test.tsx \
  apps/desktop/src/features/statistics/components/RatingDistribution.tsx \
  apps/desktop/src/features/statistics/components/RatingDistribution.test.tsx
git commit -m "feat: add compact statistics detail primitives"
```

## Task 4: Build the searchable master-detail shell

**Files:**

- Create: `apps/desktop/src/features/statistics/components/StatisticsMasterDetail.tsx`
- Create: `apps/desktop/src/features/statistics/components/StatisticsMasterDetail.test.tsx`

- [ ] **Step 1: Write failing master-detail behavior tests**

Import `type ComponentProps` from React and `within` from Testing Library, then
use this fixture:

```tsx
const items = [
  {
    id: "atomic",
    label: "Atomic Habits",
    description: "James Clear",
    meta: "48% read",
    searchText: "Atomic Habits James Clear",
  },
  {
    id: "deep-work",
    label: "Deep Work",
    description: "Cal Newport",
    meta: "36% read",
    searchText: "Deep Work Cal Newport",
  },
];

type MasterDetailProps = ComponentProps<typeof StatisticsMasterDetail>;

function renderMasterDetail(overrides: Partial<MasterDetailProps> = {}) {
  const props: MasterDetailProps = {
    allLabel: "All Reading",
    ariaLabel: "Reading statistics scopes",
    searchLabel: "Search books",
    noResultsLabel: "No books found",
    items,
    selectedId: null,
    onSelect: vi.fn(),
    listState: "loaded",
    children: <p>right panel</p>,
    ...overrides,
  };
  return render(<StatisticsMasterDetail {...props} />);
}
```

Add tests:

```tsx
test("keeps All scope visible and filters entities by local metadata", async () => {
  const user = userEvent.setup();
  render(
    <StatisticsMasterDetail
      allLabel="All Reading"
      ariaLabel="Reading statistics scopes"
      searchLabel="Search books"
      noResultsLabel="No books found"
      items={items}
      selectedId={null}
      onSelect={vi.fn()}
    >
      <p>right panel</p>
    </StatisticsMasterDetail>,
  );

  const navigation = screen.getByRole("navigation", {
    name: "Reading statistics scopes",
  });
  expect(within(navigation).getByRole("button", { name: "All Reading" }))
    .toHaveAttribute("aria-current", "page");
  await user.type(screen.getByRole("searchbox", { name: "Search books" }), "cal");
  expect(within(navigation).queryByRole("button", { name: /Atomic Habits/ }))
    .toBeNull();
  expect(within(navigation).getByRole("button", { name: /Deep Work/ }))
    .toBeInTheDocument();
  expect(within(navigation).getByRole("button", { name: "All Reading" }))
    .toBeInTheDocument();
});

test("selects an entity without unmounting the workspace", async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(
    <StatisticsMasterDetail
      allLabel="All Reading"
      ariaLabel="Reading statistics scopes"
      searchLabel="Search books"
      noResultsLabel="No books found"
      items={items}
      selectedId={null}
      onSelect={onSelect}
    >
      <p>right panel</p>
    </StatisticsMasterDetail>,
  );

  const navigation = screen.getByRole("navigation", {
    name: "Reading statistics scopes",
  });
  await user.click(
    within(navigation).getByRole("button", { name: /Atomic Habits/ }),
  );
  expect(onSelect).toHaveBeenCalledWith("atomic");
  expect(screen.getByText("right panel")).toBeInTheDocument();
});

test("maps the collapsed searchable picker back to All scope", async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  renderMasterDetail({ selectedId: "atomic", onSelect });

  await user.click(screen.getByRole("combobox", {
    name: "Reading statistics scopes",
  }));
  await user.click(screen.getByRole("option", { name: "All Reading" }));

  expect(onSelect).toHaveBeenCalledWith(null);
});

test("uses ScrollArea and reserves the custom thumb inset", () => {
  renderMasterDetail();
  expect(screen.getByTestId("statistics-entity-scroll-area"))
    .toHaveStyle({ overflow: "hidden" });
  expect(screen.getByTestId("statistics-entity-scroll-content"))
    .toHaveClass("statistics-entity-pane__scroll-content");
});

test("renders independent list loading, error, retry, and empty-filter states", async () => {
  const user = userEvent.setup();
  const onRetry = vi.fn();
  const { rerender } = renderMasterDetail({ listState: "loading", onRetry });
  expect(screen.getByRole("status", { name: "Loading scopes" })).toBeInTheDocument();

  rerender(
    <StatisticsMasterDetail
      allLabel="All Reading"
      ariaLabel="Reading statistics scopes"
      searchLabel="Search books"
      noResultsLabel="No books found"
      items={items}
      selectedId={null}
      onSelect={vi.fn()}
      listState="error"
      onRetry={onRetry}
    >
      <p>right panel</p>
    </StatisticsMasterDetail>,
  );
  await user.click(screen.getByRole("button", { name: "Retry scopes" }));
  expect(onRetry).toHaveBeenCalledOnce();

  rerender(
    <StatisticsMasterDetail
      allLabel="All Reading"
      ariaLabel="Reading statistics scopes"
      searchLabel="Search books"
      noResultsLabel="No books found"
      items={items}
      selectedId={null}
      onSelect={vi.fn()}
      listState="loaded"
    >
      <p>right panel</p>
    </StatisticsMasterDetail>,
  );
  await user.type(screen.getByRole("searchbox", { name: "Search books" }), "missing");
  expect(screen.getByText("No books found")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the master-detail test and verify RED**

Run:

```bash
cd apps/desktop
npm test -- src/features/statistics/components/StatisticsMasterDetail.test.tsx
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the public contract**

```tsx
export interface StatisticsScopeItem {
  id: string;
  label: string;
  description?: string;
  meta?: string;
  searchText: string;
  visual?: ReactNode;
}

interface StatisticsMasterDetailProps {
  allLabel: string;
  ariaLabel: string;
  searchLabel: string;
  noResultsLabel: string;
  items: StatisticsScopeItem[];
  selectedId: string | null;
  onSelect(id: string | null): void;
  listState?: "loading" | "loaded" | "error";
  onRetry?(): void;
  children: ReactNode;
}
```

Implementation requirements:

- `query` is local state.
- `filteredItems` matches `item.searchText.toLocaleLowerCase()`.
- the All button is outside the filtered list and calls `onSelect(null)`.
- each item button calls `onSelect(item.id)` and sets
  `aria-current={selectedId === item.id ? "page" : undefined}`;
- `visual` is wrapped in an `aria-hidden="true"` span;
- the desktop list uses:

```tsx
<ScrollArea data-testid="statistics-entity-scroll-area">
  <div
    className="statistics-entity-pane__scroll-content"
    data-testid="statistics-entity-scroll-content"
  >
    {rows}
  </div>
</ScrollArea>
```

- a collapsed searchable `Combobox` is rendered with values
  `"__all__"` and entity IDs; selecting `"__all__"` calls `onSelect(null)`;
- the collapsed control has `ariaLabel={ariaLabel}`;
- loading and errors remain inside the entity pane;
- right-panel `children` are always mounted.

- [ ] **Step 4: Run the master-detail and shared ScrollArea tests**

Run:

```bash
cd apps/desktop
npm test -- \
  src/features/statistics/components/StatisticsMasterDetail.test.tsx \
  src/components/ScrollArea.test.tsx
```

Expected: PASS, including nested wheel handoff tests.

- [ ] **Step 5: Commit the master-detail shell**

```bash
git add apps/desktop/src/features/statistics/components/StatisticsMasterDetail.tsx \
  apps/desktop/src/features/statistics/components/StatisticsMasterDetail.test.tsx
git commit -m "feat: add statistics master detail shell"
```

## Task 5: Make ActivityChartCard work inside fixed scopes

**Files:**

- Modify: `apps/desktop/src/features/statistics/components/ActivityChartCard.tsx`
- Test: `apps/desktop/src/features/statistics/components/ActivityChartCard.test.tsx`

- [ ] **Step 1: Add failing fixed-scope and embedded-variant tests**

Add:

```tsx
test("shows Heatmap without an app filter for a fixed scope", () => {
  render(
    <ActivityChartCard
      embedded
      period={{ unit: "week", anchorLocalDay: "2026-07-13" }}
      totalBuckets={[{ date: "2026-07-13", value: 15 }]}
      series={[]}
      timeBuckets={[{
        localDay: "2026-07-13",
        bucketStartHour: 12,
        activeMs: 15 * 60_000,
        appKey: "reading",
        isFuture: false,
      }]}
    />,
  );

  expect(screen.getByRole("button", { name: "Heatmap" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Graph" })).toBeInTheDocument();
  expect(screen.queryByRole("combobox", { name: "Statistics app" })).toBeNull();
  expect(screen.getByText("Activity").closest("section"))
    .toHaveClass("statistics-activity-card--embedded");
});
```

Keep the existing overview test that proves failed registered apps remain
available in the app filter.

- [ ] **Step 2: Run the component test and verify RED**

Run:

```bash
cd apps/desktop
npm test -- src/features/statistics/components/ActivityChartCard.test.tsx
```

Expected: FAIL because `embedded` is not a known prop and the single-option
app filter still renders.

- [ ] **Step 3: Implement the fixed-scope behavior**

Extend props:

```ts
embedded?: boolean;
showAppFilter?: boolean;
```

Resolve visibility:

```ts
const inferredFilterVisibility =
  (registeredApps?.length ?? 0) > 0 || series.length > 0;
const shouldShowAppFilter = showAppFilter ?? inferredFilterVisibility;
```

Render controls only when `shouldShowAppFilter`:

```tsx
{shouldShowAppFilter ? (
  <div className="statistics-chart-card__controls">
    <Combobox
      value={selectedApp}
      onChange={setSelectedApp}
      options={appOptions}
      ariaLabel="Statistics app"
      searchable={false}
      className="statistics-app-filter"
    />
  </div>
) : null}
```

Apply the variant:

```tsx
<section
  className={
    embedded
      ? "statistics-section statistics-activity-card--embedded"
      : "statistics-section"
  }
>
```

Do not change Heatmap/Graph preferences, palette, graph modes, or interaction.

- [ ] **Step 4: Run chart tests**

Run:

```bash
cd apps/desktop
npm test -- \
  src/features/statistics/components/ActivityChartCard.test.tsx \
  src/features/statistics/components/ActivityHeatmap.test.tsx \
  src/features/statistics/components/ActivityGraph.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit fixed-scope Activity**

```bash
git add apps/desktop/src/features/statistics/components/ActivityChartCard.tsx \
  apps/desktop/src/features/statistics/components/ActivityChartCard.test.tsx
git commit -m "feat: support fixed scope statistics activity"
```

## Task 6: Compose the Reading workspace and document detail

**Files:**

- Create: `apps/desktop/src/features/statistics/pages/ReadingStatisticsWorkspace.tsx`
- Create: `apps/desktop/src/features/statistics/pages/ReadingStatisticsWorkspace.test.tsx`
- Modify: `apps/desktop/src/features/statistics/pages/ReadingStatisticsPage.tsx`
- Modify: `apps/desktop/src/features/statistics/pages/ReadingStatisticsPage.test.tsx`
- Modify: `apps/desktop/src/features/statistics/pages/DocumentStatisticsPage.tsx`
- Modify: `apps/desktop/src/features/statistics/pages/DocumentStatisticsPage.test.tsx`

- [ ] **Step 1: Add failing Reading aggregate/detail presentation tests**

Update the Reading fixture to include a non-zero `timeBuckets` entry and assert:

```tsx
expect(await screen.findByRole("list", { name: "Reading summary" }))
  .toBeInTheDocument();
expect(screen.getByRole("button", { name: "Heatmap" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "Graph" })).toBeInTheDocument();
expect(screen.queryByRole("combobox", { name: "Statistics app" })).toBeNull();
expect(document.querySelectorAll(".statistics-kpi-card__icon")).toHaveLength(0);
```

Update the document fixture and assert:

```tsx
expect(await screen.findByRole("heading", { name: "Reading" }))
  .toBeInTheDocument();
expect(screen.getByText("Coverage")).toBeInTheDocument();
expect(screen.getByText("Reviews")).toBeInTheDocument();
expect(screen.getByRole("button", { name: "Heatmap" })).toBeInTheDocument();
expect(screen.queryByRole("combobox", { name: "Statistics app" })).toBeNull();
```

Add a stale-response test:

```tsx
test("ignores a document response after the selected document changes", async () => {
  const first = deferred<DocumentStatistics>();
  const second = deferred<DocumentStatistics>();
  const getDocStats = vi.fn()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  const { rerender } = render(
    <DocumentStatisticsPage
      document={documentA}
      period={period}
      getDocStats={getDocStats}
    />,
  );
  rerender(
    <DocumentStatisticsPage
      document={documentB}
      period={period}
      getDocStats={getDocStats}
    />,
  );
  second.resolve({
    ...documentStats,
    documentId: "doc-b",
    activeMs: 120_000,
  });
  const summary = await screen.findByRole("list", { name: "Reading summary" });
  expect(within(summary).getByText("2m")).toBeInTheDocument();

  first.resolve({
    ...documentStats,
    documentId: "doc-a",
    activeMs: 60_000,
  });
  await waitFor(() => {
    expect(within(summary).queryByText("1m")).toBeNull();
    expect(within(summary).getByText("2m")).toBeInTheDocument();
  });
});
```

Import `within` from Testing Library and `userEvent`; define this local helper
in the test file:

```ts
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
```

Also preserve the existing Reading period-refetch test and add this document
equivalent:

```tsx
test("refetches the selected document when the period changes", async () => {
  const july = { unit: "month" as const, anchorLocalDay: "2026-07-01" };
  const august = { unit: "month" as const, anchorLocalDay: "2026-08-01" };
  const getDocStats = vi.fn().mockResolvedValue(documentStats);
  const { rerender } = render(
    <DocumentStatisticsPage
      document={documentA}
      period={july}
      getDocStats={getDocStats}
    />,
  );
  await waitFor(() =>
    expect(getDocStats).toHaveBeenCalledWith("doc-a", july),
  );

  rerender(
    <DocumentStatisticsPage
      document={documentA}
      period={august}
      getDocStats={getDocStats}
    />,
  );
  await waitFor(() =>
    expect(getDocStats).toHaveBeenLastCalledWith("doc-a", august),
  );
  expect(getDocStats).toHaveBeenCalledTimes(2);
});
```

Add right-panel retry coverage for the Reading family:

```tsx
test("retries only the active Reading statistics request", async () => {
  const user = userEvent.setup();
  const period = { unit: "week" as const, anchorLocalDay: "2026-07-13" };
  const getReadingStats = vi.fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(readingStats);
  render(
    <ReadingStatisticsPage
      period={period}
      getReadingStats={getReadingStats}
    />,
  );

  await user.click(await screen.findByRole("button", { name: "Retry" }));
  expect(await screen.findByRole("list", { name: "Reading summary" }))
    .toBeInTheDocument();
  expect(getReadingStats).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Write failing Reading workspace tests**

Use two `LibraryDocument` fixtures and assert:

```tsx
test("switches between All Reading and a selected document in place", async () => {
  const user = userEvent.setup();
  const onSelectDocument = vi.fn();
  const { rerender } = render(
    <ReadingStatisticsWorkspace
      documents={[documentA, documentB]}
      documentsLoading={false}
      selectedDocumentId={null}
      onSelectDocument={onSelectDocument}
      period={period}
      getReadingStats={getReadingStats}
      getDocumentStats={getDocumentStats}
    />,
  );

  expect(await screen.findByRole("heading", { name: "All Reading" }))
    .toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Document A/ }));
  expect(onSelectDocument).toHaveBeenCalledWith("doc-a");

  rerender(
    <ReadingStatisticsWorkspace
      documents={[documentA, documentB]}
      documentsLoading={false}
      selectedDocumentId="doc-a"
      onSelectDocument={onSelectDocument}
      period={period}
      getReadingStats={getReadingStats}
      getDocumentStats={getDocumentStats}
    />,
  );
  expect(await screen.findByRole("heading", { name: "Document A" }))
    .toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "Reading statistics scopes" }))
    .toBeInTheDocument();
});

test("shows an unavailable state for a missing deep-linked document", () => {
  render(
    <ReadingStatisticsWorkspace
      documents={[documentA]}
      documentsLoading={false}
      selectedDocumentId="missing"
      onSelectDocument={vi.fn()}
      period={period}
      getReadingStats={getReadingStats}
      getDocumentStats={getDocumentStats}
    />,
  );
  expect(screen.getByRole("status"))
    .toHaveTextContent("This book is no longer available");
  expect(screen.getByRole("button", { name: "All Reading" })).toBeInTheDocument();
});
```

- [ ] **Step 3: Run Reading tests and verify RED**

Run:

```bash
cd apps/desktop
npm test -- \
  src/features/statistics/pages/ReadingStatisticsPage.test.tsx \
  src/features/statistics/pages/DocumentStatisticsPage.test.tsx \
  src/features/statistics/pages/ReadingStatisticsWorkspace.test.tsx
```

Expected: FAIL because the workspace and new props/layout do not exist.

- [ ] **Step 4: Refactor Reading and Document pages into right-panel content**

Both Reading-family pages own a retry key:

```ts
const [reloadKey, setReloadKey] = useState(0);
const retry = useCallback(() => setReloadKey((current) => current + 1), []);
```

The Reading loader uses:

```ts
useEffect(() => {
  let cancelled = false;
  setState("loading");
  setStats(null);
  void getReadingStats(period)
    .then((result) => {
      if (!cancelled) {
        setStats(result);
        setState("loaded");
      }
    })
    .catch(() => {
      if (!cancelled) setState("error");
    });
  return () => {
    cancelled = true;
  };
}, [period, getReadingStats, reloadKey]);
```

The Document loader uses:

```ts
useEffect(() => {
  let cancelled = false;
  setState("loading");
  setStats(null);
  void getDocStats(document.id, period)
    .then((result) => {
      if (!cancelled) {
        setStats(result);
        setState("loaded");
      }
    })
    .catch(() => {
      if (!cancelled) setState("error");
    });
  return () => {
    cancelled = true;
  };
}, [document.id, period, getDocStats, reloadKey]);
```

Pass `onRetry={retry}` to the right-panel error state. A retry changes only
the active page's `reloadKey`; it does not reload documents or change scope.

Reading aggregate renders:

- heading `All Reading`;
- primary metric strip: Active time, Sessions, Average session;
- secondary strip: Page visits, Unique pages, Revisits;
- embedded `ActivityChartCard` with `stats.buckets` and
  `stats.timeBuckets`.

Document detail accepts `document: LibraryDocument`, renders its title,
author/progress/status, then:

- the same primary and Reading metrics;
- document Heatmap/Graph;
- Coverage metric;
- Reviews metrics.

Reuse the existing formatting helpers, moving shared time/ratio formatting
into a small `formatters.ts` only if two files would otherwise duplicate the
exact function bodies. If created, add a focused `formatters.test.ts`.

- [ ] **Step 5: Implement `ReadingStatisticsWorkspace`**

Map documents:

```tsx
const items = documents.map((document) => ({
  id: document.id,
  label: document.title,
  description: document.author ?? undefined,
  meta: documentProgressLabel(document),
  searchText: `${document.title} ${document.author ?? ""}`,
  visual: document.coverUrl ? (
    <img alt="" src={convertFileSrc(document.coverUrl)} />
  ) : (
    <span className="statistics-entity-row__book-fallback" />
  ),
}));
```

Import `convertFileSrc` from `@tauri-apps/api/core`; Library cover paths are
local asset paths and must not be passed to `<img>` unconverted.

`documentProgressLabel` returns:

```ts
if (
  document.lastReadPage !== null &&
  document.numPages !== null &&
  document.numPages > 0
) {
  return `${Math.min(100, Math.round(
    (document.lastReadPage / document.numPages) * 100,
  ))}% read`;
}
return documentStatusLabel(document) || undefined;
```

Render `StatisticsMasterDetail`; `onSelect(null)` calls
`onSelectDocument(null)`. For a missing selected ID, render the unavailable
status and do not call `getDocumentStatistics`. For a valid selection, pass
the workspace loader through the existing page prop exactly as:

```tsx
<DocumentStatisticsPage
  document={selectedDocument}
  period={period}
  getDocStats={getDocumentStats}
/>
```

- [ ] **Step 6: Run Reading tests**

Run the command from Step 3.

Expected: PASS.

- [ ] **Step 7: Commit Reading master-detail**

```bash
git add apps/desktop/src/features/statistics/pages/ReadingStatisticsWorkspace.tsx \
  apps/desktop/src/features/statistics/pages/ReadingStatisticsWorkspace.test.tsx \
  apps/desktop/src/features/statistics/pages/ReadingStatisticsPage.tsx \
  apps/desktop/src/features/statistics/pages/ReadingStatisticsPage.test.tsx \
  apps/desktop/src/features/statistics/pages/DocumentStatisticsPage.tsx \
  apps/desktop/src/features/statistics/pages/DocumentStatisticsPage.test.tsx
git commit -m "feat: compose Reading statistics workspace"
```

## Task 7: Compose the Memora workspace and deck detail

**Files:**

- Create: `apps/desktop/src/features/statistics/pages/MemoraStatisticsWorkspace.tsx`
- Create: `apps/desktop/src/features/statistics/pages/MemoraStatisticsWorkspace.test.tsx`
- Modify: `apps/desktop/src/features/statistics/pages/MemoraStatisticsPage.tsx`
- Modify: `apps/desktop/src/features/statistics/pages/MemoraStatisticsPage.test.tsx`
- Modify: `apps/desktop/src/features/statistics/pages/DeckStatisticsPage.tsx`
- Modify: `apps/desktop/src/features/statistics/pages/DeckStatisticsPage.test.tsx`

- [ ] **Step 1: Add failing Memora aggregate/deck presentation tests**

Add a Memora `timeBuckets` fixture and assert:

```tsx
expect(await screen.findByRole("list", { name: "Memora summary" }))
  .toBeInTheDocument();
expect(screen.getByRole("button", { name: "Heatmap" })).toBeInTheDocument();
expect(screen.getByLabelText(/Rating distribution:/)).toBeInTheDocument();
expect(screen.getByText("Card states")).toBeInTheDocument();
expect(screen.getByText("Due forecast")).toBeInTheDocument();
expect(document.querySelectorAll(".statistics-kpi-card__icon")).toHaveLength(0);
```

Add deck assertions:

```tsx
expect(await screen.findByRole("heading", { name: "Biology" }))
  .toBeInTheDocument();
expect(screen.getByRole("button", { name: "Heatmap" })).toBeInTheDocument();
expect(screen.getByLabelText(/Rating distribution:/)).toBeInTheDocument();
expect(screen.queryByText("Active days")).toBeNull();
expect(screen.queryByText("Practice active time")).toBeNull();
```

Add explicit cancellation coverage:

```tsx
test("ignores a deck response after the selected deck changes", async () => {
  const first = deferred<DeckStatisticsDetail>();
  const second = deferred<DeckStatisticsDetail>();
  const getDeckStats = vi.fn()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  const { rerender } = render(
    <DeckStatisticsPage
      deckId="deck-a"
      deck={deckA}
      period={period}
      getDeckStats={getDeckStats}
    />,
  );
  rerender(
    <DeckStatisticsPage
      deckId="deck-b"
      deck={deckB}
      period={period}
      getDeckStats={getDeckStats}
    />,
  );
  second.resolve({
    ...deckStats,
    deckId: "deck-b",
    activeMs: 120_000,
  });
  const summary = await screen.findByRole("list", { name: "Memora summary" });
  expect(within(summary).getByText("2m")).toBeInTheDocument();

  first.resolve({
    ...deckStats,
    deckId: "deck-a",
    activeMs: 60_000,
  });
  await waitFor(() => {
    expect(within(summary).queryByText("1m")).toBeNull();
    expect(within(summary).getByText("2m")).toBeInTheDocument();
  });
});
```

Import `within` from Testing Library and `userEvent`; define this local helper
in `DeckStatisticsPage.test.tsx`:

```ts
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
```

Add period-refetch coverage for both aggregate and selected deck:

```tsx
test("refetches Memora aggregate statistics when the period changes", async () => {
  const week = { unit: "week" as const, anchorLocalDay: "2026-07-13" };
  const month = { unit: "month" as const, anchorLocalDay: "2026-07-01" };
  const getMemoraStats = vi.fn().mockResolvedValue(memoraStats);
  const { rerender } = render(
    <MemoraStatisticsPage period={week} getMemoraStats={getMemoraStats} />,
  );
  await waitFor(() => expect(getMemoraStats).toHaveBeenCalledWith(week));

  rerender(
    <MemoraStatisticsPage period={month} getMemoraStats={getMemoraStats} />,
  );
  await waitFor(() =>
    expect(getMemoraStats).toHaveBeenLastCalledWith(month),
  );
  expect(getMemoraStats).toHaveBeenCalledTimes(2);
});

test("refetches the selected deck when the period changes", async () => {
  const week = { unit: "week" as const, anchorLocalDay: "2026-07-13" };
  const month = { unit: "month" as const, anchorLocalDay: "2026-07-01" };
  const getDeckStats = vi.fn().mockResolvedValue(deckStats);
  const { rerender } = render(
    <DeckStatisticsPage
      deckId="deck-a"
      deck={deckA}
      period={week}
      getDeckStats={getDeckStats}
    />,
  );
  await waitFor(() =>
    expect(getDeckStats).toHaveBeenCalledWith("deck-a", week),
  );

  rerender(
    <DeckStatisticsPage
      deckId="deck-a"
      deck={deckA}
      period={month}
      getDeckStats={getDeckStats}
    />,
  );
  await waitFor(() =>
    expect(getDeckStats).toHaveBeenLastCalledWith("deck-a", month),
  );
  expect(getDeckStats).toHaveBeenCalledTimes(2);
});
```

Add right-panel retry coverage for the Memora family:

```tsx
test("retries only the active Memora statistics request", async () => {
  const user = userEvent.setup();
  const period = { unit: "week" as const, anchorLocalDay: "2026-07-13" };
  const getMemoraStats = vi.fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(memoraStats);
  render(
    <MemoraStatisticsPage
      period={period}
      getMemoraStats={getMemoraStats}
    />,
  );

  await user.click(await screen.findByRole("button", { name: "Retry" }));
  expect(await screen.findByRole("list", { name: "Memora summary" }))
    .toBeInTheDocument();
  expect(getMemoraStats).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Write failing Memora workspace list tests**

Add:

```tsx
test("loads decks once and switches detail scope without losing the list", async () => {
  const user = userEvent.setup();
  const listDecks = vi.fn().mockResolvedValue([deckA, deckB]);
  const onSelectDeck = vi.fn();
  render(
    <MemoraStatisticsWorkspace
      listDecks={listDecks}
      selectedDeckId={null}
      onSelectDeck={onSelectDeck}
      period={period}
      getMemoraStats={getMemoraStats}
      getDeckStats={getDeckStats}
    />,
  );

  expect(await screen.findByRole("button", { name: /Deck A/ }))
    .toBeInTheDocument();
  expect(listDecks).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button", { name: /Deck A/ }));
  expect(onSelectDeck).toHaveBeenCalledWith("deck-a");
  expect(screen.getByRole("navigation", { name: "Memora statistics scopes" }))
    .toBeInTheDocument();
});

test("keeps aggregate statistics usable when the deck list fails", async () => {
  const user = userEvent.setup();
  const listDecks = vi.fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce([deckA]);
  render(
    <MemoraStatisticsWorkspace
      listDecks={listDecks}
      selectedDeckId={null}
      onSelectDeck={vi.fn()}
      period={period}
      getMemoraStats={getMemoraStats}
      getDeckStats={getDeckStats}
    />,
  );

  expect(await screen.findByRole("button", { name: "Retry scopes" }))
    .toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "All Memora" }))
    .toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Retry scopes" }));
  expect(await screen.findByRole("button", { name: /Deck A/ }))
    .toBeInTheDocument();
  expect(listDecks).toHaveBeenCalledTimes(2);
});

test("loads a deep-linked deck by ID while its list metadata is pending", () => {
  const listDecks = vi.fn(
    () => new Promise<Deck[]>(() => undefined),
  );
  render(
    <MemoraStatisticsWorkspace
      listDecks={listDecks}
      selectedDeckId="deck-a"
      onSelectDeck={vi.fn()}
      period={period}
      getMemoraStats={getMemoraStats}
      getDeckStats={getDeckStats}
    />,
  );
  expect(screen.getByRole("heading", { name: "Deck statistics" }))
    .toBeInTheDocument();
  expect(getDeckStats).toHaveBeenCalledWith("deck-a", period);
});
```

- [ ] **Step 3: Run Memora tests and verify RED**

Run:

```bash
cd apps/desktop
npm test -- \
  src/features/statistics/pages/MemoraStatisticsPage.test.tsx \
  src/features/statistics/pages/DeckStatisticsPage.test.tsx \
  src/features/statistics/pages/MemoraStatisticsWorkspace.test.tsx
```

Expected: FAIL because the workspace and compact content do not exist.

- [ ] **Step 4: Refactor Memora and Deck pages**

Both Memora-family pages own the same local retry mechanism:

```ts
const [reloadKey, setReloadKey] = useState(0);
const retry = useCallback(() => setReloadKey((current) => current + 1), []);
```

The Memora loader calls `getMemoraStats(period)` inside a cancellation-guarded
effect:

```ts
useEffect(() => {
  let cancelled = false;
  setState("loading");
  setStats(null);
  void getMemoraStats(period)
    .then((result) => {
      if (!cancelled) {
        setStats(result);
        setState("loaded");
      }
    })
    .catch(() => {
      if (!cancelled) setState("error");
    });
  return () => {
    cancelled = true;
  };
}, [period, getMemoraStats, reloadKey]);
```

The Deck loader calls `getDeckStats(deckId, period)`:

```ts
useEffect(() => {
  let cancelled = false;
  setState("loading");
  setStats(null);
  void getDeckStats(deckId, period)
    .then((result) => {
      if (!cancelled) {
        setStats(result);
        setState("loaded");
      }
    })
    .catch(() => {
      if (!cancelled) setState("error");
    });
  return () => {
    cancelled = true;
  };
}, [deckId, period, getDeckStats, reloadKey]);
```

Pass `onRetry={retry}` to the active right-panel error state. Do not connect
this retry to `listDecks`.

Memora aggregate renders:

- heading `All Memora`;
- summary: Active time, Sessions, Reviews, Recall rate;
- embedded Activity with `timeBuckets`;
- `RatingDistribution`;
- Card states compact strip;
- Performance strip: Practice active time, Average answer time, Lapse rate,
  Active days;
- Due forecast strip.

Deck detail accepts `deck?: Deck`, uses `deck?.name ?? "Deck statistics"` and
renders:

- summary: Active time, Sessions, Reviews, Recall rate;
- embedded scoped Activity;
- Rating distribution;
- Card states;
- Performance: Average answer time and Lapse rate;
- Due forecast.

- [ ] **Step 5: Implement deck list ownership**

`MemoraStatisticsWorkspace` owns:

```ts
const [decks, setDecks] = useState<Deck[]>([]);
const [listState, setListState] =
  useState<"loading" | "loaded" | "error">("loading");
const deckRequestId = useRef(0);

const loadDecks = useCallback(async () => {
  const requestId = ++deckRequestId.current;
  setListState("loading");
  try {
    const result = await listDecks();
    if (requestId !== deckRequestId.current) return;
    setDecks(result);
    setListState("loaded");
  } catch {
    if (requestId === deckRequestId.current) {
      setListState("error");
    }
  }
}, [listDecks]);

useEffect(() => {
  void loadDecks();
  return () => {
    deckRequestId.current += 1;
  };
}, [loadDecks]);
```

Pass `onRetry={() => void loadDecks()}` to `StatisticsMasterDetail`. This same
request function serves initial load and retry, while the request ID prevents a
slower initial request from overwriting a newer retry or unmounted workspace.

Map each deck:

```tsx
{
  id: deck.id,
  label: deck.name,
  description: deck.description ?? undefined,
  meta: deck.archived ? "Archived" : undefined,
  searchText: `${deck.name} ${deck.description ?? ""}`,
  visual: deck.color ? (
    <span
      aria-hidden="true"
      className="statistics-entity-row__deck-swatch"
      style={{ backgroundColor: deck.color }}
    />
  ) : undefined,
}
```

The only allowed inline raw color is the user-owned `deck.color` value already
stored in the domain; Statistics CSS still uses tokens.

- [ ] **Step 6: Run Memora tests**

Run the command from Step 3.

Expected: PASS.

- [ ] **Step 7: Commit Memora master-detail**

```bash
git add apps/desktop/src/features/statistics/pages/MemoraStatisticsWorkspace.tsx \
  apps/desktop/src/features/statistics/pages/MemoraStatisticsWorkspace.test.tsx \
  apps/desktop/src/features/statistics/pages/MemoraStatisticsPage.tsx \
  apps/desktop/src/features/statistics/pages/MemoraStatisticsPage.test.tsx \
  apps/desktop/src/features/statistics/pages/DeckStatisticsPage.tsx \
  apps/desktop/src/features/statistics/pages/DeckStatisticsPage.test.tsx
git commit -m "feat: compose Memora statistics workspace"
```

## Task 8: Wire built-in scopes, metadata, origin-aware Back, and registry fallback

**Files:**

- Modify: `apps/desktop/src/features/statistics/StatisticsPage.tsx`
- Test: `apps/desktop/src/features/statistics/StatisticsPage.test.tsx`
- Modify: `apps/desktop/src/app/App.tsx`
- Test: `apps/desktop/src/app/App.test.tsx`
- Verify: `apps/desktop/src/app/commandRegistry.test.ts`

- [ ] **Step 1: Add failing Statistics coordinator tests**

Create built-in document/deck fixtures and add:

```tsx
test("maps document and deck targets into their persistent app workspaces", async () => {
  const { rerender } = render(
    <StatisticsPage
      documents={[documentA]}
      documentsLoading={false}
      listDecks={vi.fn().mockResolvedValue([deckA])}
      target={{ kind: "document", documentId: "doc-a" }}
    />,
  );
  expect(await screen.findByRole("navigation", {
    name: "Reading statistics scopes",
  })).toBeInTheDocument();

  rerender(
    <StatisticsPage
      documents={[documentA]}
      documentsLoading={false}
      listDecks={vi.fn().mockResolvedValue([deckA])}
      target={{ kind: "deck", deckId: "deck-a" }}
    />,
  );
  expect(await screen.findByRole("navigation", {
    name: "Memora statistics scopes",
  })).toBeInTheDocument();
});

test("returns to the recorded origin instead of swallowing Back in item scope", async () => {
  const user = userEvent.setup();
  const onBack = vi.fn();
  render(
    <StatisticsPage
      origin="library"
      onBack={onBack}
      documents={[documentA]}
      documentsLoading={false}
      listDecks={vi.fn().mockResolvedValue([])}
      target={{ kind: "document", documentId: "doc-a" }}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(onBack).toHaveBeenCalledOnce();
});

test("returns built-in app pages to Statistics overview when no origin exists", async () => {
  const user = userEvent.setup();
  render(
    <StatisticsPage
      documents={[]}
      documentsLoading={false}
      listDecks={vi.fn().mockResolvedValue([])}
      target={{ kind: "app", appKey: "reading" }}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(await screen.findByRole("heading", { name: "Statistics" }))
    .toBeInTheDocument();
});

test("keeps non-built-in registered apps on the generic detail page", async () => {
  const custom = {
    key: "custom",
    title: "Custom",
    tagline: "Custom stats",
    icon: () => null,
    loadSummary: vi.fn(),
    loadDetail: vi.fn().mockResolvedValue({
      appKey: "custom",
      metrics: [],
      buckets: [],
    }),
  };
  render(<StatisticsPage target={{ kind: "app", appKey: "custom" }} apps={[custom]} />);
  await waitFor(() => expect(custom.loadDetail).toHaveBeenCalled());
});
```

- [ ] **Step 2: Add failing App route tests**

Keep the existing `navigates to Statistics via sidebar button` test unchanged;
it pins the approved Overview entry behavior.

Extend existing Library and Deck `View statistics` tests to assert:

```tsx
const readingScopes = await screen.findByRole("navigation", {
  name: "Reading statistics scopes",
});
expect(readingScopes).toBeInTheDocument();
expect(within(readingScopes).getByRole("button", { name: document.title }))
  .toHaveAttribute("aria-current", "page");
```

and:

```tsx
const memoraScopes = await screen.findByRole("navigation", {
  name: "Memora statistics scopes",
});
expect(memoraScopes).toBeInTheDocument();
expect(within(memoraScopes).getByRole("button", { name: deck.name }))
  .toHaveAttribute("aria-current", "page");
```

Import `within`. After clicking global Back, assert Library or Memora content
is visible.

- [ ] **Step 3: Run coordinator tests and verify RED**

Run:

```bash
cd apps/desktop
npm test -- \
  src/features/statistics/StatisticsPage.test.tsx \
  src/app/App.test.tsx
```

Expected: FAIL because Statistics does not accept entity sources or render
built-in workspaces.

- [ ] **Step 4: Update `StatisticsPage` coordination**

Add props:

```ts
documents?: LibraryDocument[];
documentsLoading?: boolean;
listDecks?: () => Promise<Deck[]>;
```

Use safe defaults:

```ts
const NO_DOCUMENTS: LibraryDocument[] = [];
const EMPTY_DECK_LOADER = async (): Promise<Deck[]> => [];
```

Derive the built-in workspace:

```ts
const activeAppKey =
  view.kind === "document"
    ? "reading"
    : view.kind === "deck"
      ? "memora"
      : view.kind === "app"
        ? view.appKey
        : null;
```

Render Reading for `activeAppKey === "reading"` and Memora for
`activeAppKey === "memora"`. Selection callbacks set:

```ts
setView(documentId
  ? { kind: "document", documentId }
  : { kind: "app", appKey: "reading" });

setView(deckId
  ? { kind: "deck", deckId }
  : { kind: "app", appKey: "memora" });
```

Back behavior:

```ts
const handleBack = useCallback(() => {
  if (origin) {
    onBack?.();
    return;
  }
  if (view.kind !== "overview") {
    setView({ kind: "overview" });
    return;
  }
  onBack?.();
}, [origin, onBack, view.kind]);
```

Keep `RegisteredAppStatisticsPage` for a non-built-in `app` view.

- [ ] **Step 5: Pass App-owned data sources**

In `App.tsx`:

```tsx
<StatisticsPage
  documents={documents ?? []}
  documentsLoading={loading}
  listDecks={learning.listDecks}
  target={route.target}
  origin={route.origin}
  onBack={() => {
    if (route.origin === "memora") setRoute({ name: "memora" });
    else setRoute({ name: "library" });
  }}
/>
```

Do not add the scoped selections to `PUBLIC_ROUTE_CATALOG` or
`commandRegistry.ts`.

- [ ] **Step 6: Run route, registry, and App tests**

Run:

```bash
cd apps/desktop
npm test -- \
  src/features/statistics/StatisticsPage.test.tsx \
  src/app/App.test.tsx \
  src/app/commandRegistry.test.ts \
  src/features/search/CommandPalette.test.tsx
```

Expected: PASS. Existing `route.statistics` Quick Open coverage remains the
single public destination.

- [ ] **Step 7: Commit coordinator wiring**

```bash
git add apps/desktop/src/features/statistics/StatisticsPage.tsx \
  apps/desktop/src/features/statistics/StatisticsPage.test.tsx \
  apps/desktop/src/app/App.tsx \
  apps/desktop/src/app/App.test.tsx
git commit -m "feat: route statistics through app workspaces"
```

## Task 9: Apply the approved visual hierarchy, responsive collapse, and scroll contract

**Files:**

- Modify: `apps/desktop/src/features/statistics/statistics.css`
- Test: `apps/desktop/src/styles/tokens.test.ts`
- Test: `apps/desktop/src/features/statistics/components/StatisticsShell.test.tsx`
- Test: `apps/desktop/src/features/statistics/components/StatisticsMasterDetail.test.tsx`

- [ ] **Step 1: Add failing CSS invariant assertions**

In `tokens.test.ts`, add one focused test that reads `statistics.css`:

```ts
test("pins the Statistics master detail and WKWebView inset contract", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(
    join(currentDir, "../features/statistics/statistics.css"),
    "utf8",
  );
  const workspace = css.match(
    /\.statistics-master-detail\s*\{([^}]*)\}/,
  )?.[1] ?? "";
  const entityContent = css.match(
    /\.statistics-entity-pane__scroll-content\s*\{([^}]*)\}/,
  )?.[1] ?? "";
  const metricStrip = css.match(
    /\.statistics-metric-strip\s*\{([^}]*)\}/,
  )?.[1] ?? "";
  const detailSection = css.match(
    /\.statistics-detail-section\s*\{([^}]*)\}/,
  )?.[1] ?? "";
  const embeddedActivity = css.match(
    /\.statistics-activity-card--embedded\s*\{([^}]*)\}/,
  )?.[1] ?? "";

  expect(workspace).toContain(
    "grid-template-columns: 272px minmax(0, 1fr);",
  );
  expect(workspace).toContain("gap: 18px;");
  expect(entityContent).toContain("padding-right: 20px;");
  expect(metricStrip).not.toContain("min-height: 156px;");
  expect(detailSection).not.toMatch(/background|box-shadow|border-radius/);
  expect(embeddedActivity).toContain("background: transparent;");
  expect(embeddedActivity).toContain("box-shadow: none;");
  expect(css).toContain("@media (max-width: 1180px)");
  expect(css).toContain("@media (max-width: 480px)");
  expect(css).toMatch(
    /@media \(max-width: 720px\)[\s\S]*?\.statistics-control\s*\{[^}]*min-height: 36px;/,
  );
  expect(css).not.toMatch(/\boverflow(?:-y)?\s*:\s*(?:auto|scroll)\s*;/);
  expect(css).not.toMatch(/::-webkit-scrollbar/);
  expect(css).not.toMatch(/linear-gradient|radial-gradient|conic-gradient/);
  expect(css).not.toMatch(/overflow-x\s*:\s*(auto|scroll)/);
  expect(css).not.toContain("width: max-content");
});
```

Extend the existing shell inset test to keep the outer `20px` right padding at
all breakpoints.

- [ ] **Step 2: Run token/layout tests and verify RED**

Run:

```bash
cd apps/desktop
npm test -- \
  src/styles/tokens.test.ts \
  src/features/statistics/components/StatisticsShell.test.tsx \
  src/features/statistics/components/StatisticsMasterDetail.test.tsx
```

Expected: FAIL because the master-detail styles do not exist.

- [ ] **Step 3: Add desktop workspace and pane styles**

Add token-based styles:

```css
.statistics-master-detail {
  display: grid;
  grid-template-columns: 272px minmax(0, 1fr);
  gap: 18px;
  align-items: start;
  min-width: 0;
}

.statistics-entity-pane,
.statistics-detail-pane {
  min-width: 0;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  background: var(--surface-1);
  box-shadow: var(--shadow-card);
}

.statistics-entity-pane {
  position: sticky;
  top: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  max-height: calc(100vh - 176px);
  padding: 12px 0 12px 12px;
}

.statistics-entity-pane__scroll {
  min-height: 0;
}

.statistics-entity-pane__scroll-content {
  display: grid;
  gap: 4px;
  padding-right: 20px;
}

.statistics-detail-pane {
  padding: 20px;
}

.statistics-scope-picker {
  display: none;
}
```

Keep search outside the entity `ScrollArea`. Entity row selected backgrounds,
text, and focus rings must remain inside the padded content.

- [ ] **Step 4: Add compact hierarchy styles**

Implement:

```css
.statistics-metric-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  margin: 0;
  padding: 16px 0;
  border-block: 1px solid var(--border-subtle);
}

.statistics-metric-strip__item {
  min-width: 0;
  padding: 0 16px;
}

.statistics-metric-strip__item + .statistics-metric-strip__item {
  border-left: 1px solid var(--border-subtle);
}

.statistics-metric-strip dt {
  color: var(--text-secondary);
  font-size: 13px;
}

.statistics-metric-strip dd {
  margin: 7px 0 0;
  color: var(--text-primary);
  font-size: clamp(20px, 2vw, 24px);
  font-weight: 700;
}

.statistics-metric-strip__item[data-emphasis="primary"] dd {
  font-size: clamp(24px, 2.2vw, 30px);
}

.statistics-detail-section {
  padding-top: 24px;
}

.statistics-detail-section + .statistics-detail-section {
  margin-top: 24px;
  border-top: 1px solid var(--border-subtle);
}

.statistics-activity-card--embedded {
  padding: 24px 0 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}
```

Add entity rows, covers, deck swatches, Rating segments, unavailable/loading,
and focus styles using only existing surface/text/border/focus tokens and
`var(--statistics-accent)`.

- [ ] **Step 5: Add collapse and mobile styles**

```css
@media (max-width: 1180px) {
  .statistics-master-detail {
    grid-template-columns: minmax(0, 1fr);
  }

  .statistics-entity-pane {
    display: none;
  }

  .statistics-scope-picker {
    display: block;
    margin-bottom: 14px;
  }
}

@media (max-width: 720px) {
  .statistics-detail-pane {
    padding: 16px;
  }

  .statistics-metric-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .statistics-control {
    min-height: 36px;
  }
}

@media (max-width: 480px) {
  .statistics-metric-strip {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

For an odd final metric in the two-column mobile strip, keep its normal width;
do not span it across columns.

- [ ] **Step 6: Run layout, chart, token, and scroll tests**

Run:

```bash
cd apps/desktop
npm test -- \
  src/features/statistics/components \
  src/features/statistics/pages \
  src/features/statistics/StatisticsPage.test.tsx \
  src/components/ScrollArea.test.tsx \
  src/styles/tokens.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run forbidden-pattern scans**

From the worktree root:

```bash
rg -n \
  'linear-gradient|radial-gradient|conic-gradient|overflow(-y)?[[:space:]]*:[[:space:]]*(auto|scroll)|overflow-x[[:space:]]*:[[:space:]]*(auto|scroll)|width[[:space:]]*:[[:space:]]*max-content|::-webkit-scrollbar' \
  apps/desktop/src/features/statistics
```

Expected: exit 1 with no matches.

Run:

```bash
rg -n \
  'statistics-kpi-card__icon|IconChartBar' \
  apps/desktop/src/features/statistics/pages
```

Expected: exit 1 with no built-in page matches.

- [ ] **Step 8: Commit the visual system**

```bash
git add apps/desktop/src/features/statistics/statistics.css \
  apps/desktop/src/styles/tokens.test.ts \
  apps/desktop/src/features/statistics/components/StatisticsShell.test.tsx \
  apps/desktop/src/features/statistics/components/StatisticsMasterDetail.test.tsx
git commit -m "style: refine app statistics hierarchy"
```

## Task 10: Complete automated verification

**Files:**

- Modify only if failures expose a real regression:
  - `apps/desktop/src/components/ScrollArea.tsx`
  - `apps/desktop/src/components/ScrollArea.test.tsx`
  - affected Statistics source/test files

- [ ] **Step 1: Run focused Statistics and contract tests**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml statistics_tests
cd apps/desktop
npm test -- \
  src/lib/statistics.test.ts \
  src/features/statistics \
  src/components/ScrollArea.test.tsx \
  src/styles/tokens.test.ts \
  src/app/commandRegistry.test.ts
```

Expected: all focused Rust and frontend tests pass.

- [ ] **Step 2: Run the full Rust test suite**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

Expected: PASS.

- [ ] **Step 3: Run the complete frontend suite in isolation**

Ensure no other Vitest process is running, then:

```bash
cd apps/desktop
npm test
```

Expected: PASS. Record file and test counts for `design-qa.md`.

- [ ] **Step 4: Run the production frontend build**

```bash
cd apps/desktop
npm run build
```

Expected: `tsc && vite build` exits 0. Record the module count, duration, and
any existing large-chunk warning without treating the warning as failure.

- [ ] **Step 5: Run repository integrity checks**

From the worktree root:

```bash
git diff --check
git status --short
```

Expected: `git diff --check` has no output. Status contains only intended
source/test changes plus the pre-existing Vitest cache file.

- [ ] **Step 6: Resolve verification failures at their owning task boundary**

If Steps 1–5 expose a failure, return to the task that owns the failing file,
add a regression test there, rerun that task's exact focused command, and use
that task's exact `git add` list. Do not create an empty verification commit
and do not stage the Vitest cache file.

## Task 11: Perform fresh WKWebView verification and record evidence

**Files:**

- Modify: `design-qa.md`

- [ ] **Step 1: Record the exact source state**

```bash
git rev-parse --short HEAD
git status --short
ps aux | rg 'tauri dev|vite|library_desktop' || true
```

Record the commit and dirty files. Do not silently reuse a matching-looking
window or process.

- [ ] **Step 2: Start a fresh development runtime from this checkout**

From `apps/desktop`:

```bash
npm run tauri dev
```

Launch mode is `tauri dev`. The tested source is the current worktree, not
`/Applications/Library.app`. Do not overwrite the installed app.

- [ ] **Step 3: Verify the approved desktop states**

In the fresh app, inspect:

1. Statistics Overview is unchanged.
2. Reading opens with All Reading selected.
3. Reading search filters by title and author.
4. A long Reading list uses the custom thumb with no white track.
5. Selected-row text, focus ring, and background end before the thumb.
6. Wheel input over the entity list scrolls it; at its boundary, the outer
   Statistics page continues scrolling.
7. Document selection updates only the right panel.
8. Document Heatmap/Graph and period changes are scoped correctly.
9. Memora list, deck selection, Heatmap/Graph, rating distribution, card
   states, performance, and due forecast render correctly.
10. Library/Memora context entry preselects the item and Back returns to the
    origin.
11. Statistics-origin Back returns to Statistics Overview.
12. Light and dark themes use token-correct surfaces and the approved blue.
13. Above `1180px`, the `272px` master pane is visible.
14. At or below `1180px`, the searchable scope picker replaces the pane.
15. At mobile/narrow width, controls remain usable and no horizontal scroll
    appears.

Capture comparison screenshots at the same state and viewport as the selected
concept when practical. If the concept cannot be matched exactly because it
contains invented metadata, compare structure, density, hierarchy, and
selected state against the specification instead.

- [ ] **Step 4: Update `design-qa.md`**

Append a dated section containing:

- tested commit;
- dirty scope;
- launch mode `tauri dev`;
- exact checkout path
  `/Users/jason/project/corelib/.worktrees/statistics`;
- automated command results and counts;
- light/dark and long-list observations;
- tested viewport widths;
- screenshot paths if captured;
- any visible mismatch and its resolution.

Set:

```text
final result: passed
```

only when the fresh runtime checks pass. If runtime cannot be launched or a
required state cannot be inspected, keep:

```text
final result: blocked
```

and state the precise missing evidence.

- [ ] **Step 5: Commit the QA record**

```bash
git add design-qa.md
git commit -m "docs: verify statistics master detail"
```

## Task 12: Final handoff audit

**Files:**

- Verify: all files listed in this plan
- Verify: `docs/superpowers/specs/2026-07-24-statistics-app-master-detail-redesign-design.md`
- Verify: `design-qa.md`

- [ ] **Step 1: Map every acceptance criterion to evidence**

Read the design spec's Acceptance criteria and confirm each item maps to:

- a Rust/TypeScript/component/CSS test;
- a runtime observation where WKWebView behavior is involved;
- or an explicit non-applicable statement for unchanged Overview behavior.

Add a missing test before proceeding if any behavior has no evidence.

- [ ] **Step 2: Re-run final checks from a clean test process**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
cd apps/desktop
npm test
npm run build
cd ../..
git diff --check
git status --short
```

Expected: all test/build commands pass; diff check is clean; status contains no
uncommitted implementation files.

- [ ] **Step 3: Report the tested revision precisely**

The final implementation handoff must state:

- current commit from `git rev-parse --short HEAD`;
- launch mode (`tauri dev`);
- exact tested checkout path;
- whether a release `.app` was built (this plan does not require one);
- automated test/build counts;
- any remaining dirty user-owned file;
- that no installed `/Applications/Library.app` was used.

Do not claim WKWebView behavior was verified from unit tests, Vite build, the
original screenshot, the generated concept, or an older running window.
