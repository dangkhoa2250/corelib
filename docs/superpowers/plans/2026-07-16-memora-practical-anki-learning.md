# Memora Practical Anki-Like Learning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Memora's UI-filtered review flow with a backend-owned study queue that supports fixed learning/relearning steps, reliable FSRS scheduling, configurable new-card limits, session-safe ratings, and consequence-free practice.

**Architecture:** Rust owns Memora settings, queue eligibility, study-session grants, scheduling transitions, and atomic persistence. React consumes typed session payloads, renders real-study and practice modes separately, and exposes global settings at `Settings → Apps → Memora` plus per-deck new-card overrides.

**Tech Stack:** Tauri 2, Rust, SQLite/rusqlite, fsrs-rs 6.6.0, chrono, React 19, TypeScript, Vitest, Testing Library, Playwright.

**Execution prerequisite:** Run the implementation in a dedicated git worktree created with `superpowers:using-git-worktrees`; do not implement directly on `main`.

---

## File map

### New files

- `apps/desktop/src-tauri/migrations/0010_memora_study.sql` — settings, learning progress, introduction accounting, and session/grant schema.
- `apps/desktop/src-tauri/src/study_queue.rs` — settings resolution, queue construction, session refresh, and atomic session rating.
- `apps/desktop/src-tauri/src/study_queue_tests.rs` — deterministic queue, limit, session, and rating tests.
- `apps/desktop/src/features/settings/MemoraSettingsSection.tsx` — global Memora settings form.
- `apps/desktop/src/features/settings/MemoraSettingsSection.test.tsx` — settings validation and Advanced disclosure tests.
- `apps/desktop/src/features/memora/DeckLearningSettingsDialog.tsx` — per-deck inherit/custom limit dialog.
- `apps/desktop/src/features/memora/DeckLearningSettingsDialog.test.tsx` — deck override behavior tests.

### Modified files

- `apps/desktop/src-tauri/src/library_db.rs` — register migration `0010_memora_study`.
- `apps/desktop/src-tauri/src/library_db_tests.rs` — current-schema upgrade and data-preservation tests.
- `apps/desktop/src-tauri/src/lib.rs` — register `study_queue`, tests, and Tauri commands.
- `apps/desktop/src-tauri/src/model.rs` — settings, scope, session, grant, and rating payload contracts.
- `apps/desktop/src-tauri/src/learning.rs` — hydrate/persist `learning_step`; keep lifecycle operations consistent.
- `apps/desktop/src-tauri/src/learning_tests.rs` — suspend/unsuspend and migrated learning-step regression tests.
- `apps/desktop/src-tauri/src/scheduler.rs` — fixed learning policy plus FSRS long-term transitions.
- `apps/desktop/src-tauri/src/scheduler_tests.rs` — full lifecycle × rating matrix.
- `apps/desktop/src-tauri/src/commands.rs` — settings/session commands; remove unrestricted production rating path.
- `apps/desktop/src-tauri/src/commands_tests.rs` — command payload and recoverable-error tests.
- `apps/desktop/src/domain/learning.ts` — frontend study/settings contracts.
- `apps/desktop/src/domain/learning.test.ts` — runtime-independent contract helpers.
- `apps/desktop/src/lib/learning.ts` — typed Tauri bridge for settings and sessions.
- `apps/desktop/src/lib/learning.test.ts` — exact command/argument contract tests.
- `apps/desktop/src/app/App.tsx` — real-study session route and practice separation.
- `apps/desktop/src/app/App.test.tsx` — session-based Review Today/Study Deck integration tests.
- `apps/desktop/src/features/review/ReviewPage.tsx` — dynamic queue refresh, next-due state, and practice notice.
- `apps/desktop/src/features/review/ReviewPage.test.tsx` — refresh, retry, practice, and completion tests.
- `apps/desktop/src/features/settings/SettingsPage.tsx` — `Apps → Memora` navigation and section composition.
- `apps/desktop/src/features/settings/SettingsPage.test.tsx` — Apps navigation/search integration tests.
- `apps/desktop/src/features/memora/MemoraPage.tsx` — deck Learning settings menu item and ready-count source.
- `apps/desktop/src/features/memora/MemoraPage.test.tsx` — deck settings menu integration tests.
- `apps/desktop/src/styles/tokens.css` — settings fields, disclosure, dialog, notices, and waiting-state styles.
- `apps/desktop/tests/e2e/learning.spec.ts` — session study, settings, per-deck override, and practice persistence scenarios.
- `apps/desktop/README.md` — document the practical Memora learning behavior.

## Shared contracts used throughout the plan

Use these TypeScript contracts as the canonical frontend names:

```ts
export interface MemoraSettings {
  newCardsPerDay: number;
  desiredRetention: number;
}

export interface DeckLearningSettings {
  deckId: string;
  inheritedNewCardsPerDay: number;
  newCardsPerDay: number | null;
  effectiveNewCardsPerDay: number;
}

export type StudyScope =
  | { kind: "all" }
  | { kind: "deck"; deckId: string };

export interface StudyGrant {
  grantToken: string;
  expectedState: CardState;
  expectedDueAt: string;
  card: LearningCard;
  preview: ReviewPreview;
}

export interface StudySession {
  sessionId: string;
  scope: StudyScope;
  cards: StudyGrant[];
  counts: {
    learning: number;
    review: number;
    new: number;
  };
  nextLearningDueAt: string | null;
}

export interface StudyRatingInput {
  sessionId: string;
  cardId: string;
  grantToken: string;
  expectedState: CardState;
  expectedDueAt: string;
  rating: ReviewRating;
  elapsedMs: number;
}

export interface StudyRatingResult {
  card: LearningCard;
  reviewLogId: string;
}
```

Use `learningStep: number | null` on `LearningCard`. Rust payloads use `#[serde(rename_all = "camelCase")]` so the same field names cross the Tauri boundary.

---

### Task 1: Add the Memora study schema and safe migration

**Files:**
- Create: `apps/desktop/src-tauri/migrations/0010_memora_study.sql`
- Modify: `apps/desktop/src-tauri/src/library_db.rs`
- Modify: `apps/desktop/src-tauri/src/library_db_tests.rs`

- [ ] **Step 1: Write a failing current-schema upgrade test**

Add a test that builds the existing migrations through `0009_page_tags`, inserts representative cards, then opens `LibraryDatabase` and verifies the new schema and preserved data:

```rust
#[test]
fn memora_study_migration_preserves_existing_cards_and_adds_defaults() {
    let directory = tempdir().expect("temporary directory");
    let database_path = directory.path().join("library.sqlite3");
    let connection = Connection::open(&database_path).expect("open legacy database");

    connection
        .execute_batch("CREATE TABLE schema_migrations (id TEXT PRIMARY KEY NOT NULL);")
        .expect("create migration table");
    for (id, sql) in [
        ("0001_library", include_str!("../migrations/0001_library.sql")),
        ("0002_index_claims", include_str!("../migrations/0002_index_claims.sql")),
        ("0003_drive_source", include_str!("../migrations/0003_drive_source.sql")),
        ("0004_learning", include_str!("../migrations/0004_learning.sql")),
        ("0005_learning_source_integrity", include_str!("../migrations/0005_learning_source_integrity.sql")),
        ("0006_card_lifecycle", include_str!("../migrations/0006_card_lifecycle.sql")),
        ("0007_youglish_clickable", include_str!("../migrations/0007_youglish_clickable.sql")),
        ("0008_page_count", include_str!("../migrations/0008_page_count.sql")),
        ("0009_page_tags", include_str!("../migrations/0009_page_tags.sql")),
    ] {
        connection.execute_batch(sql).expect("apply legacy migration");
        connection
            .execute("INSERT INTO schema_migrations(id) VALUES(?1)", params![id])
            .expect("record migration");
    }

    let now = "2026-07-16T00:00:00.000Z";
    connection.execute(
        "INSERT INTO decks(id,name,created_at,updated_at) VALUES('deck-1','Biology',?1,?1)",
        params![now],
    ).expect("insert deck");
    connection.execute(
        "INSERT INTO cards(
           id,deck_id,front,back,state,due_at,stability,difficulty,memory_state_json,
           reps,lapses,last_review_at,created_at,updated_at
         ) VALUES(
           'review-1','deck-1','Q','A','review',?1,3.5,5.0,
           '{\"stability\":3.5,\"difficulty\":5.0}',4,1,?1,?1,?1
         )",
        params![now],
    ).expect("insert review card");
    drop(connection);

    let database = LibraryDatabase::open(directory.path()).expect("upgrade database");
    let settings: (i64, f64) = database.connection.query_row(
        "SELECT new_cards_per_day, desired_retention FROM memora_settings WHERE id = 1",
        [],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).expect("read defaults");
    assert_eq!(settings, (20, 0.90));

    let card: (String, Option<i64>, f64, i64) = database.connection.query_row(
        "SELECT state, learning_step, stability, reps FROM cards WHERE id='review-1'",
        [],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    ).expect("read migrated card");
    assert_eq!(card, ("review".into(), None, 3.5, 4));
}
```

- [ ] **Step 2: Run the migration test and verify it fails**

Run:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml memora_study_migration_preserves_existing_cards_and_adds_defaults
```

Expected: FAIL because `memora_settings` and `cards.learning_step` do not exist.

- [ ] **Step 3: Create migration `0010_memora_study.sql`**

Use this schema:

```sql
ALTER TABLE cards
  ADD COLUMN learning_step INTEGER
  CHECK (learning_step IS NULL OR learning_step IN (0, 1));

CREATE TABLE memora_settings (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  new_cards_per_day INTEGER NOT NULL CHECK (new_cards_per_day BETWEEN 0 AND 999),
  desired_retention REAL NOT NULL CHECK (desired_retention BETWEEN 0.80 AND 0.97),
  updated_at TEXT NOT NULL
);

INSERT INTO memora_settings(id, new_cards_per_day, desired_retention, updated_at)
VALUES(1, 20, 0.90, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

CREATE TABLE deck_learning_settings (
  deck_id TEXT PRIMARY KEY NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  new_cards_per_day INTEGER NOT NULL CHECK (new_cards_per_day BETWEEN 0 AND 999),
  updated_at TEXT NOT NULL
);

CREATE TABLE card_introductions (
  card_id TEXT PRIMARY KEY NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  study_day TEXT NOT NULL,
  introduced_at TEXT NOT NULL
);

CREATE INDEX card_introductions_deck_day
  ON card_introductions(deck_id, study_day);

CREATE TABLE study_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('all', 'deck')),
  deck_id TEXT REFERENCES decks(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  CHECK (
    (scope_kind = 'all' AND deck_id IS NULL)
    OR (scope_kind = 'deck' AND deck_id IS NOT NULL)
  )
);

