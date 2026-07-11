# Memora Card Browser and Card Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the deck slideshow with a deck-scoped Card Browser that supports safe editing, filtering, bulk move/suspend/trash operations, and a recoverable global Trash.

**Architecture:** SQLite and Rust remain authoritative for lifecycle state and atomic bulk mutations. Typed Tauri commands expose paginated queries and mutations to React; React owns only transient query, selection, editor-draft, and dirty-guard state. Trashed cards use `deleted_at`, retain scheduler/history/source data, and are excluded from every active search/review path.

**Tech Stack:** Tauri 2, Rust, rusqlite, React 18, TypeScript, Vitest/Testing Library, Playwright, SQLite/FTS5, CSS.

**Design reference:** `docs/superpowers/specs/2026-07-11-memora-card-browser-lifecycle-design.md`

---

## File map

### Create

- `apps/desktop/src-tauri/migrations/0006_card_lifecycle.sql` — rebuild `cards` for nullable deck ownership and add trash metadata/indexes.
- `apps/desktop/src/features/memora/CardBrowserPage.tsx` — browser orchestration and query refresh.
- `apps/desktop/src/features/memora/CardBrowserPage.test.tsx` — browser integration behavior.
- `apps/desktop/src/features/memora/CardBrowserToolbar.tsx` — search/filter/sort controls.
- `apps/desktop/src/features/memora/CardTable.tsx` — accessible table and explicit selection.
- `apps/desktop/src/features/memora/CardBulkActions.tsx` — atomic bulk-action UI.
- `apps/desktop/src/features/memora/CardEditorPanel.tsx` — shared create/edit panel and dirty guard.
- `apps/desktop/src/features/memora/CardEditorPanel.test.tsx` — editor validation and navigation protection.
- `apps/desktop/src/features/memora/TrashPage.tsx` — global Trash list, restore, permanent delete, empty Trash.
- `apps/desktop/src/features/memora/TrashPage.test.tsx` — Trash behavior.

### Modify

- `apps/desktop/src-tauri/src/library_db.rs` — register migration `0006`.
- `apps/desktop/src-tauri/src/library_db_tests.rs` — verify migration preservation and nullable deck behavior.
- `apps/desktop/src-tauri/src/model.rs` — request/response payloads for browser, editor, bulk mutations, and Trash.
- `apps/desktop/src-tauri/Cargo.toml` — add URL-safe cursor encoding for keyset pagination.
- `apps/desktop/src-tauri/src/learning.rs` — repository queries, lifecycle invariants, atomic mutations, FTS integration.
- `apps/desktop/src-tauri/src/learning_tests.rs` — repository and rollback tests.
- `apps/desktop/src-tauri/src/commands.rs` — typed Tauri command adapters.
- `apps/desktop/src-tauri/src/commands_tests.rs` — command validation/serialization tests.
- `apps/desktop/src-tauri/src/lib.rs` — register new commands.
- `apps/desktop/src/domain/learning.ts` — browser query/page/row and mutation types.
- `apps/desktop/src/lib/learning.ts` — frontend command bridge.
- `apps/desktop/src/lib/learning.test.ts` — exact invoke-contract tests.
- `apps/desktop/src/features/memora/MemoraPage.tsx` — add global Trash entry point.
- `apps/desktop/src/features/memora/DeckCardsPage.tsx` — remove after route replacement, or reduce to a temporary re-export during one commit only.
- `apps/desktop/src/app/App.tsx` — route Card Browser and Trash, wire API operations, remove slideshow dependencies.
- `apps/desktop/src/app/App.test.tsx` — route-level integration coverage.
- `apps/desktop/src/styles/tokens.css` — browser/table/panel/bulk/trash responsive styles; remove obsolete slideshow rules after tests migrate.
- `apps/desktop/tests/e2e/learning.spec.ts` — browser/Trash smoke coverage with an invoke stub.
- `PROJECT_MEMORY.md` and `apps/desktop/README.md` — document the delivered lifecycle baseline and verification counts.

## Contract decisions to keep consistent

Use these TypeScript-facing JSON names throughout Rust serde and React:

```ts
type CardLifecycleState = "new" | "learning" | "review" | "relearning" | "suspended";
type CardSort = "updated_desc" | "created_desc" | "due_asc" | "front_asc";
type TrashSort = "deleted_desc" | "front_asc";

interface CardBrowserQuery {
  deckId: string;
  query: string;
  states: CardLifecycleState[];
  tags: string[];
  sort: CardSort;
  cursor: string | null;
  limit: number;
}

interface CardBrowserRow extends Omit<LearningCard, "deckId"> {
  deckId: string | null;
  deckName: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deletedFromDeckName: string | null;
}

interface CardPage {
  rows: CardBrowserRow[];
  total: number;
  nextCursor: string | null;
}

interface TrashQuery {
  query: string;
  sort: TrashSort;
  cursor: string | null;
  limit: number;
}

interface BulkCardsInput {
  cardIds: string[];
}

interface BulkResult {
  affectedIds: string[];
  affectedCount: number;
}
```

For the first implementation, use a page size of 100, reject limits outside `1..=200`, and encode cursors as URL-safe base64 JSON containing the selected sort value plus card ID. Never accept raw SQL fragments from the frontend.

---

### Task 1: Add the card lifecycle migration

**Files:**
- Create: `apps/desktop/src-tauri/migrations/0006_card_lifecycle.sql`
- Modify: `apps/desktop/src-tauri/src/library_db.rs`
- Test: `apps/desktop/src-tauri/src/library_db_tests.rs`

- [ ] **Step 1: Write failing migration tests**

Add tests that open a database at migration `0005`, insert a deck, card, source, tag, and review log, then open it through `LibraryDatabase::open`. Assert the row survives with these values:

```rust
assert_eq!(card.0.as_deref(), Some("deck-1")); // deck_id
assert_eq!(card.1, None);                      // deleted_at
assert_eq!(card.2, None);                      // deleted_from_deck_name
assert_eq!(card.3, None);                      // suspended_from_state
assert_eq!(card.4, "review");
assert_eq!(card.5, 4);                         // reps
```

Also inspect `PRAGMA table_info(cards)` and assert `deck_id` has `notnull = 0`. Assert `schema_migrations` contains `0006_card_lifecycle`.

- [ ] **Step 2: Run the focused test and verify failure**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml library_db_tests::upgrading_0005_adds_card_lifecycle_without_data_loss
```

Expected: FAIL because migration `0006_card_lifecycle` is not registered and the new columns do not exist.

- [ ] **Step 3: Add and register migration `0006`**

Use a table rebuild because SQLite cannot remove `NOT NULL` from `deck_id` in place. The migration must follow this shape:

```sql
PRAGMA foreign_keys = OFF;

CREATE TABLE cards_v2 (
  id TEXT PRIMARY KEY NOT NULL,
  deck_id TEXT REFERENCES decks(id),
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('new','learning','review','relearning','suspended')),
  due_at TEXT NOT NULL,
  stability REAL,
  difficulty REAL,
  memory_state_json TEXT,
  reps INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  last_review_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  deleted_from_deck_name TEXT,
  suspended_from_state TEXT CHECK (suspended_from_state IN ('new','learning','review','relearning') OR suspended_from_state IS NULL),
  CHECK ((deleted_at IS NULL AND deck_id IS NOT NULL) OR deleted_at IS NOT NULL)
);

INSERT INTO cards_v2 (
  id, deck_id, front, back, state, due_at, stability, difficulty,
  memory_state_json, reps, lapses, last_review_at, created_at, updated_at
)
SELECT id, deck_id, front, back, state, due_at, stability, difficulty,
       memory_state_json, reps, lapses, last_review_at, created_at, updated_at
FROM cards;

DROP TABLE cards;
ALTER TABLE cards_v2 RENAME TO cards;
CREATE INDEX cards_active_deck_updated_id ON cards(deck_id, updated_at DESC, id) WHERE deleted_at IS NULL;
CREATE INDEX cards_active_state_due_id ON cards(state, due_at, id) WHERE deleted_at IS NULL;
CREATE INDEX cards_trash_deleted_id ON cards(deleted_at DESC, id) WHERE deleted_at IS NOT NULL;

PRAGMA foreign_keys = ON;
```

Keep the existing child tables and their foreign keys targeting the restored table name `cards`. Finish the migration test with `PRAGMA foreign_key_check` returning zero rows and explicit row-count/content assertions for `card_sources`, `card_tags`, and `review_logs`.

Change `MIGRATIONS` in `library_db.rs` from length 5 to 6 and append:

```rust
(
    "0006_card_lifecycle",
    include_str!("../migrations/0006_card_lifecycle.sql"),
),
```

- [ ] **Step 4: Run migration and database tests**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml library_db_tests
```