CREATE TABLE study_session_cards (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  grant_token TEXT NOT NULL UNIQUE,
  expected_state TEXT NOT NULL,
  expected_due_at TEXT NOT NULL,
  admitted_as_new INTEGER NOT NULL CHECK (admitted_as_new IN (0, 1)),
  granted_at TEXT NOT NULL,
  consumed_at TEXT,
  review_log_id TEXT REFERENCES review_logs(id) ON DELETE SET NULL,
  result_json TEXT
);

CREATE INDEX study_session_cards_open
  ON study_session_cards(session_id, consumed_at, card_id);

UPDATE cards
SET learning_step = CASE
  WHEN state = 'learning'
    THEN CASE
      WHEN julianday(due_at) - julianday('now') <= (5.0 / 1440.0) THEN 0
      ELSE 1
    END
  WHEN state = 'relearning' THEN 0
  WHEN state = 'suspended' AND suspended_from_state = 'learning'
    THEN CASE
      WHEN julianday(due_at) - julianday('now') <= (5.0 / 1440.0) THEN 0
      ELSE 1
    END
  WHEN state = 'suspended' AND suspended_from_state = 'relearning' THEN 0
  ELSE NULL
END;
```

- [ ] **Step 4: Register migration `0010_memora_study`**

Change the migration array to length 10 and append:

```rust
(
    "0010_memora_study",
    include_str!("../migrations/0010_memora_study.sql"),
),
```

- [ ] **Step 5: Add migration assertions for every lifecycle state**

Extend the test with new, learning, review, relearning, and suspended cards. Assert:

```rust
assert_eq!(learning_step("new-1"), None);
assert!(matches!(learning_step("learning-1"), Some(0 | 1)));
assert_eq!(learning_step("review-1"), None);
assert_eq!(learning_step("relearning-1"), Some(0));
assert_eq!(learning_step("suspended-relearning-1"), Some(0));
```

Also assert the existing `review_logs` row count and memory JSON are unchanged.

- [ ] **Step 6: Run migration and database tests**

Run:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml library_db_tests
```

Expected: all `library_db_tests` pass.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src-tauri/migrations/0010_memora_study.sql \
  apps/desktop/src-tauri/src/library_db.rs \
  apps/desktop/src-tauri/src/library_db_tests.rs
git commit -m "feat: add Memora study schema"
```

---

### Task 2: Add settings repositories, commands, and typed bridge

**Files:**
- Modify: `apps/desktop/src-tauri/src/model.rs`
- Create: `apps/desktop/src-tauri/src/study_queue.rs`
- Create: `apps/desktop/src-tauri/src/study_queue_tests.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/src/commands.rs`
- Modify: `apps/desktop/src/domain/learning.ts`
- Modify: `apps/desktop/src/lib/learning.ts`
- Modify: `apps/desktop/src/lib/learning.test.ts`

- [ ] **Step 1: Write failing Rust settings tests**

Create `study_queue_tests.rs` with:

```rust
use tempfile::TempDir;

use crate::{
    library_db::LibraryDatabase,
    study_queue::{DeckLearningSettingsUpdate, MemoraSettingsUpdate},
};

fn db() -> (TempDir, LibraryDatabase) {
    let directory = TempDir::new().expect("temporary directory");
    let database = LibraryDatabase::open(directory.path()).expect("open database");
    (directory, database)
}

#[test]
fn memora_settings_default_and_validate_safe_ranges() {
    let (_directory, mut database) = db();
    let defaults = database.memora_settings().expect("read settings");
    assert_eq!(defaults.new_cards_per_day, 20);
    assert_eq!(defaults.desired_retention, 0.90);

    assert!(database.update_memora_settings(MemoraSettingsUpdate {
        new_cards_per_day: 0,
        desired_retention: 0.80,
    }).is_ok());
    assert!(database.update_memora_settings(MemoraSettingsUpdate {
        new_cards_per_day: 1000,
        desired_retention: 0.90,
    }).is_err());
    assert!(database.update_memora_settings(MemoraSettingsUpdate {
        new_cards_per_day: 20,
        desired_retention: 0.98,
    }).is_err());
}

#[test]
fn deck_settings_inherit_until_a_custom_limit_is_saved() {
    let (_directory, mut database) = db();
    let deck = database.create_deck("Biology").expect("create deck");

    let inherited = database.deck_learning_settings(&deck.id).expect("inherit");
    assert_eq!(inherited.new_cards_per_day, None);
    assert_eq!(inherited.effective_new_cards_per_day, 20);

    database.update_deck_learning_settings(
        &deck.id,
        DeckLearningSettingsUpdate::Custom(7),
    ).expect("save override");
    assert_eq!(
        database.deck_learning_settings(&deck.id)
            .expect("custom")
            .effective_new_cards_per_day,
        7
    );

    database.update_deck_learning_settings(
        &deck.id,
        DeckLearningSettingsUpdate::Inherit,
    ).expect("remove override");
    assert_eq!(
        database.deck_learning_settings(&deck.id)
            .expect("inherited again")
            .new_cards_per_day,
        None
    );
}
```

- [ ] **Step 2: Run the tests and verify they fail**

Run:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml study_queue_tests
```

Expected: FAIL because the settings repository types and methods do not exist.

- [ ] **Step 3: Add Rust settings models and repository methods**

In `study_queue.rs`, define:

```rust
use chrono::{SecondsFormat, Utc};
use rusqlite::{params, OptionalExtension};

use crate::library_db::{LibraryDatabase, LibraryDbError, Result};

#[derive(Clone, Debug, PartialEq)]
pub struct MemoraSettings {
    pub new_cards_per_day: i64,
    pub desired_retention: f64,
}

pub struct MemoraSettingsUpdate {
    pub new_cards_per_day: i64,
    pub desired_retention: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct DeckLearningSettings {
    pub deck_id: String,
    pub inherited_new_cards_per_day: i64,
    pub new_cards_per_day: Option<i64>,
    pub effective_new_cards_per_day: i64,
}

pub enum DeckLearningSettingsUpdate {
    Inherit,
    Custom(i64),
}

fn validate_new_cards_per_day(value: i64) -> Result<()> {
    if (0..=999).contains(&value) {
        Ok(())
    } else {
        Err(LibraryDbError::InvalidLearning(
            "new cards per day must be between 0 and 999".into(),
        ))
    }
}

fn validate_retention(value: f64) -> Result<()> {
    if value.is_finite() && (0.80..=0.97).contains(&value) {
        Ok(())
    } else {
        Err(LibraryDbError::InvalidLearning(
            "desired retention must be between 0.80 and 0.97".into(),
        ))
    }
}
```

Implement:

```rust
impl LibraryDatabase {
    pub fn memora_settings(&self) -> Result<MemoraSettings>;
    pub fn update_memora_settings(
        &mut self,
        update: MemoraSettingsUpdate,
    ) -> Result<MemoraSettings>;
    pub fn deck_learning_settings(
        &self,
        deck_id: &str,
    ) -> Result<DeckLearningSettings>;
    pub fn update_deck_learning_settings(
        &mut self,
        deck_id: &str,
        update: DeckLearningSettingsUpdate,
    ) -> Result<DeckLearningSettings>;
}
```

Use `UPDATE memora_settings`, `INSERT INTO deck_learning_settings(deck_id,new_cards_per_day,updated_at) VALUES(?1,?2,?3) ON CONFLICT(deck_id) DO UPDATE SET new_cards_per_day=excluded.new_cards_per_day,updated_at=excluded.updated_at`, and `DELETE FROM deck_learning_settings WHERE deck_id=?1` for inheritance. Verify the deck exists before reading or writing an override.

- [ ] **Step 4: Add settings payloads and commands**

In `model.rs`:

```rust
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoraSettingsPayload {
    pub new_cards_per_day: i64,
    pub desired_retention: f64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeckLearningSettingsPayload {
    pub deck_id: String,
    pub inherited_new_cards_per_day: i64,
    pub new_cards_per_day: Option<i64>,
    pub effective_new_cards_per_day: i64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDeckLearningSettingsPayload {
    pub deck_id: String,
    pub new_cards_per_day: Option<i64>,
}
```

In `commands.rs`, add:

```rust
#[tauri::command]
pub fn get_memora_settings(
    state: State<'_, LibraryStore>,
) -> Result<MemoraSettingsPayload, String>;

#[tauri::command]
pub fn update_memora_settings(
    settings: MemoraSettingsPayload,
    state: State<'_, LibraryStore>,
) -> Result<MemoraSettingsPayload, String>;

#[tauri::command]
pub fn get_deck_learning_settings(
    deck_id: String,
    state: State<'_, LibraryStore>,
) -> Result<DeckLearningSettingsPayload, String>;

#[tauri::command]
pub fn update_deck_learning_settings(
    payload: UpdateDeckLearningSettingsPayload,
    state: State<'_, LibraryStore>,
) -> Result<DeckLearningSettingsPayload, String>;
```

Register the module/test module and all four commands in `lib.rs`.

- [ ] **Step 5: Write failing TypeScript bridge tests**

Add to `lib/learning.test.ts`:

```ts
it("invokes Memora and deck learning settings commands", async () => {
  const call = vi.fn().mockResolvedValue({});

  await getMemoraSettings(call);
  await updateMemoraSettings(
    { newCardsPerDay: 30, desiredRetention: 0.92 },
    call,
  );
  await getDeckLearningSettings("deck-1", call);
  await updateDeckLearningSettings("deck-1", 8, call);
  await updateDeckLearningSettings("deck-1", null, call);

  expect(call).toHaveBeenNthCalledWith(1, "get_memora_settings");
  expect(call).toHaveBeenNthCalledWith(2, "update_memora_settings", {
    settings: { newCardsPerDay: 30, desiredRetention: 0.92 },
  });
  expect(call).toHaveBeenNthCalledWith(3, "get_deck_learning_settings", {
    deckId: "deck-1",
  });
  expect(call).toHaveBeenNthCalledWith(4, "update_deck_learning_settings", {
    payload: { deckId: "deck-1", newCardsPerDay: 8 },
  });
  expect(call).toHaveBeenNthCalledWith(5, "update_deck_learning_settings", {
    payload: { deckId: "deck-1", newCardsPerDay: null },
  });
});
```