Expected: all `library_db_tests` pass, including `PRAGMA foreign_key_check`.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/migrations/0006_card_lifecycle.sql apps/desktop/src-tauri/src/library_db.rs apps/desktop/src-tauri/src/library_db_tests.rs
git commit -m "feat: add recoverable card lifecycle schema"
```

### Task 2: Define backend and frontend lifecycle contracts

**Files:**
- Modify: `apps/desktop/src-tauri/src/model.rs`
- Modify: `apps/desktop/src/domain/learning.ts`
- Test: inline serde tests in `apps/desktop/src-tauri/src/model.rs`

- [ ] **Step 1: Add failing serde contract tests**

Construct a `CardPagePayload` containing one row and assert JSON keys are exactly `deckId`, `deckName`, `createdAt`, `updatedAt`, `deletedAt`, `deletedFromDeckName`, and `nextCursor`. Add a `BulkResultPayload` assertion for `affectedIds` and `affectedCount`.

- [ ] **Step 2: Verify the model test fails**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml model::tests::card_browser_payloads_use_frontend_contract
```

Expected: compile failure because the payload types do not exist.

- [ ] **Step 3: Add Rust request/response models**

Define typed structs/enums equivalent to:

```rust
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardBrowserQueryPayload {
    pub deck_id: String,
    pub query: String,
    pub states: Vec<String>,
    pub tags: Vec<String>,
    pub sort: String,
    pub cursor: Option<String>,
    pub limit: usize,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCardPayload { pub card_id: String, pub front: String, pub back: String, pub tags: Vec<String> }

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveCardsPayload { pub card_ids: Vec<String>, pub destination_deck_id: String }

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetCardsSuspendedPayload { pub card_ids: Vec<String>, pub suspended: bool }

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreCardsPayload { pub card_ids: Vec<String>, pub destination_deck_id: Option<String> }
```

Add `CardBrowserRowPayload`, `CardPagePayload`, `BulkCardsPayload`, and `BulkResultPayload`. Keep active `LearningCardSummary.deck_id: String` strict. Use `CardBrowserRowPayload.deck_id: Option<String>` for Browser and Trash so review APIs cannot serialize a card without an active deck.

- [ ] **Step 4: Add matching TypeScript types**

Add the contract types from the “Contract decisions” section to `domain/learning.ts`. Keep active `LearningCard.deckId: string`; use `CardBrowserRow.deckId: string | null` via `Omit<LearningCard, "deckId">` so review code cannot accidentally accept a trashed card.

- [ ] **Step 5: Run model and frontend type checks**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml model::tests
npm --prefix apps/desktop run build
```

Expected: model tests and TypeScript production build pass.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src-tauri/src/model.rs apps/desktop/src/domain/learning.ts
git commit -m "feat: define card browser lifecycle contracts"
```

### Task 3: Implement active-card query, filtering, sorting, and pagination

**Files:**
- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Modify: `apps/desktop/src-tauri/src/learning.rs`
- Test: `apps/desktop/src-tauri/src/learning_tests.rs`

- [ ] **Step 1: Write repository tests first**

Create cards spanning two decks, all lifecycle states, mixed-case tags, different timestamps, and one trashed row. Test:

```rust
let page = db.query_deck_cards(CardBrowserQuery {
    deck_id: deck.id.clone(),
    query: "ATP".into(),
    states: vec!["review".into()],
    tags: vec!["Biology".into()],
    sort: CardSort::UpdatedDesc,
    cursor: None,
    limit: 2,
})?;
assert_eq!(page.rows.iter().map(|row| row.id.as_str()).collect::<Vec<_>>(), vec!["newest", "older"]);
assert_eq!(page.total, 3);
assert!(page.next_cursor.is_some());
```

Assert the next cursor returns the remaining card with no duplicates, search is case-insensitive across Front/Back/tags, multi-state filters use OR, multi-tag filters use AND, and trashed cards never appear.

- [ ] **Step 2: Run focused tests and verify failure**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml learning_tests::card_browser
```

Expected: compile failure because query types/methods are missing.

- [ ] **Step 3: Implement validated query construction**

Add `base64 = "0.22.1"` to `Cargo.toml`. Add internal `CardSort` parsing with an allowlist. Trim query/tags, deduplicate states/tags case-insensitively, validate lifecycle states, enforce `1..=200`, and encode/decode cursor JSON with `base64::engine::general_purpose::URL_SAFE_NO_PAD`. Build SQL with bound parameters only. Use `EXISTS` subqueries for tags so multiple tags mean AND. Add `deleted_at IS NULL` to the base predicate.

Return `limit + 1` rows to determine `next_cursor`, truncate to `limit`, and compute `total` using the same predicate without pagination. Stable order must append `c.id` to every sort:

```text
updated_desc => c.updated_at DESC, c.id ASC
created_desc => c.created_at DESC, c.id ASC
due_asc      => c.due_at ASC, c.id ASC
front_asc    => c.front COLLATE NOCASE ASC, c.id ASC
```

- [ ] **Step 4: Run repository tests**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml learning_tests::card_browser
```

Expected: all Card Browser query tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock apps/desktop/src-tauri/src/learning.rs apps/desktop/src-tauri/src/learning_tests.rs
git commit -m "feat: query deck cards for browser"
```

### Task 4: Implement atomic edit, move, and suspend operations

**Files:**
- Modify: `apps/desktop/src-tauri/src/learning.rs`
- Test: `apps/desktop/src-tauri/src/learning_tests.rs`

- [ ] **Step 1: Write transaction and invariant tests**

Test that `update_card` changes Front/Back/tags and `updated_at` but preserves `state`, `due_at`, `memory_state_json`, reps, lapses, source, and review logs. Test move and suspend/unsuspend on multiple IDs. Assert duplicate IDs affect each card once.

For each bulk operation, include one missing or trashed ID and assert all valid rows remain unchanged. Assert an absent destination deck rolls back the entire move.

- [ ] **Step 2: Verify tests fail**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml learning_tests::lifecycle_active
```

Expected: compile failure because lifecycle methods do not exist.

- [ ] **Step 3: Implement shared transaction validation**

Add a helper that trims, rejects empty ID lists, deduplicates IDs, loads all cards inside the transaction, and checks exact count and `deleted_at IS NULL`. Use a single timestamp per operation.

Implement:

```rust
pub fn update_card(&mut self, input: UpdateCard) -> Result<LearningCardSummary>;
pub fn move_cards(&mut self, card_ids: &[String], destination_deck_id: &str) -> Result<BulkResult>;
pub fn set_cards_suspended(&mut self, card_ids: &[String], suspended: bool) -> Result<BulkResult>;
```

Suspend copies the current lifecycle state to `suspended_from_state`, then sets `state = 'suspended'` without altering scheduler memory or due time. Unsuspend restores the exact value from `suspended_from_state` and clears that column. Reject suspend when already suspended and reject unsuspend when `suspended_from_state` is null; never guess `review` as the prior state.

Update `card_text` in the same transaction after edits; moves and suspension do not need FTS rewrites unless the indexed body includes deck name.

- [ ] **Step 4: Run lifecycle tests**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml learning_tests::lifecycle_active
```

Expected: edit/move/suspend tests and rollback assertions pass.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/migrations/0006_card_lifecycle.sql apps/desktop/src-tauri/src/learning.rs apps/desktop/src-tauri/src/learning_tests.rs
git commit -m "feat: manage active card lifecycle atomically"
```

### Task 5: Implement Trash, restore, deck deletion, and active-read isolation

**Files:**
- Modify: `apps/desktop/src-tauri/src/learning.rs`
- Test: `apps/desktop/src-tauri/src/learning_tests.rs`

- [ ] **Step 1: Write Trash and isolation tests**

Cover `trash_cards`, `list_trashed_cards`, `restore_cards`, `delete_cards_permanently`, `empty_trash`, and deck deletion. Assert soft delete preserves source/tags/review logs/FSRS fields, removes FTS visibility, and keeps the original deck ID/name. Assert restore recreates FTS.

Delete a deck containing cards and assert in one transaction:

```rust
assert!(db.deck_by_id("deck-1")?.is_none());
assert_eq!(trashed.deck_id, None);
assert_eq!(trashed.deleted_from_deck_name.as_deref(), Some("Biology"));
assert!(db.restore_cards(&[trashed.id], None).is_err());
assert!(db.restore_cards(&[trashed.id], Some("deck-2")).is_ok());
```