- [ ] **Step 6: Add frontend settings types and bridge functions**

Add the `MemoraSettings` and `DeckLearningSettings` interfaces from the Shared contracts section to `domain/learning.ts`.

Add to `lib/learning.ts`:

```ts
export function getMemoraSettings(
  call: Invoke = invoke as Invoke,
): Promise<MemoraSettings> {
  return call("get_memora_settings");
}

export function updateMemoraSettings(
  settings: MemoraSettings,
  call: Invoke = invoke as Invoke,
): Promise<MemoraSettings> {
  return call("update_memora_settings", { settings });
}

export function getDeckLearningSettings(
  deckId: string,
  call: Invoke = invoke as Invoke,
): Promise<DeckLearningSettings> {
  return call("get_deck_learning_settings", { deckId });
}

export function updateDeckLearningSettings(
  deckId: string,
  newCardsPerDay: number | null,
  call: Invoke = invoke as Invoke,
): Promise<DeckLearningSettings> {
  return call("update_deck_learning_settings", {
    payload: { deckId, newCardsPerDay },
  });
}
```

- [ ] **Step 7: Run settings tests**

Run:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml study_queue_tests
cd apps/desktop && npm test -- --run src/lib/learning.test.ts
```

Expected: both commands pass.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src-tauri/src/model.rs \
  apps/desktop/src-tauri/src/study_queue.rs \
  apps/desktop/src-tauri/src/study_queue_tests.rs \
  apps/desktop/src-tauri/src/lib.rs \
  apps/desktop/src-tauri/src/commands.rs \
  apps/desktop/src/domain/learning.ts \
  apps/desktop/src/lib/learning.ts \
  apps/desktop/src/lib/learning.test.ts
git commit -m "feat: add Memora learning settings"
```

---

### Task 3: Replace the scheduler adapter with the practical learning policy

**Files:**
- Modify: `apps/desktop/src-tauri/src/scheduler.rs`
- Modify: `apps/desktop/src-tauri/src/scheduler_tests.rs`
- Modify: `apps/desktop/src-tauri/src/model.rs`
- Modify: `apps/desktop/src-tauri/src/learning.rs`
- Modify: `apps/desktop/src-tauri/src/learning_tests.rs`

- [ ] **Step 1: Replace scheduler tests with a lifecycle matrix**

Define deterministic inputs:

```rust
use crate::scheduler::{
    CardScheduleInput, CardState, Rating, ReviewScheduler, SchedulerConfig,
};

fn input(state: CardState, learning_step: Option<u8>) -> CardScheduleInput {
    CardScheduleInput {
        state,
        learning_step,
        memory_state_json: None,
        elapsed_days: 0,
    }
}
```

Add explicit tests:

```rust
#[test]
fn new_card_uses_fixed_learning_steps() {
    let scheduler = ReviewScheduler::default();
    let now = fixed_now();

    let again = scheduler.apply(input(CardState::New, None), Rating::Again, now).unwrap();
    assert_eq!((again.state, again.learning_step, again.interval_seconds),
        (CardState::Learning, Some(0), 60));

    let hard = scheduler.apply(input(CardState::New, None), Rating::Hard, now).unwrap();
    assert_eq!((hard.state, hard.learning_step, hard.interval_seconds),
        (CardState::Learning, Some(0), 360));

    let good = scheduler.apply(input(CardState::New, None), Rating::Good, now).unwrap();
    assert_eq!((good.state, good.learning_step, good.interval_seconds),
        (CardState::Learning, Some(1), 600));

    let easy = scheduler.apply(input(CardState::New, None), Rating::Easy, now).unwrap();
    assert_eq!(easy.state, CardState::Review);
    assert_eq!(easy.learning_step, None);
}

#[test]
fn final_learning_good_graduates_to_fsrs_review() {
    let scheduled = ReviewScheduler::default()
        .apply(input(CardState::Learning, Some(1)), Rating::Good, fixed_now())
        .unwrap();
    assert_eq!(scheduled.state, CardState::Review);
    assert_eq!(scheduled.learning_step, None);
    assert!(scheduled.memory_state_json.is_some());
}

#[test]
fn review_again_enters_relearning_and_records_one_lapse() {
    let mut review = input(CardState::Review, None);
    review.memory_state_json = Some(
        r#"{"stability":3.0,"difficulty":5.0}"#.into(),
    );
    review.elapsed_days = 4;

    let scheduled = ReviewScheduler::default()
        .apply(review, Rating::Again, fixed_now())
        .unwrap();
    assert_eq!(scheduled.state, CardState::Relearning);
    assert_eq!(scheduled.learning_step, Some(0));
    assert_eq!(scheduled.interval_seconds, 600);
    assert!(scheduled.increment_lapses);
}

#[test]
fn relearning_again_does_not_increment_lapses_again() {
    let mut relearning = input(CardState::Relearning, Some(0));
    relearning.memory_state_json = Some(
        r#"{"stability":1.0,"difficulty":6.0}"#.into(),
    );
    let scheduled = ReviewScheduler::default()
        .apply(relearning, Rating::Again, fixed_now())
        .unwrap();
    assert!(!scheduled.increment_lapses);
}
```

Add a table-driven test that calls `preview(input.clone(), now)` and confirms `apply(input, rating, now)` exactly equals the selected preview for all valid state/rating combinations.

- [ ] **Step 2: Run scheduler tests and verify they fail**

Run:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml scheduler_tests
```

Expected: FAIL because `CardScheduleInput`, typed `CardState`, learning steps, and lapse policy do not exist.

- [ ] **Step 3: Implement typed scheduler inputs and outputs**

Use these core types:

```rust
const AGAIN_LEARNING_SECONDS: i64 = 60;
const HARD_LEARNING_SECONDS: i64 = 360;
const GOOD_LEARNING_SECONDS: i64 = 600;
const RELEARNING_SECONDS: i64 = 600;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CardState {
    New,
    Learning,
    Review,
    Relearning,
    Suspended,
}