Assert due cards, card lookup used by review, preview/rating, cards-in-deck, and learning search reject or exclude trashed cards.

- [ ] **Step 2: Verify tests fail**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml learning_tests::trash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml learning_tests::trashed_cards_never_enter_active_reads
```

Expected: missing methods and/or assertions fail because current reads do not filter `deleted_at`.

- [ ] **Step 3: Implement Trash transactions**

Implement:

```rust
pub fn trash_cards(&mut self, card_ids: &[String]) -> Result<BulkResult>;
pub fn list_trashed_cards(&self, query: TrashQuery) -> Result<CardPagePayload>;
pub fn restore_cards(&mut self, card_ids: &[String], destination: Option<&str>) -> Result<BulkResult>;
pub fn delete_cards_permanently(&mut self, card_ids: &[String]) -> Result<BulkResult>;
pub fn empty_trash(&mut self) -> Result<BulkResult>;
```

Soft delete sets `deleted_at`, stores the current deck name in `deleted_from_deck_name`, and deletes `card_text` rows. Restore uses the preserved deck when it exists; when `deck_id` is null or missing, require a destination. Clear both deletion fields and rebuild FTS on success.

Replace current `delete_deck` behavior (`DELETE FROM cards`) with the transactional deck-to-Trash behavior from the design. Permanent delete relies on existing child-table cascades and explicitly deletes FTS rows.

- [ ] **Step 4: Add `deleted_at IS NULL` to every active path**

Audit and update at minimum:

```text
count_cards_in_deck
card_memory_state
due_cards
card_by_id / get_card
card_source when reached from active review
cards_in_deck
apply_review_atomic
learning_search
preview/rating preconditions
```

Do not return a generic “not found” from rating when the card is trashed; return `card is in Trash` so UI/debugging distinguishes lifecycle state.

- [ ] **Step 5: Run all learning tests**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml learning_tests
```

Expected: all repository, scheduler isolation, rollback, and legacy learning tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src-tauri/src/learning.rs apps/desktop/src-tauri/src/learning_tests.rs
git commit -m "feat: add recoverable Memora Trash"
```

### Task 6: Expose lifecycle commands through Tauri and TypeScript

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands.rs`
- Modify: `apps/desktop/src-tauri/src/commands_tests.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src/lib/learning.ts`
- Modify: `apps/desktop/src/lib/learning.test.ts`

- [ ] **Step 1: Write frontend bridge tests**

Assert exact command and nesting for every bridge function, for example:

```ts
await queryDeckCards(input, call);
expect(call).toHaveBeenCalledWith("query_deck_cards", { input });

await moveCards(["c1", "c2"], "d2", call);
expect(call).toHaveBeenCalledWith("move_cards", {
  input: { cardIds: ["c1", "c2"], destinationDeckId: "d2" },
});
```

Cover `updateCard`, `moveCards`, `setCardsSuspended`, `trashCards`, `listTrashedCards`, `restoreCards`, `deleteCardsPermanently`, and `emptyTrash`.

- [ ] **Step 2: Verify bridge tests fail**

```bash
npm --prefix apps/desktop test -- --run src/lib/learning.test.ts
```

Expected: compile/test failure because exports are missing.

- [ ] **Step 3: Add Rust command adapters and registration**

Each command locks the database once and delegates to one repository operation. Keep payload nesting `{ input }` for structured requests. Add all commands to `tauri::generate_handler!` in `lib.rs`.

Add command tests for empty IDs, limit bounds, invalid states/sorts, and error propagation. Validation belongs in repository/domain helpers so Tauri adapters stay thin.

- [ ] **Step 4: Add TypeScript bridge functions**

Use signatures:

```ts
export function queryDeckCards(input: CardBrowserQuery, call: Invoke = invoke as Invoke): Promise<CardPage>;
export function updateCard(input: UpdateCardInput, call?: Invoke): Promise<LearningCard>;
export function moveCards(cardIds: string[], destinationDeckId: string, call?: Invoke): Promise<BulkResult>;
export function setCardsSuspended(cardIds: string[], suspended: boolean, call?: Invoke): Promise<BulkResult>;
export function trashCards(cardIds: string[], call?: Invoke): Promise<BulkResult>;
export function listTrashedCards(input: TrashQuery, call?: Invoke): Promise<CardPage>;
export function restoreCards(cardIds: string[], destinationDeckId?: string, call?: Invoke): Promise<BulkResult>;
export function deleteCardsPermanently(cardIds: string[], call?: Invoke): Promise<BulkResult>;
export function emptyTrash(call?: Invoke): Promise<BulkResult>;
```

- [ ] **Step 5: Run bridge, command, and build checks**

```bash
npm --prefix apps/desktop test -- --run src/lib/learning.test.ts
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml commands_tests
npm --prefix apps/desktop run build
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src-tauri/src/commands.rs apps/desktop/src-tauri/src/commands_tests.rs apps/desktop/src-tauri/src/lib.rs apps/desktop/src/lib/learning.ts apps/desktop/src/lib/learning.test.ts
git commit -m "feat: expose card lifecycle commands"
```

### Task 7: Build the Card Browser table and toolbar

**Files:**
- Create: `apps/desktop/src/features/memora/CardBrowserToolbar.tsx`
- Create: `apps/desktop/src/features/memora/CardTable.tsx`
- Create: `apps/desktop/src/features/memora/CardBrowserPage.tsx`
- Create: `apps/desktop/src/features/memora/CardBrowserPage.test.tsx`
- Modify: `apps/desktop/src/styles/tokens.css`

- [ ] **Step 1: Write browser interaction tests**

Render with injected API functions. Test initial query, 250ms debounced search, immediate state/tag/sort query, stale-response protection, page loading, empty/error/retry states, row-to-editor selection, and selection clearing when `deck.id` changes.

Include the race test:

```ts
const first = deferred<CardPage>();
const second = deferred<CardPage>();
queryDeckCards.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
// type first query, then second; resolve second before first
expect(screen.getByText("new result")).toBeInTheDocument();
expect(screen.queryByText("stale result")).not.toBeInTheDocument();
```

Test explicit controls: row checkbox changes selection, row “Edit” button opens editor, and clicking arbitrary row text does not toggle the checkbox.

- [ ] **Step 2: Verify tests fail**

```bash
npm --prefix apps/desktop test -- --run src/features/memora/CardBrowserPage.test.tsx
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement focused components**

`CardBrowserPage` owns query/request-token/page/selection/open-card state. `CardBrowserToolbar` is controlled and emits normalized values. `CardTable` uses semantic `<table>`, column headers, per-row checkbox labels (`Select card: <front>`), and a separate Edit button.

Selection rule: preserve explicit selected IDs while filters change, show `N selected · M visible`, and clear IDs only after a successful mutation reports them removed from the active query or after deck navigation.

- [ ] **Step 4: Add responsive styles**

Use a two-column browser/editor shell at desktop width, horizontal table scrolling below 900px, and a full-width editor overlay/panel below 700px. Reuse existing color/spacing tokens; do not introduce hardcoded theme colors when a token exists.

- [ ] **Step 5: Run browser tests and accessibility assertions**

```bash
npm --prefix apps/desktop test -- --run src/features/memora/CardBrowserPage.test.tsx
```

Expected: all query, race, selection, semantic table, and retry tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/features/memora/CardBrowserToolbar.tsx apps/desktop/src/features/memora/CardTable.tsx apps/desktop/src/features/memora/CardBrowserPage.tsx apps/desktop/src/features/memora/CardBrowserPage.test.tsx apps/desktop/src/styles/tokens.css
git commit -m "feat: add deck-scoped Card Browser"
```

### Task 8: Add the shared side-panel editor and bulk actions

**Files:**
- Create: `apps/desktop/src/features/memora/CardEditorPanel.tsx`
- Create: `apps/desktop/src/features/memora/CardEditorPanel.test.tsx`
- Create: `apps/desktop/src/features/memora/CardBulkActions.tsx`
- Modify: `apps/desktop/src/features/memora/CardBrowserPage.tsx`
- Modify: `apps/desktop/src/features/memora/CardBrowserPage.test.tsx`
- Modify: `apps/desktop/src/styles/tokens.css`

- [ ] **Step 1: Write editor and bulk-action tests**

Cover create/edit mode, required trimmed Front/Back, case-insensitive tag deduplication preserving first spelling, read-only source, Save/Cancel, destination deck, backend failure preserving draft, and successful save refresh.

Dirty guard must cover close, selecting another row, changing deck route, browser Back, and opening Trash. Assert the confirmation offers `Discard` and `Continue editing`; no navigation occurs until Discard.

Bulk tests must assert one API call with all selected IDs, disabled buttons while pending, selection retention on failure, and selection cleanup/refresh on success.

- [ ] **Step 2: Verify tests fail**

```bash
npm --prefix apps/desktop test -- --run src/features/memora/CardEditorPanel.test.tsx src/features/memora/CardBrowserPage.test.tsx
```

Expected: missing editor/bulk components and failing behavior assertions.

- [ ] **Step 3: Implement `CardEditorPanel`**

Use a discriminated prop contract:

```ts
type CardEditorMode =
  | { kind: "create"; deckId: string }
  | { kind: "edit"; card: CardBrowserRow };

interface CardEditorPanelProps {
  mode: CardEditorMode;
  decks: Deck[];
  onCreate(input: CreateCardInput): Promise<LearningCard>;
  onUpdate(input: UpdateCardInput): Promise<LearningCard>;
  onMove(cardIds: string[], destinationDeckId: string): Promise<BulkResult>;
  onSaved(): void;
  onRequestClose(): void;
  registerDirtyGuard(isDirty: boolean): void;
}
```

Compare normalized draft values with the initial model to calculate dirtiness. Do not rely only on `onChange` because changing a value back should clear dirty state.

- [ ] **Step 4: Implement `CardBulkActions`**

Show Move, Suspend, Unsuspend, and Move to Trash. Require a confirmation for Trash stating the exact count. Pass selected IDs once to the backend. Centralize pending/error behavior in `CardBrowserPage` so only one bulk mutation can run at a time.

- [ ] **Step 5: Run focused frontend tests**

```bash
npm --prefix apps/desktop test -- --run src/features/memora/CardEditorPanel.test.tsx src/features/memora/CardBrowserPage.test.tsx
```