#[derive(Clone, Debug)]
pub struct CardScheduleInput {
    pub state: CardState,
    pub learning_step: Option<u8>,
    pub memory_state_json: Option<String>,
    pub elapsed_days: u32,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct ScheduledState {
    pub state: CardState,
    #[serde(rename = "learningStep")]
    pub learning_step: Option<u8>,
    #[serde(rename = "dueAt")]
    pub due_at: String,
    #[serde(rename = "intervalSeconds")]
    pub interval_seconds: i64,
    pub stability: Option<f32>,
    pub difficulty: Option<f32>,
    #[serde(rename = "memoryStateJson")]
    pub memory_state_json: Option<String>,
    #[serde(skip)]
    pub increment_lapses: bool,
}
```

Change scheduler signatures to:

```rust
pub fn preview(
    &self,
    input: CardScheduleInput,
    now: DateTime<Utc>,
) -> Result<ReviewPreview, SchedulerError>;

pub fn apply(
    &self,
    input: CardScheduleInput,
    rating: Rating,
    now: DateTime<Utc>,
) -> Result<ScheduledState, SchedulerError>;
```

Validate:

```rust
match (input.state, input.learning_step) {
    (CardState::New | CardState::Review, None) => Ok(()),
    (CardState::Learning, Some(0 | 1)) => Ok(()),
    (CardState::Relearning, Some(0)) => Ok(()),
    _ => Err(SchedulerError::InvalidCardState),
}
```

Do not schedule `Suspended`.

Tighten scheduler configuration validation to the product-safe range:

```rust
if config.desired_retention.is_finite()
    && (0.80..=0.97).contains(&config.desired_retention)
{
    Ok(())
} else {
    Err(SchedulerError::InvalidConfig)
}
```

- [ ] **Step 4: Implement fixed steps around FSRS**

Rules:

```rust
match (input.state, rating) {
    (CardState::New, Rating::Again) => fixed(CardState::Learning, Some(0), 60),
    (CardState::New, Rating::Hard) => fixed(CardState::Learning, Some(0), 360),
    (CardState::New, Rating::Good) => fixed(CardState::Learning, Some(1), 600),
    (CardState::New, Rating::Easy) => graduate_with_fsrs(None, Rating::Easy),

    (CardState::Learning, Rating::Again) => fixed(CardState::Learning, Some(0), 60),
    (CardState::Learning, Rating::Hard) => fixed(
        CardState::Learning,
        input.learning_step,
        360,
    ),
    (CardState::Learning, Rating::Good) if input.learning_step == Some(0) =>
        fixed(CardState::Learning, Some(1), 600),
    (CardState::Learning, Rating::Good | Rating::Easy) =>
        graduate_with_fsrs(input.memory_state_json.as_deref(), rating),

    (CardState::Review, Rating::Again) =>
        relearn_with_fsrs(input.memory_state_json.as_deref(), true),
    (CardState::Review, Rating::Hard | Rating::Good | Rating::Easy) =>
        review_with_fsrs(input.memory_state_json.as_deref(), rating),

    (CardState::Relearning, Rating::Again | Rating::Hard) =>
        relearn_with_fsrs(input.memory_state_json.as_deref(), false),
    (CardState::Relearning, Rating::Good | Rating::Easy) =>
        review_with_fsrs(input.memory_state_json.as_deref(), rating),

    _ => return Err(SchedulerError::InvalidCardState),
}
```

For fixed short steps after FSRS has produced memory updates, preserve the returned memory state while replacing only `state`, `learning_step`, `interval_seconds`, and `due_at`.

Set the version to:

```rust
version: "memora-learning-v2+fsrs-6.6.0".into()
```

- [ ] **Step 5: Hydrate and persist `learningStep`**

Add `learning_step` to `LearningCardSummary`, its JSON contract test, `card_by_id`, `hydrate_card`, browser-row hydration, and all test fixtures.

Change `AppliedReview`:

```rust
pub learning_step: Option<i64>,
pub increment_lapses: bool,
```

Change the atomic card update to:

```sql
UPDATE cards
SET state = ?1,
    learning_step = ?2,
    due_at = ?3,
    stability = ?4,
    difficulty = ?5,
    memory_state_json = ?6,
    reps = reps + 1,
    lapses = lapses + CASE WHEN ?7 THEN 1 ELSE 0 END,
    last_review_at = ?8,
    updated_at = ?8
WHERE id = ?9
  AND state = ?10
  AND due_at = ?11
  AND deleted_at IS NULL
```

Update learning repository tests so a review Again increments lapses once and a relearning Again does not.

- [ ] **Step 6: Run scheduler and learning tests**

Run:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml scheduler_tests
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml learning_tests
```

Expected: all scheduler and learning tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src-tauri/src/scheduler.rs \
  apps/desktop/src-tauri/src/scheduler_tests.rs \
  apps/desktop/src-tauri/src/model.rs \
  apps/desktop/src-tauri/src/learning.rs \
  apps/desktop/src-tauri/src/learning_tests.rs
git commit -m "feat: add Memora learning state machine"
```

---

### Task 4: Build deterministic study sessions and queue priority

**Files:**
- Modify: `apps/desktop/src-tauri/src/study_queue.rs`
- Modify: `apps/desktop/src-tauri/src/study_queue_tests.rs`
- Modify: `apps/desktop/src-tauri/src/model.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing queue-priority and limit tests**

Add helpers that insert cards with explicit states/due timestamps. Add:

```rust
#[test]
fn queue_prioritizes_learning_then_review_then_new() {
    let (_directory, mut database) = seeded_learning_database();
    let now = utc("2026-07-16T09:00:00.000Z");
    insert_card(&mut database, "new-1", "deck-1", "new", now, None);
    insert_card(&mut database, "review-1", "deck-1", "review", now, None);
    insert_card(&mut database, "learning-1", "deck-1", "learning", now, Some(0));
    insert_card(
        &mut database,
        "future-review",
        "deck-1",
        "review",
        utc("2026-07-17T09:00:00.000Z"),
        None,
    );
    insert_card(&mut database, "suspended-1", "deck-1", "suspended", now, None);

    let session = database.start_study_session(
        StudyScope::Deck("deck-1".into()),
        now,
        "2026-07-16",
    ).expect("start session");

    let ids = session.cards.iter()
        .map(|grant| grant.card.id.as_str())
        .collect::<Vec<_>>();
    assert_eq!(ids, vec!["learning-1", "review-1", "new-1"]);
    assert_eq!(session.counts.learning, 1);
    assert_eq!(session.counts.review, 1);
    assert_eq!(session.counts.new, 1);
}

#[test]
fn queue_applies_global_and_per_deck_new_card_limits() {
    let (_directory, mut database) = seeded_learning_database();
    database.update_memora_settings(MemoraSettingsUpdate {
        new_cards_per_day: 2,
        desired_retention: 0.90,
    }).unwrap();
    database.update_deck_learning_settings(
        "deck-2",
        DeckLearningSettingsUpdate::Custom(1),
    ).unwrap();
    insert_new_cards(&mut database, "deck-1", 4);
    insert_new_cards(&mut database, "deck-2", 4);

    let session = database.start_study_session(
        StudyScope::All,
        utc("2026-07-16T09:00:00.000Z"),
        "2026-07-16",
    ).unwrap();

    assert_eq!(new_count(&session, "deck-1"), 2);
    assert_eq!(new_count(&session, "deck-2"), 1);
}

#[test]
fn zero_new_limit_keeps_due_reviews_available() {
    let (_directory, mut database) = seeded_learning_database();
    database.update_memora_settings(MemoraSettingsUpdate {
        new_cards_per_day: 0,
        desired_retention: 0.90,
    }).unwrap();
    insert_new_cards(&mut database, "deck-1", 2);
    insert_due_review(&mut database, "review-1", "deck-1");

    let session = database.start_study_session(
        StudyScope::All,
        utc("2026-07-16T09:00:00.000Z"),
        "2026-07-16",
    ).unwrap();

    assert_eq!(session.cards.len(), 1);
    assert_eq!(session.cards[0].card.id, "review-1");
}
```

- [ ] **Step 2: Run queue tests and verify they fail**

Run:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml study_queue_tests
```

Expected: FAIL because study scopes, sessions, grants, and queue methods do not exist.

- [ ] **Step 3: Add queue-domain types**

In `study_queue.rs`:

```rust
#[derive(Clone, Debug, PartialEq)]
pub enum StudyScope {
    All,
    Deck(String),
}

#[derive(Clone, Debug)]
pub struct StudyCounts {
    pub learning: usize,
    pub review: usize,
    pub new: usize,
}

#[derive(Clone, Debug)]
pub struct StudyGrant {
    pub grant_token: String,
    pub expected_state: String,
    pub expected_due_at: String,
    pub card: LearningCardSummary,
    pub preview: ReviewPreview,
}

#[derive(Clone, Debug)]
pub struct StudySession {
    pub session_id: String,
    pub scope: StudyScope,
    pub cards: Vec<StudyGrant>,
    pub counts: StudyCounts,
    pub next_learning_due_at: Option<String>,
}
```

Add matching serializable payloads to `model.rs`:

```rust
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyScopePayload {
    pub kind: String,
    pub deck_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyCountsPayload {
    pub learning: usize,
    pub review: usize,
    pub new: usize,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyGrantPayload {
    pub grant_token: String,
    pub expected_state: String,
    pub expected_due_at: String,
    pub card: LearningCardSummary,
    pub preview: ReviewPreviewPayload,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudySessionPayload {
    pub session_id: String,
    pub scope: StudyScopePayload,
    pub cards: Vec<StudyGrantPayload>,
    pub counts: StudyCountsPayload,
    pub next_learning_due_at: Option<String>,
}
```

- [ ] **Step 4: Implement `start_study_session`**

Signature:

```rust
pub fn start_study_session(
    &mut self,
    scope: StudyScope,
    now: DateTime<Utc>,
    study_day: &str,
) -> Result<StudySession>;
```

Implementation order:

1. Validate `study_day` with `NaiveDate::parse_from_str(study_day, "%Y-%m-%d")`.
2. Delete expired sessions: `DELETE FROM study_sessions WHERE expires_at <= ?1`.
3. Insert a session expiring at `now + 24 hours`.
4. Call a shared `grant_available_cards(session_id, scope, now, study_day)`.
5. Return hydrated cards and scheduler previews using the current desired retention.

Construct the scheduler explicitly from SQLite settings:

```rust
let settings = self.memora_settings()?;
let scheduler = ReviewScheduler::new(SchedulerConfig {
    desired_retention: settings.desired_retention as f32,
    version: "memora-learning-v2+fsrs-6.6.0".into(),
})?;
```

Use three explicit queries rather than one opaque query:

```sql
-- Due learning/relearning
SELECT id FROM cards
WHERE state IN ('learning','relearning')
  AND due_at <= ?1
  AND deleted_at IS NULL
  AND (?2 IS NULL OR deck_id = ?2)
ORDER BY due_at ASC, id ASC;

-- Due review
SELECT id FROM cards
WHERE state = 'review'
  AND due_at <= ?1
  AND deleted_at IS NULL
  AND (?2 IS NULL OR deck_id = ?2)
ORDER BY due_at ASC, id ASC;

-- New per deck
SELECT id FROM cards
WHERE state = 'new'
  AND deleted_at IS NULL
  AND deck_id = ?1
  AND id NOT IN (SELECT card_id FROM card_introductions)
ORDER BY created_at ASC, id ASC
LIMIT ?2;
```

Before selecting new cards for a deck, calculate:

```text
remaining = effective_limit
          - COUNT(card_introductions WHERE deck_id = ? AND study_day = ?)
```

Clamp remaining to zero. Session grants do not decrement the allowance.

- [ ] **Step 5: Implement `refresh_study_session` and next-learning due**

Signature:

```rust
pub fn refresh_study_session(
    &mut self,
    session_id: &str,
    now: DateTime<Utc>,
    study_day: &str,
) -> Result<StudySession>;
```

Validate session expiry and scope, grant newly due cards, and exclude cards with an existing unconsumed grant in the session:

```sql
AND NOT EXISTS (
  SELECT 1
  FROM study_session_cards grants
  WHERE grants.session_id = ?session_id
    AND grants.card_id = cards.id
    AND grants.consumed_at IS NULL
)
```

Compute `next_learning_due_at`:

```sql
SELECT MIN(due_at)
FROM cards
WHERE state IN ('learning','relearning')
  AND due_at > ?1
  AND deleted_at IS NULL
  AND (?2 IS NULL OR deck_id = ?2);
```

- [ ] **Step 6: Add queue preview equality test**

For every grant, call the scheduler directly with the same card/config and assert the stored payload preview equals it. This protects the queue from using a different retention/config than rating.

- [ ] **Step 7: Run queue tests**

Run:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml study_queue_tests
```

Expected: queue priority, limit, refresh, and preview tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src-tauri/src/study_queue.rs \
  apps/desktop/src-tauri/src/study_queue_tests.rs \
  apps/desktop/src-tauri/src/model.rs \
  apps/desktop/src-tauri/src/lib.rs
git commit -m "feat: add backend study queue"
```

---

### Task 5: Add atomic session-safe rating and idempotent retry

**Files:**
- Modify: `apps/desktop/src-tauri/src/study_queue.rs`
- Modify: `apps/desktop/src-tauri/src/study_queue_tests.rs`
- Modify: `apps/desktop/src-tauri/src/commands.rs`
- Modify: `apps/desktop/src-tauri/src/commands_tests.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing rating-safety tests**

Add:

```rust
#[test]
fn rating_consumes_one_grant_and_writes_one_review_atomically() {
    let (_directory, mut database) = seeded_learning_database();
    insert_due_review(&mut database, "review-1", "deck-1");
    let now = utc("2026-07-16T09:00:00.000Z");
    let session = database.start_study_session(
        StudyScope::Deck("deck-1".into()),
        now,
        "2026-07-16",
    ).unwrap();
    let grant = &session.cards[0];

    let rating = StudyRating {
        session_id: session.session_id.clone(),
        card_id: grant.card.id.clone(),
        grant_token: grant.grant_token.clone(),
        expected_state: grant.expected_state.clone(),
        expected_due_at: grant.expected_due_at.clone(),
        rating: Rating::Good,
        elapsed_ms: 1200,
        now,
        study_day: "2026-07-16".into(),
    };

    let first = database.rate_study_card(rating.clone()).expect("rate card");
    let second = database.rate_study_card(rating)
        .expect("idempotent retry");
    assert_eq!(second.review_log_id, first.review_log_id);
    assert_eq!(review_log_count(&database, "review-1"), 1);
}

#[test]
fn stale_or_suspended_grant_is_rejected_without_writes() {
    let (_directory, mut database) = seeded_learning_database();
    insert_due_review(&mut database, "review-1", "deck-1");
    let now = utc("2026-07-16T09:00:00.000Z");
    let session = database.start_study_session(
        StudyScope::Deck("deck-1".into()),
        now,
        "2026-07-16",
    ).unwrap();
    let grant = &session.cards[0];
    database.set_cards_suspended(&["review-1".into()], true).unwrap();

    let error = database.rate_study_card(rating_from(grant, &session, now))
        .expect_err("reject suspended card");
    assert_eq!(error.to_string(), "study card changed; refresh the session");
    assert_eq!(review_log_count(&database, "review-1"), 0);
}

#[test]
fn new_card_allowance_is_checked_when_rating_not_when_granted() {
    let (_directory, mut database) = seeded_learning_database();
    database.update_memora_settings(MemoraSettingsUpdate {
        new_cards_per_day: 1,
        desired_retention: 0.90,
    }).unwrap();
    insert_new_cards(&mut database, "deck-1", 2);
    let now = utc("2026-07-16T09:00:00.000Z");
    let first_session = database.start_study_session(StudyScope::All, now, "2026-07-16").unwrap();
    let second_session = database.start_study_session(StudyScope::All, now, "2026-07-16").unwrap();
    let second_grant = replace_open_grant_for_test(
        &mut database,
        &second_session.session_id,
        &second_session.cards[0],
        "new-2",
    );

    database.rate_study_card(rating_from(
        &first_session.cards[0],
        &first_session,
        now,
    )).unwrap();

    let error = database.rate_study_card(rating_from(
        &second_grant,
        &second_session,
        now,
    )).expect_err("limit reached");
    assert_eq!(error.to_string(), "new card limit reached; refresh the session");
}
```

Create `rating_from` to clone all grant/session fields. Add this test helper in `study_queue_tests.rs`:

```rust
fn replace_open_grant_for_test(
    database: &mut LibraryDatabase,
    session_id: &str,
    original: &StudyGrant,
    replacement_card_id: &str,
) -> StudyGrant {
    let card = database.card_by_id(replacement_card_id)
        .expect("read replacement")
        .expect("replacement card");
    database.connection.execute(
        "UPDATE study_session_cards
         SET card_id=?1, expected_state=?2, expected_due_at=?3
         WHERE session_id=?4 AND grant_token=?5 AND consumed_at IS NULL",
        params![
            replacement_card_id,
            card.state,
            card.due_at,
            session_id,
            original.grant_token,
        ],
    ).expect("replace test grant");
    StudyGrant {
        grant_token: original.grant_token.clone(),
        expected_state: card.state.clone(),
        expected_due_at: card.due_at.clone(),
        card,
        preview: original.preview.clone(),
    }
}
```

Both new cards have identical scheduling state, so reusing the deterministic preview is valid. This simulates two valid concurrent grants for distinct new cards and proves the allowance is enforced when the rating transaction commits.

- [ ] **Step 2: Run safety tests and verify they fail**

Run:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml study_queue_tests
```

Expected: FAIL because session rating does not exist.

- [ ] **Step 3: Implement `StudyRating` and `StudyRatingResult`**

```rust
#[derive(Clone)]
pub struct StudyRating {
    pub session_id: String,
    pub card_id: String,
    pub grant_token: String,
    pub expected_state: String,
    pub expected_due_at: String,
    pub rating: Rating,
    pub elapsed_ms: i64,
    pub now: DateTime<Utc>,
    pub study_day: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyRatingResult {
    pub card: LearningCardSummary,
    pub review_log_id: String,
}
```

- [ ] **Step 4: Implement atomic session rating**

`rate_study_card` must use one `TransactionBehavior::Immediate` transaction:

1. Load the grant by `grant_token`, session ID, and card ID.
2. If consumed and `result_json` exists, deserialize and return it.
3. Verify session expiry, scope, expected state/due, active card, and due time.
4. For a new card, re-check the effective daily allowance and insert:

```sql
INSERT INTO card_introductions(card_id, deck_id, study_day, introduced_at)
VALUES(?1, ?2, ?3, ?4);
```

5. Build `CardScheduleInput` from persisted card state and settings.
6. Construct `ReviewScheduler` with `desired_retention: settings.desired_retention as f32` and version `memora-learning-v2+fsrs-6.6.0`, then apply the rating.
7. Update the card and insert a review log with scheduler version `memora-learning-v2+fsrs-6.6.0`.
8. Serialize the exact `StudyRatingResult`.
9. Consume the grant:

```sql
UPDATE study_session_cards
SET consumed_at = ?1,
    review_log_id = ?2,
    result_json = ?3
WHERE grant_token = ?4
  AND consumed_at IS NULL;
```

10. Commit.

Do not call `LibraryDatabase::apply_review_atomic` from inside the transaction because it starts its own transaction. Extract the shared SQL into a transaction-scoped helper or implement the new transaction directly in `study_queue.rs`.

Add a transaction-scoped card hydration helper that reads the card row, source, and tags through the same `rusqlite::Transaction`. Use that helper to build the exact `LearningCardSummary` serialized into `result_json`; do not call `self.card_by_id()` while the rating transaction is open.

- [ ] **Step 5: Add Tauri session commands**

Reuse `StudyScopePayload` and `StudySessionPayload` from Task 4. Add the rating payload:

```rust
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyRatingPayload {
    pub session_id: String,
    pub card_id: String,
    pub grant_token: String,
    pub expected_state: String,
    pub expected_due_at: String,
    pub rating: Rating,
    pub elapsed_ms: i64,
}
```

Add commands:

```rust
#[tauri::command]
pub fn start_study_session(
    scope: StudyScopePayload,
    state: State<'_, LibraryStore>,
) -> Result<StudySessionPayload, String>;

#[tauri::command]
pub fn refresh_study_session(
    session_id: String,
    state: State<'_, LibraryStore>,
) -> Result<StudySessionPayload, String>;

#[tauri::command]
pub fn rate_study_card(
    payload: StudyRatingPayload,
    state: State<'_, LibraryStore>,
) -> Result<StudyRatingResult, String>;
```

At the command boundary, compute:

```rust
let now = Utc::now();
let study_day = chrono::Local::now().date_naive().to_string();
```

Register all commands in `lib.rs`.

- [ ] **Step 6: Add command validation tests**

Test invalid scope kind, negative `elapsedMs`, expired session, and a recoverable stale message. Assert no review logs are written on failure.

- [ ] **Step 7: Run backend tests**

Run:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml study_queue_tests
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml commands_tests
```

Expected: all session and command tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src-tauri/src/study_queue.rs \
  apps/desktop/src-tauri/src/study_queue_tests.rs \
  apps/desktop/src-tauri/src/commands.rs \
  apps/desktop/src-tauri/src/commands_tests.rs \
  apps/desktop/src-tauri/src/lib.rs
git commit -m "feat: add session-safe study ratings"
```

---

### Task 6: Add frontend session contracts and switch App to backend-owned study

**Files:**
- Modify: `apps/desktop/src/domain/learning.ts`
- Modify: `apps/desktop/src/domain/learning.test.ts`
- Modify: `apps/desktop/src/lib/learning.ts`
- Modify: `apps/desktop/src/lib/learning.test.ts`
- Modify: `apps/desktop/src/app/App.tsx`
- Modify: `apps/desktop/src/app/App.test.tsx`

- [ ] **Step 1: Write failing bridge tests for study commands**

Add:

```ts
it("invokes backend-owned study session commands", async () => {
  const call = vi.fn().mockResolvedValue({});
  const rating = {
    sessionId: "session-1",
    cardId: "card-1",
    grantToken: "grant-1",
    expectedState: "review" as const,
    expectedDueAt: "2026-07-16T09:00:00.000Z",
    rating: "good" as const,
    elapsedMs: 1500,
  };

  await startStudySession({ kind: "all" }, call);
  await startStudySession({ kind: "deck", deckId: "deck-1" }, call);
  await refreshStudySession("session-1", call);
  await rateStudyCard(rating, call);

  expect(call).toHaveBeenNthCalledWith(1, "start_study_session", {
    scope: { kind: "all" },
  });
  expect(call).toHaveBeenNthCalledWith(2, "start_study_session", {
    scope: { kind: "deck", deckId: "deck-1" },
  });
  expect(call).toHaveBeenNthCalledWith(3, "refresh_study_session", {
    sessionId: "session-1",
  });
  expect(call).toHaveBeenNthCalledWith(4, "rate_study_card", {
    payload: rating,
  });
});
```

- [ ] **Step 2: Add frontend contracts and bridge**

Add the shared study contracts from the top of this plan and `learningStep` to `LearningCard`.

Add:

```ts
export function startStudySession(
  scope: StudyScope,
  call: Invoke = invoke as Invoke,
): Promise<StudySession> {
  return call("start_study_session", { scope });
}

export function refreshStudySession(
  sessionId: string,
  call: Invoke = invoke as Invoke,
): Promise<StudySession> {
  return call("refresh_study_session", { sessionId });
}

export function rateStudyCard(
  payload: StudyRatingInput,
  call: Invoke = invoke as Invoke,
): Promise<StudyRatingResult> {
  return call("rate_study_card", { payload });
}
```

- [ ] **Step 3: Write failing App integration tests**

Add an App test where `listDeckCards`, `listDueCards`, and `previewCardReview` throw if called. Mock only `startStudySession`:

```ts
test("Review Today starts a backend study session", async () => {
  const user = userEvent.setup();
  const startStudySession = vi.fn().mockResolvedValue(studySession());
  render(
    <App
      libraryApi={{
        list: vi.fn().mockResolvedValue([]),
        pick: vi.fn(),
        importDocuments: vi.fn(),
      }}
      learningApi={{
        listDecks: vi.fn().mockResolvedValue([englishDeck]),
        createCard: vi.fn(),
        listDueCards: vi.fn(() => {
          throw new Error("legacy due query must not be used");
        }),
        startStudySession,
        refreshStudySession: vi.fn().mockResolvedValue(studySession()),
        rateStudyCard: vi.fn(),
        getDeckStatistics: vi.fn().mockResolvedValue(emptyDeckStatistics),
      }}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Memora" }));
  await user.click(await screen.findByRole("button", { name: /Review/ }));

  expect(startStudySession).toHaveBeenCalledWith({ kind: "all" });
  expect(await screen.findByText("Question")).toBeInTheDocument();
});
```

Add a deck test asserting `{ kind: "deck", deckId }`.

Add an expired-session recovery test:

```ts
test("an expired refresh starts a replacement session with the same scope", async () => {
  const user = userEvent.setup();
  const expired = studySession();
  const replacement = {
    ...studySession(),
    sessionId: "session-2",
  };
  const refreshStudySession = vi.fn().mockRejectedValue(
    new Error("study session expired"),
  );
  const startStudySession = vi.fn()
    .mockResolvedValueOnce(expired)
    .mockResolvedValueOnce(replacement);

  render(
    <App
      libraryApi={{
        list: vi.fn().mockResolvedValue([]),
        pick: vi.fn(),
        importDocuments: vi.fn(),
      }}
      learningApi={{
        listDecks: vi.fn().mockResolvedValue([englishDeck]),
        createCard: vi.fn(),
        startStudySession,
        refreshStudySession,
        rateStudyCard: vi.fn(),
        getDeckStatistics: vi.fn().mockResolvedValue(emptyDeckStatistics),
      }}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Memora" }));
  await user.click(await screen.findByRole("button", { name: /Review/ }));
  await user.click(screen.getByRole("button", { name: "Refresh now" }));

  expect(startStudySession).toHaveBeenLastCalledWith({ kind: "all" });
});
```

- [ ] **Step 4: Change `LearningApi` and real-study route**

Replace the real-study route with:

```ts
type AppRoute =
  | { name: "library" }
  | { name: "memora" }
  | {
      name: "review";
      session: StudySession;
      sourceDeck?: Deck;
      mode: "study";
    }
  | {
      name: "review";
      cards: LearningCard[];
      sourceDeck: Deck;
      mode: "practice";
    }
  // existing routes remain unchanged
```

Add required API methods:

```ts
startStudySession: (scope: StudyScope) => Promise<StudySession>;
refreshStudySession: (sessionId: string) => Promise<StudySession>;
rateStudyCard: (payload: StudyRatingInput) => Promise<StudyRatingResult>;
```

Change handlers:

```ts
const handleReviewToday = useCallback(async () => {
  try {
    const session = await learning.startStudySession({ kind: "all" });
    setRoute({ name: "review", session, mode: "study" });
  } catch (reviewError) {
    setError(errorMessage(reviewError));
  }
}, [learning]);

const handleStudyDeck = useCallback(async (deckId: string) => {
  try {
    const deck = decks.find((candidate) => candidate.id === deckId);
    if (!deck) return;
    const session = await learning.startStudySession({ kind: "deck", deckId });
    setRoute({ name: "review", session, sourceDeck: deck, mode: "study" });
  } catch (reviewError) {
    setError(errorMessage(reviewError));
  }
}, [learning, decks]);
```

Keep Practice All loading `listDeckCards`, but filter out suspended cards and stop fetching scheduler previews:

```ts
const cards = (await learning.listDeckCards(deckId))
  .filter((card) => card.state !== "suspended");
setRoute({ name: "review", cards, sourceDeck: deck, mode: "practice" });
```

- [ ] **Step 5: Wire rating and refresh callbacks**

For a real study route, pass:

```tsx
<ReviewPage
  mode="study"
  session={route.session}
  onRate={(grant, rating, elapsedMs) =>
    learning.rateStudyCard({
      sessionId: route.session.sessionId,
      cardId: grant.card.id,
      grantToken: grant.grantToken,
      expectedState: grant.expectedState,
      expectedDueAt: grant.expectedDueAt,
      rating,
      elapsedMs,
    })
  }
  onRefresh={async () => {
    try {
      return await learning.refreshStudySession(route.session.sessionId);
    } catch (error) {
      if (errorMessage(error) !== "study session expired") throw error;
      return learning.startStudySession(route.session.scope);
    }
  }}
/>
```

For practice:

```tsx
<ReviewPage
  mode="practice"
  cards={route.cards}
/>
```

The ReviewPage prop refactor is completed in Task 7; temporarily update test fixtures and compile-time types together so the branch remains green at each commit.

- [ ] **Step 6: Run bridge and App tests**

Run:

```bash
cd apps/desktop
npm test -- --run src/lib/learning.test.ts src/app/App.test.tsx
```

Expected: tests pass and legacy due/preview calls are not used by real study.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/domain/learning.ts \
  apps/desktop/src/domain/learning.test.ts \
  apps/desktop/src/lib/learning.ts \
  apps/desktop/src/lib/learning.test.ts \
  apps/desktop/src/app/App.tsx \
  apps/desktop/src/app/App.test.tsx
git commit -m "feat: switch Memora to study sessions"
```

---

### Task 7: Make ReviewPage refresh short steps and keep practice consequence-free

**Files:**
- Modify: `apps/desktop/src/features/review/ReviewPage.tsx`
- Modify: `apps/desktop/src/features/review/ReviewPage.test.tsx`
- Modify: `apps/desktop/src/styles/tokens.css`

- [ ] **Step 1: Write failing real-study refresh tests**

Use these props:

```ts
type ReviewPageProps =
  | {
      mode: "study";
      session: StudySession;
      onRate: (
        grant: StudyGrant,
        rating: ReviewRating,
        elapsedMs: number,
      ) => Promise<StudyRatingResult>;
      onRefresh: () => Promise<StudySession>;
      onBack?: () => void;
    }
  | {
      mode: "practice";
      cards: LearningCard[];
      onBack?: () => void;
    };
```

Add tests:

```ts
test("rates a grant and refreshes the backend queue", async () => {
  const user = userEvent.setup();
  const onRate = vi.fn().mockResolvedValue({
    card: { ...card, state: "learning", dueAt: "2026-07-16T09:01:00.000Z" },
    reviewLogId: "log-1",
  });
  const onRefresh = vi.fn().mockResolvedValue({
    ...studySession,
    cards: [],
    nextLearningDueAt: "2026-07-16T09:01:00.000Z",
  });

  render(
    <ReviewPage
      mode="study"
      session={studySession}
      onRate={onRate}
      onRefresh={onRefresh}
    />,
  );
  await user.click(screen.getByRole("button", { name: /Flashcard/i }));
  await user.click(screen.getByRole("button", { name: "Again" }));

  expect(onRate).toHaveBeenCalledWith(
    studySession.cards[0],
    "again",
    expect.any(Number),
  );
  expect(onRefresh).toHaveBeenCalledOnce();
  expect(await screen.findByText(/Next learning card/)).toBeInTheDocument();
});

test("stale ratings refresh without advancing the wrong card", async () => {
  const user = userEvent.setup();
  const onRate = vi.fn().mockRejectedValue(
    new Error("study card changed; refresh the session"),
  );
  const refreshed = {
    ...studySession,
    cards: [replacementGrant],
  };
  const onRefresh = vi.fn().mockResolvedValue(refreshed);
  render(
    <ReviewPage
      mode="study"
      session={studySession}
      onRate={onRate}
      onRefresh={onRefresh}
    />,
  );

  await user.click(screen.getByRole("button", { name: /Flashcard/i }));
  await user.click(screen.getByRole("button", { name: "Good" }));

  expect(await screen.findByText(replacementGrant.card.front)).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "This card changed elsewhere. The study queue was refreshed.",
  );
});
```

- [ ] **Step 2: Write failing practice-persistence test**

```ts
test("practice labels ratings locally and never accepts a persistence callback", async () => {
  const user = userEvent.setup();
  render(<ReviewPage mode="practice" cards={[card]} />);

  expect(screen.getByText("Practice mode")).toBeInTheDocument();
  expect(screen.getByText(/does not affect your schedule/i)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Flashcard/i }));
  await user.click(screen.getByRole("button", { name: "Good" }));
  expect(screen.getByText("Practice Complete")).toBeInTheDocument();
});
```

The discriminated union deliberately makes it impossible to pass `onRate` in practice mode.

- [ ] **Step 3: Refactor ReviewPage around grants**

For study mode:

- Hold the current `StudySession` in component state.
- Render `session.cards[index].card`.
- Read previews from `grant.preview`.
- After a successful rating, call `onRefresh()` and replace the entire session.
- Reset `index` to zero because the backend response is the authoritative ordered queue.
- If the response is empty with `nextLearningDueAt`, show a waiting state.
- If the response is empty without a next due time, show completion.

For practice mode:

- Keep the existing in-memory index and rating summary.
- Show a visible Practice notice.
- Never render interval labels.
- Never accept a persistence callback.

- [ ] **Step 4: Add a bounded refresh timer**

When study queue is empty and `nextLearningDueAt` is present:

```ts
useEffect(() => {
  if (mode !== "study" || !currentSession.nextLearningDueAt) return;
  const delay = Math.max(
    250,
    new Date(currentSession.nextLearningDueAt).getTime() - Date.now(),
  );
  const timer = window.setTimeout(() => {
    void refreshSession();
  }, Math.min(delay, 60_000));
  return () => window.clearTimeout(timer);
}, [mode, currentSession.nextLearningDueAt, refreshSession]);
```

The 60-second cap lets the page re-check long waits without a long blocking timer. Include a manual `Refresh now` button.

- [ ] **Step 5: Add styles**

Add classes:

```css
.review-page__practice-notice,
.review-page__waiting {
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  background: var(--surface-2);
  color: var(--text-secondary);
  padding: 12px 16px;
}

.review-page__waiting {
  display: grid;
  justify-items: center;
  gap: 12px;
  text-align: center;
}
```

- [ ] **Step 6: Run ReviewPage tests**

Run:

```bash
cd apps/desktop
npm test -- --run src/features/review/ReviewPage.test.tsx
```

Expected: all study refresh and practice tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/features/review/ReviewPage.tsx \
  apps/desktop/src/features/review/ReviewPage.test.tsx \
  apps/desktop/src/styles/tokens.css
git commit -m "feat: refresh Memora learning sessions"
```

---

### Task 8: Add `Settings → Apps → Memora`

**Files:**
- Create: `apps/desktop/src/features/settings/MemoraSettingsSection.tsx`
- Create: `apps/desktop/src/features/settings/MemoraSettingsSection.test.tsx`
- Modify: `apps/desktop/src/features/settings/SettingsPage.tsx`
- Modify: `apps/desktop/src/features/settings/SettingsPage.test.tsx`
- Modify: `apps/desktop/src/app/App.tsx`
- Modify: `apps/desktop/src/styles/tokens.css`

- [ ] **Step 1: Write failing Memora settings component tests**

```ts
test("edits the new-card limit and keeps advanced settings collapsed", async () => {
  const user = userEvent.setup();
  const save = vi.fn().mockResolvedValue({
    newCardsPerDay: 0,
    desiredRetention: 0.90,
  });
  render(
    <MemoraSettingsSection
      load={vi.fn().mockResolvedValue({
        newCardsPerDay: 20,
        desiredRetention: 0.90,
      })}
      save={save}
    />,
  );

  const limit = await screen.findByLabelText("New cards per day");
  expect(limit).toHaveValue(20);
  expect(screen.queryByLabelText("Desired retention")).not.toBeInTheDocument();
  await user.clear(limit);
  await user.type(limit, "0");
  await user.click(screen.getByRole("button", { name: "Save Memora settings" }));
  expect(save).toHaveBeenCalledWith({
    newCardsPerDay: 0,
    desiredRetention: 0.90,
  });
});

test("shows safe advanced settings and restores defaults", async () => {
  const user = userEvent.setup();
  const save = vi.fn().mockResolvedValue({
    newCardsPerDay: 20,
    desiredRetention: 0.90,
  });
  render(
    <MemoraSettingsSection
      load={vi.fn().mockResolvedValue({
        newCardsPerDay: 40,
        desiredRetention: 0.95,
      })}
      save={save}
    />,
  );

  await user.click(await screen.findByRole("button", { name: "Advanced" }));
  expect(screen.getByLabelText("Desired retention")).toHaveValue(95);
  expect(screen.getByText("1 minute → 10 minutes")).toBeInTheDocument();
  expect(screen.getByText("10 minutes")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Restore defaults" }));
  expect(screen.getByLabelText("New cards per day")).toHaveValue(20);
  expect(screen.getByLabelText("Desired retention")).toHaveValue(90);
});
```

- [ ] **Step 2: Implement `MemoraSettingsSection`**

Props:

```ts
interface MemoraSettingsSectionProps {
  load: () => Promise<MemoraSettings>;
  save: (settings: MemoraSettings) => Promise<MemoraSettings>;
}
```

Behavior:

- Load once on mount.
- Keep numeric inputs as strings while editing.
- Validate new cards as an integer `0–999`.
- Validate retention as `80–97`, then divide by 100 before saving.
- Disable Save while invalid or saving.
- Show backend errors in `role="alert"`.
- `Restore defaults` updates the form to `20` and `90`; it does not persist until Save.

- [ ] **Step 3: Write failing SettingsPage navigation tests**

```ts
test("shows Memora under Apps and opens its settings", async () => {
  const user = userEvent.setup();
  renderSettings({
    getMemoraSettings: vi.fn().mockResolvedValue({
      newCardsPerDay: 20,
      desiredRetention: 0.90,
    }),
    updateMemoraSettings: vi.fn(),
  });

  expect(screen.getByText("Apps")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Memora" }));
  expect(screen.getByRole("heading", { name: "Memora" })).toBeInTheDocument();
  expect(screen.getByLabelText("New cards per day")).toBeInTheDocument();
});

test("settings search finds Memora by learning and FSRS terms", async () => {
  const user = userEvent.setup();
  render(
    <SettingsPage
      appleTranslationAvailable={vi.fn().mockResolvedValue(true)}
      clearApiKey={vi.fn().mockResolvedValue(undefined)}
      getMemoraSettings={vi.fn().mockResolvedValue({
        newCardsPerDay: 20,
        desiredRetention: 0.90,
      })}
      hasApiKey={vi.fn().mockResolvedValue(false)}
      listModels={vi.fn().mockResolvedValue([])}
      saveApiKey={vi.fn().mockResolvedValue(undefined)}
      updateMemoraSettings={vi.fn().mockResolvedValue({
        newCardsPerDay: 20,
        desiredRetention: 0.90,
      })}
    />,
  );
  await user.type(screen.getByLabelText("Search settings"), "fsrs");
  expect(screen.getByRole("button", { name: "Memora" })).toBeInTheDocument();
});
```

- [ ] **Step 4: Replace search-query-as-navigation with explicit section state**

Introduce:

```ts
type SettingsSection =
  | "account"
  | "appearance"
  | "drive"
  | "models"
  | "memora";

const [section, setSection] = useState<SettingsSection>("models");
const [searchQuery, setSearchQuery] = useState("");
```

Navigation buttons set `section`; search filters visible navigation items using keyword arrays. Add:

```tsx
<p className="settings-page__nav-label">Apps</p>
<button
  className={`settings-page__nav-item ${section === "memora" ? "is-active" : ""}`}
  onClick={() => setSection("memora")}
  type="button"
>
  <span className="settings-page__nav-icon"><IconMemora /></span>
  Memora
</button>
```

Render the Memora branch independently before the existing section branches:

```tsx
{section === "memora" ? (
  <MemoraSettingsSection
    load={getMemoraSettings}
    save={updateMemoraSettings}
  />
) : null}
```

Change each existing branch to an explicit `section === "account"`, `section === "appearance"`, `section === "drive"`, or `section === "models"` guard so only one section renders.

- [ ] **Step 5: Wire App props**

Extend `SettingsPageProps`:

```ts
getMemoraSettings: () => Promise<MemoraSettings>;
updateMemoraSettings: (
  settings: MemoraSettings,
) => Promise<MemoraSettings>;
```

Pass `learning.getMemoraSettings` and `learning.updateMemoraSettings` from `App.tsx`.

- [ ] **Step 6: Add settings styles**

Add styles for:

- Numeric input rows.
- Inline suffix `%`.
- Advanced disclosure button.
- Read-only policy rows.
- Save/default actions.
- Success/error text.

Reuse existing `settings-page__field`, `settings-page__section`, and button tokens rather than adding a second settings design system.

- [ ] **Step 7: Run settings and App tests**

Run:

```bash
cd apps/desktop
npm test -- --run \
  src/features/settings/MemoraSettingsSection.test.tsx \
  src/features/settings/SettingsPage.test.tsx \
  src/app/App.test.tsx
```

Expected: all settings navigation and persistence tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/features/settings/MemoraSettingsSection.tsx \
  apps/desktop/src/features/settings/MemoraSettingsSection.test.tsx \
  apps/desktop/src/features/settings/SettingsPage.tsx \
  apps/desktop/src/features/settings/SettingsPage.test.tsx \
  apps/desktop/src/app/App.tsx \
  apps/desktop/src/styles/tokens.css
git commit -m "feat: add Memora app settings"
```

---

### Task 9: Add per-deck learning limit overrides

**Files:**
- Create: `apps/desktop/src/features/memora/DeckLearningSettingsDialog.tsx`
- Create: `apps/desktop/src/features/memora/DeckLearningSettingsDialog.test.tsx`
- Modify: `apps/desktop/src/features/memora/MemoraPage.tsx`
- Modify: `apps/desktop/src/features/memora/MemoraPage.test.tsx`
- Modify: `apps/desktop/src/app/App.tsx`
- Modify: `apps/desktop/src/styles/tokens.css`

- [ ] **Step 1: Write failing dialog tests**

```ts
test("shows inherited value and saves a custom deck limit", async () => {
  const user = userEvent.setup();
  const save = vi.fn().mockResolvedValue({
    deckId: "deck-1",
    inheritedNewCardsPerDay: 20,
    newCardsPerDay: 7,
    effectiveNewCardsPerDay: 7,
  });
  render(
    <DeckLearningSettingsDialog
      deckName="Biology"
      settings={{
        deckId: "deck-1",
        inheritedNewCardsPerDay: 20,
        newCardsPerDay: null,
        effectiveNewCardsPerDay: 20,
      }}
      onCancel={vi.fn()}
      onSave={save}
    />,
  );

  expect(screen.getByText("Use Memora default (20/day)")).toBeInTheDocument();
  await user.click(screen.getByLabelText("Custom limit"));
  await user.clear(screen.getByLabelText("Custom new cards per day"));
  await user.type(screen.getByLabelText("Custom new cards per day"), "7");
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(save).toHaveBeenCalledWith(7);
});

test("saving inheritance removes the custom override", async () => {
  const user = userEvent.setup();
  const save = vi.fn().mockResolvedValue({});
  render(
    <DeckLearningSettingsDialog
      deckName="Biology"
      settings={{
        deckId: "deck-1",
        inheritedNewCardsPerDay: 20,
        newCardsPerDay: 7,
        effectiveNewCardsPerDay: 7,
      }}
      onCancel={vi.fn()}
      onSave={save}
    />,
  );
  await user.click(screen.getByLabelText("Use Memora default"));
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(save).toHaveBeenCalledWith(null);
});
```

- [ ] **Step 2: Implement the deck settings dialog**

Props:

```ts
interface DeckLearningSettingsDialogProps {
  deckName: string;
  settings: DeckLearningSettings;
  onSave: (
    newCardsPerDay: number | null,
  ) => Promise<DeckLearningSettings>;
  onCancel: () => void;
}
```

Use a modal with:

- Heading `Learning settings for {deckName}`.
- Radio `Use Memora default ({inherited}/day)`.
- Radio `Custom limit`.
- Numeric input `0–999`, enabled only for custom.
- Save and Cancel.
- Inline backend error.

- [ ] **Step 3: Write failing MemoraPage menu integration test**

```ts
it("opens Learning settings from the deck actions menu", async () => {
  const user = userEvent.setup();
  const getDeckLearningSettings = vi.fn().mockResolvedValue({
    deckId: "english",
    inheritedNewCardsPerDay: 20,
    newCardsPerDay: null,
    effectiveNewCardsPerDay: 20,
  });
  renderMemora({ getDeckLearningSettings });

  await user.click(await screen.findByRole("button", {
    name: "Actions for English",
  }));
  await user.click(screen.getByRole("button", {
    name: "Learning settings",
  }));

  expect(getDeckLearningSettings).toHaveBeenCalledWith("english");
  expect(await screen.findByRole("dialog", {
    name: "Learning settings for English",
  })).toBeInTheDocument();
});
```

- [ ] **Step 4: Add menu state and callbacks**

Extend `MemoraPageProps`:

```ts
getDeckLearningSettings: (
  deckId: string,
) => Promise<DeckLearningSettings>;
updateDeckLearningSettings: (
  deckId: string,
  newCardsPerDay: number | null,
) => Promise<DeckLearningSettings>;
```

Extend the deck-row mode:

```ts
type DeckRowMode = "idle" | "rename" | "delete" | "learning";
```

When `Learning settings` is selected:

1. Close the `…` menu.
2. Load settings.
3. Show loading state or dialog.
4. Save through `updateDeckLearningSettings`.
5. Close only after success.

Add the menu item before Rename:

```tsx
<button type="button" onClick={openLearningSettings}>
  Learning settings
</button>
```

- [ ] **Step 5: Wire App API props**

Add the two deck-settings functions to `LearningApi`, `nativeLearningApi`, and the `MemoraPage` call site.

- [ ] **Step 6: Add dialog styles**

Add a focused modal style using the existing settings modal backdrop tokens. Include responsive width and keyboard-visible focus states.

- [ ] **Step 7: Run deck settings tests**

Run:

```bash
cd apps/desktop
npm test -- --run \
  src/features/memora/DeckLearningSettingsDialog.test.tsx \
  src/features/memora/MemoraPage.test.tsx \
  src/app/App.test.tsx
```

Expected: dialog and integration tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/features/memora/DeckLearningSettingsDialog.tsx \
  apps/desktop/src/features/memora/DeckLearningSettingsDialog.test.tsx \
  apps/desktop/src/features/memora/MemoraPage.tsx \
  apps/desktop/src/features/memora/MemoraPage.test.tsx \
  apps/desktop/src/app/App.tsx \
  apps/desktop/src/styles/tokens.css
git commit -m "feat: add deck learning overrides"
```

---

### Task 10: Retire unsafe production review paths and align counts

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/src/learning.rs`
- Modify: `apps/desktop/src-tauri/src/commands_tests.rs`
- Modify: `apps/desktop/src/lib/learning.ts`
- Modify: `apps/desktop/src/lib/learning.test.ts`
- Modify: `apps/desktop/src/features/memora/MemoraPage.tsx`
- Modify: `apps/desktop/src/features/memora/MemoraPage.test.tsx`

- [ ] **Step 1: Write failing tests that production code no longer exposes unrestricted rating**

In TypeScript, remove legacy imports and assert only session commands exist in the bridge test. In Rust, add a test around the generated test app or command list proving `rate_card` and `preview_card_review` are not registered for production invocation.

Keep low-level scheduler/repository methods available to Rust unit tests; remove only unrestricted Tauri exposure.

- [ ] **Step 2: Remove legacy frontend review functions**

Delete from `lib/learning.ts`:

```ts
listDueCards
previewCardReview
rateCard
```

Remove them from `LearningApi`, `nativeLearningApi`, App test fixtures, and imports.

Keep `listDeckCards` because Practice All and card management still use it.

- [ ] **Step 3: Remove unsafe Tauri commands**

Remove from `generate_handler!`:

```rust
commands::list_due_cards,
commands::preview_card_review,
commands::rate_card,
```

Delete their command functions and command-only helpers from `commands.rs`. Keep `elapsed_days` and interval formatting in scheduler/study code if still used.

- [ ] **Step 4: Add a safe ready-count command**

Memora currently uses `listDueCards().length`, which has a 100-card cap and mixes queue behavior with dashboard counts. Add:

```rust
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StudyReadyCountsPayload {
    pub learning: i64,
    pub review: i64,
    pub new: i64,
    pub total: i64,
}

#[tauri::command]
pub fn get_study_ready_counts(
    state: State<'_, LibraryStore>,
) -> Result<StudyReadyCountsPayload, String>;
```

The query uses current due learning/review counts plus the remaining effective new allowance per deck. It must not create a session.

Add `getStudyReadyCounts()` to the frontend bridge and change the Memora header to display `Review {total} Ready`.

- [ ] **Step 5: Run command, bridge, Memora, and App tests**

Run:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml commands_tests
cd apps/desktop
npm test -- --run \
  src/lib/learning.test.ts \
  src/features/memora/MemoraPage.test.tsx \
  src/app/App.test.tsx
```

Expected: no production path invokes unrestricted rating or preview commands.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src-tauri/src/commands.rs \
  apps/desktop/src-tauri/src/lib.rs \
  apps/desktop/src-tauri/src/learning.rs \
  apps/desktop/src-tauri/src/commands_tests.rs \
  apps/desktop/src/lib/learning.ts \
  apps/desktop/src/lib/learning.test.ts \
  apps/desktop/src/features/memora/MemoraPage.tsx \
  apps/desktop/src/features/memora/MemoraPage.test.tsx
git commit -m "refactor: enforce session-only Memora reviews"
```

---

### Task 11: Add end-to-end coverage and documentation

**Files:**
- Modify: `apps/desktop/tests/e2e/learning.spec.ts`
- Modify: `apps/desktop/README.md`

- [ ] **Step 1: Add a stateful Tauri mock for sessions**

Extend the Playwright init script with:

- `memoraSettings`.
- `deckOverrides`.
- `reviewLogs`.
- `sessions`.
- Cards with `learningStep`.

Implement mock commands with the same argument shapes as production:

```ts
if (command === "start_study_session") {
  return buildSession(args.scope as StudyScope);
}
if (command === "refresh_study_session") {
  return buildSession(sessions.get(args.sessionId)!.scope);
}
if (command === "rate_study_card") {
  return applyRating(args.payload as StudyRatingInput);
}
if (command === "get_memora_settings") return memoraSettings;
if (command === "update_memora_settings") {
  memoraSettings = args.settings as MemoraSettings;
  return memoraSettings;
}
if (command === "get_deck_learning_settings") {
  return resolvedDeckSettings(args.deckId as string);
}
if (command === "update_deck_learning_settings") {
  const payload = args.payload as {
    deckId: string;
    newCardsPerDay: number | null;
  };
  deckOverrides.set(payload.deckId, payload.newCardsPerDay);
  return resolvedDeckSettings(payload.deckId);
}
```

- [ ] **Step 2: Add E2E scenario for learning and practice**

Add one scenario:

1. Open Memora.
2. Start Review Today.
3. Reveal a new card and click Again.
4. Assert the waiting state shows a 1-minute next step.
5. Advance the mock clock and refresh.
6. Click Good, advance to the 10-minute step, then graduate.
7. Record the persisted due/state/log count.
8. Open Practice All and rate the same card.
9. Assert persisted due/state/log count did not change.

- [ ] **Step 3: Add E2E scenario for settings and override**

Add:

1. Open Settings.
2. Select `Apps → Memora`.
3. Set new cards to `0` and save.
4. Return to Memora and confirm reviews remain ready while new cards are absent.
5. Open a deck's `… → Learning settings`.
6. Set a custom limit of `3`.
7. Reopen and verify `Custom limit` and `3`.

- [ ] **Step 4: Run E2E tests**

Start Vite in one terminal:

```bash
cd apps/desktop
npm run dev -- --host 127.0.0.1
```

Then run:

```bash
cd apps/desktop
npm run test:e2e -- tests/e2e/learning.spec.ts
```

Expected: all learning E2E scenarios pass.

- [ ] **Step 5: Update README**

Replace the one-line scheduler description with:

```markdown
Memora uses fixed 1-minute and 10-minute learning steps before FSRS takes
over long-term scheduling. Review Today is built by the native backend,
prioritizes due learning and review cards, and applies the configured
new-card allowance. Practice All never changes the real schedule.

The default new-card allowance and desired retention live under
Settings → Apps → Memora. A deck can override only its new-card allowance
from the deck row's … → Learning settings menu.
```

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/tests/e2e/learning.spec.ts apps/desktop/README.md
git commit -m "test: cover practical Memora learning"
```

---

### Task 12: Full verification and fresh desktop runtime

**Files:**
- No planned source changes; fix only failures directly caused by Tasks 1–11.

- [ ] **Step 1: Record the exact checkout**

Run:

```bash
git rev-parse --short HEAD
git status --short
```

Expected: record the commit under test and a clean worktree.

- [ ] **Step 2: Run Rust formatting and static checks**

Run:

```bash
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings
```

Expected: both commands exit successfully with no warnings.

- [ ] **Step 3: Run the full Rust suite**

Run:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

Expected: all Rust unit, migration, repository, scheduler, command, and integration tests pass.

- [ ] **Step 4: Run frontend unit tests and production build**

Run:

```bash
cd apps/desktop
npm test
npm run build
```

Expected: all Vitest tests pass and the TypeScript/Vite production build succeeds.

- [ ] **Step 5: Run Playwright**

With the Vite test server running:

```bash
cd apps/desktop
npm run test:e2e
```

Expected: all Playwright tests pass.

- [ ] **Step 6: Identify and stop stale desktop processes**

Run:

```bash
pgrep -af 'tauri dev|vite|library_desktop' || true
```

Do not reuse an existing process. Stop only development processes associated with this checkout, then record:

```bash
git rev-parse --short HEAD
git status --short
```

- [ ] **Step 7: Launch a fresh Tauri development runtime**

Run:

```bash
cd apps/desktop
npm run tauri dev
```

Manually verify in the freshly launched app:

1. `Settings → Apps → Memora` loads, saves, restores defaults, and validates ranges.
2. Deck `… → Learning settings` inherits and saves a custom limit.
3. Review Today excludes suspended/future cards.
4. Again on a new card shows a 1-minute step.
5. Good advances to 10 minutes, then graduates.
6. Again on review enters 10-minute relearning.
7. Practice All visibly states it does not affect scheduling.
8. Closing/reopening study creates a current session without duplicate logs.

- [ ] **Step 8: Record the runtime handoff**

The final implementation handoff must state:

- Tested commit.
- Launch mode: `tauri dev`.
- Checkout path: `/Users/jason/project/corelib/apps/desktop`.
- Whether fresh WKWebView runtime verification passed.

Do not claim release-app verification unless a fresh `npm run tauri build` was also performed and the artifact at:

```text
/Users/jason/project/corelib/apps/desktop/src-tauri/target/release/bundle/macos/Library.app
```

was launched after confirming its modification time is newer than the build start.

- [ ] **Step 9: Route verification failures back to their owning task**

If verification fails, return to the task that owns the failing file, add a focused regression test there, apply the smallest fix, rerun that task's verification commands, and use that task's exact `git add`/commit instructions. Afterward rerun Steps 1–8 of this task. Do not create an empty or catch-all verification commit.

---

## Completion checklist

- [ ] Migration `0010_memora_study` upgrades current databases without losing cards or logs.
- [ ] Global settings and per-deck overrides are persisted in SQLite.
- [ ] Scheduler covers every valid lifecycle/rating transition.
- [ ] Queue priority is learning/relearning → review → new.
- [ ] Daily new-card limits are enforced at first persisted rating.
- [ ] Ratings require valid, unconsumed session grants.
- [ ] Duplicate retries produce one review log.
- [ ] Real study no longer uses `list_due_cards`, per-card preview, or unrestricted `rate_card`.
- [ ] Practice All has no persistence callback or schedule side effects.
- [ ] Settings appear at `Settings → Apps → Memora`.
- [ ] Deck overrides appear in the deck `…` menu.
- [ ] Full Rust, frontend, build, and E2E verification pass.
- [ ] A fresh Tauri runtime is used before reporting desktop behavior as verified.