Expected: editor, dirty guard, bulk success/failure, and confirmation tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/features/memora/CardEditorPanel.tsx apps/desktop/src/features/memora/CardEditorPanel.test.tsx apps/desktop/src/features/memora/CardBulkActions.tsx apps/desktop/src/features/memora/CardBrowserPage.tsx apps/desktop/src/features/memora/CardBrowserPage.test.tsx apps/desktop/src/styles/tokens.css
git commit -m "feat: edit and bulk manage browser cards"
```

### Task 9: Add global Trash and integrate application routes

**Files:**
- Create: `apps/desktop/src/features/memora/TrashPage.tsx`
- Create: `apps/desktop/src/features/memora/TrashPage.test.tsx`
- Modify: `apps/desktop/src/features/memora/MemoraPage.tsx`
- Modify: `apps/desktop/src/app/App.tsx`
- Modify: `apps/desktop/src/app/App.test.tsx`
- Delete: `apps/desktop/src/features/memora/DeckCardsPage.tsx`
- Modify: `apps/desktop/src/styles/tokens.css`

- [ ] **Step 1: Write Trash tests**

Test list/search/sort, selection, restore to preserved deck, destination requirement when `deckId` is null, failed restore retention, count-based permanent delete confirmation, and Empty Trash confirmation. Trash must not expose Edit, Suspend, or Move to Trash.

- [ ] **Step 2: Write App route tests**

Assert opening a deck renders `CardBrowserPage`, Memora exposes Trash, dirty editor blocks navigation until discard, and Trash Back returns to Memora. Update existing tests that expect slideshow text/rating buttons; review functionality remains covered only through `ReviewPage`/Review today.

- [ ] **Step 3: Verify tests fail**

```bash
npm --prefix apps/desktop test -- --run src/features/memora/TrashPage.test.tsx src/app/App.test.tsx
```

Expected: missing Trash and existing slideshow route assertions fail.

- [ ] **Step 4: Implement Trash and route wiring**

Add route variants:

```ts
| { name: "cardBrowser"; deck: Deck }
| { name: "trash" }
```

Remove `deckCards` and all slideshow preview/rating props. Inject the lifecycle API into `CardBrowserPage` and `TrashPage`. Add a visible Trash action to `MemoraPage`; obtain its count with `listTrashedCards({ query: "", sort: "deleted_desc", cursor: null, limit: 1 }).total` and never load all Trash rows to calculate it.

- [ ] **Step 5: Remove obsolete slideshow code and styles**

Delete `DeckCardsPage.tsx` only after route tests use the new page. Remove `.memora-card-slideshow*`, `.memora-flashcard*`, and obsolete card-list flip styles. Keep shared form/button styles only if still referenced; verify with `rg` before deletion.

- [ ] **Step 6: Run Memora and App tests**

```bash
npm --prefix apps/desktop test -- --run src/features/memora src/app/App.test.tsx
```

Expected: all Memora/App tests pass with no slideshow expectations.

- [ ] **Step 7: Commit**

```bash
git add -A apps/desktop/src/features/memora apps/desktop/src/app/App.tsx apps/desktop/src/app/App.test.tsx apps/desktop/src/styles/tokens.css
git commit -m "feat: route Memora Browser and Trash"
```

### Task 10: Add end-to-end coverage, documentation, and full verification

**Files:**
- Modify: `apps/desktop/tests/e2e/learning.spec.ts`
- Modify: `apps/desktop/README.md`
- Modify: `PROJECT_MEMORY.md`

- [ ] **Step 1: Add a Playwright invoke stub**

The Vite E2E server has no Tauri bridge. Before page load, install a deterministic `window.__TAURI_INTERNALS__.invoke` stub or the exact Tauri v2 global used by the app. Back it with an in-memory fixture that handles deck list, Card Browser query, update, move, suspension, Trash, restore, and permanent delete commands.

- [ ] **Step 2: Add the lifecycle smoke test**

Exercise:

```text
open Memora -> open deck -> verify table
search -> edit Front/Back/tags -> save
select two -> move deck -> open destination
suspend -> unsuspend -> move to Trash
open Trash -> verify absence from active deck
restore -> trash again -> permanently delete
```

Assert count-based confirmations and that one bulk invoke contains both selected IDs.

- [ ] **Step 3: Run Playwright and fix only feature-scoped failures**

```bash
npm --prefix apps/desktop run test:e2e -- learning.spec.ts
```

Expected: lifecycle smoke test passes against the invoke stub.

- [ ] **Step 4: Run complete verification**

```bash
npm --prefix apps/desktop test -- --run
npm --prefix apps/desktop run build
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml -- --check
cargo test --all-targets --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo clippy --all-targets --all-features --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings
npm --prefix apps/desktop run test:e2e
```

Expected: every command exits 0. Record exact frontend/Rust/Playwright test counts in `PROJECT_MEMORY.md`; do not copy the old counts.

- [ ] **Step 5: Perform targeted invariant audit**

```bash
rg -n "FROM cards|JOIN cards|UPDATE cards|DELETE FROM cards" apps/desktop/src-tauri/src
rg -n "DeckCardsPage|card-slideshow|memora-flashcard" apps/desktop/src
```

For every active read found by the first command, verify `deleted_at IS NULL` is present directly or guaranteed by a called helper. The second command must return no obsolete slideshow imports/classes.

- [ ] **Step 6: Update documentation**

Document Browser, side-panel editing, bulk actions, Trash semantics, deck deletion behavior, and verification commands. Move Card Browser/Trash out of “Not implemented”; retain Markdown/Cloze/review queue/import-export as deferred.

- [ ] **Step 7: Commit final verification and docs**

```bash
git add apps/desktop/tests/e2e/learning.spec.ts apps/desktop/README.md PROJECT_MEMORY.md
git commit -m "test: verify Memora card lifecycle workflow"
```

---

## Gemini execution notes

1. Execute tasks in order; do not combine schema, backend, and UI into one large commit.
2. Use TDD at every task: add the named failing test, run it, implement the smallest passing change, rerun, then commit.
3. Preserve unrelated user changes and the untracked `.superpowers/` directory.
4. Do not change FSRS parameters or review behavior in this feature.
5. Do not implement Markdown, Cloze, global active-card browsing, or review queue improvements.
6. Migration `0006` must finish with zero `PRAGMA foreign_key_check` rows and preserve all child-table rows; rebuild child tables inside Task 1 when required by the target SQLite behavior.
7. Before claiming completion, paste the exact exit status/test counts from all six verification commands in Task 10.
