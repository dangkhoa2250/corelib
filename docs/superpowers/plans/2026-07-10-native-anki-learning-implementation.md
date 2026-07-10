# Native Anki Learning MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a native Anki-like learning module: create editable cards from PDF selections, review them with FSRS, and reopen their source pages.

**Architecture:** Rust owns SQLite migrations, card/review transactions, and an adapter around the official FSRS Rust crate. React owns selection capture, card composition, Review today, and card/deck search. Existing stable document IDs link every source anchor to the Library.

**Tech Stack:** Tauri 2, Rust, SQLite/FTS5, FSRS Rust crate version 6.6.0, chrono, React, TypeScript, Vitest, Playwright.

---

## File map

~~~text
apps/desktop/
  src/domain/learning.ts
  src/lib/learning.ts
  src/features/reader/readerSelection.ts
  src/features/reader/CardSelectionToolbar.tsx
  src/features/cards/CardComposer.tsx
  src/features/review/ReviewPage.tsx
  src/features/decks/DeckSelector.tsx
  src-tauri/migrations/0004_learning.sql
  src-tauri/src/learning.rs
  src-tauri/src/scheduler.rs
  tests/e2e/learning.spec.ts
~~~

### Task 1: Learning schema and contracts

**Files:**
- Create: `apps/desktop/src-tauri/migrations/0004_learning.sql`
- Create: `apps/desktop/src/domain/learning.ts`
- Create: `apps/desktop/src/domain/learning.test.ts`
- Modify: `apps/desktop/src-tauri/src/library_db.rs`
- Modify: `apps/desktop/src-tauri/src/model.rs`

- [ ] **Step 1: Add a failing domain contract test**

~~~ts
import { expect, it } from "vitest";
import { isSchedulableCard, type LearningCard } from "./learning";

it("accepts a new card with independent Front and Back fields", () => {
  const card: LearningCard = {
    id:"card-1", deckId:"deck-1", front:"selected PDF text", back:"my answer",
    state:"new", dueAt:"2026-07-10T00:00:00Z", reps:0, lapses:0,
    stability:null, difficulty:null, lastReviewAt:null, source:null, tags:[],
  };
  expect(isSchedulableCard(card)).toBe(true);
});
~~~

- [ ] **Step 2: Verify the test fails**

Run: `npm test -- src/domain/learning.test.ts`  
Expected: FAIL because `learning.ts` does not exist.

- [ ] **Step 3: Implement shared types**

Create `src/domain/learning.ts`:

~~~ts
export type CardState = "new"|"learning"|"review"|"relearning"|"suspended";
export type ReviewRating = "again"|"hard"|"good"|"easy";
export type CardSource = { documentId:string; page:number; quote:string; rects:Array<{x:number;y:number;width:number;height:number}> };
export type LearningCard = {
  id:string; deckId:string; front:string; back:string; state:CardState; dueAt:string;
  reps:number; lapses:number; stability:number|null; difficulty:number|null;
  lastReviewAt:string|null; source:CardSource|null; tags:string[];
};
export type Deck = { id:string; name:string; description:string|null; color:string|null; archived:boolean };
export type ReviewPreview = Record<ReviewRating,{dueAt:string;intervalLabel:string}>;
export const isSchedulableCard = (card:LearningCard) => card.state !== "suspended" && card.front.trim() !== "" && card.back.trim() !== "";
~~~

- [ ] **Step 4: Add the migration**

Create `src-tauri/migrations/0004_learning.sql`:

~~~sql
CREATE TABLE decks (
  id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  description TEXT, color TEXT, archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE cards (
  id TEXT PRIMARY KEY, deck_id TEXT NOT NULL REFERENCES decks(id),
  front TEXT NOT NULL, back TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('new','learning','review','relearning','suspended')),
  due_at TEXT NOT NULL, stability REAL, difficulty REAL, memory_state_json TEXT,
  reps INTEGER NOT NULL DEFAULT 0, lapses INTEGER NOT NULL DEFAULT 0, last_review_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE card_sources (
  card_id TEXT PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id), page INTEGER NOT NULL CHECK(page > 0),
  quote TEXT NOT NULL, rects_json TEXT NOT NULL
);
CREATE TABLE review_logs (
  id TEXT PRIMARY KEY, card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  reviewed_at TEXT NOT NULL, rating TEXT NOT NULL CHECK(rating IN ('again','hard','good','easy')),
  prior_state TEXT NOT NULL, next_state TEXT NOT NULL, prior_due_at TEXT NOT NULL,
  next_due_at TEXT NOT NULL, interval_seconds INTEGER NOT NULL, elapsed_ms INTEGER NOT NULL,
  scheduler_version TEXT NOT NULL
);
CREATE TABLE tags (id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE);
CREATE TABLE card_tags (
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY(card_id,tag_id)
);
CREATE VIRTUAL TABLE card_text USING fts5(card_id UNINDEXED, body, tokenize='unicode61');
CREATE INDEX cards_due_idx ON cards(state,due_at,id);
CREATE INDEX card_sources_document_idx ON card_sources(document_id,page);
~~~

- [ ] **Step 5: Register migration and Rust payloads**

Add `0004_learning` to the migration array. Add serializable `DeckSummary`, `CardSourcePayload`, `LearningCardSummary`, `ReviewPreviewPayload`, and `SearchResultPayload` in `model.rs`. Their JSON field names must match the TypeScript contracts.

- [ ] **Step 6: Verify and commit**

~~~bash
npm test -- src/domain/learning.test.ts
cargo test --manifest-path src-tauri/Cargo.toml
git add src/domain src-tauri/migrations/0004_learning.sql src-tauri/src/library_db.rs src-tauri/src/model.rs
git commit -m "feat: add learning card schema"
~~~

### Task 2: Atomic card repository

**Files:**
- Create: `apps/desktop/src-tauri/src/learning.rs`
- Create: `apps/desktop/src-tauri/src/learning_tests.rs`
- Modify: `apps/desktop/src-tauri/src/library_db.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing transaction tests**

~~~rust
#[test]
fn creates_one_card_with_source_and_normalized_tags() {
    let mut db = test_database_with_document();
    let card = db.create_card(NewCard {
        deck_name:"Probability".into(), front:"Bayes theorem".into(), back:"P(A|B)".into(),
        source:Some(NewCardSource{document_id:"doc-1".into(),page:4,quote:"Bayes theorem".into(),rects_json:"[]".into()}),
        tags:vec!["math".into(),"Math".into()],
    }).unwrap();
    assert_eq!(card.tags,vec!["math"]);
    assert_eq!(db.card_source(&card.id).unwrap().unwrap().page,4);
}
#[test]
fn card_and_review_log_roll_back_together() {
    let mut db = test_database_with_card();
    db.install_review_log_failure_for_test().unwrap();
    assert!(db.apply_review_atomic(valid_review()).is_err());
    assert_eq!(db.card_by_id("card-1").unwrap().unwrap().reps,0);
}
~~~

- [ ] **Step 2: Verify failure**

Run: `cargo test --manifest-path src-tauri/Cargo.toml learning_tests`  
Expected: FAIL because repository methods are missing.

- [ ] **Step 3: Implement the repository**

Create `learning.rs` with:

~~~rust
pub struct NewCard { pub deck_name:String, pub front:String, pub back:String, pub source:Option<NewCardSource>, pub tags:Vec<String> }
pub struct NewCardSource { pub document_id:String, pub page:i64, pub quote:String, pub rects_json:String }
pub struct AppliedReview { pub card_id:String, pub rating:String, pub prior_state:String, pub next_state:String, pub prior_due_at:String, pub next_due_at:String, pub interval_seconds:i64, pub elapsed_ms:i64, pub stability:Option<f64>, pub difficulty:Option<f64>, pub memory_state_json:Option<String> }
impl LibraryDatabase {
  pub fn create_card(&mut self,input:NewCard)->Result<LearningCardSummary>;
  pub fn due_cards(&self,now:&str,limit:usize)->Result<Vec<LearningCardSummary>>;
  pub fn card_by_id(&self,id:&str)->Result<Option<LearningCardSummary>>;
  pub fn card_source(&self,id:&str)->Result<Option<CardSourcePayload>>;
  pub fn apply_review_atomic(&mut self,review:AppliedReview)->Result<LearningCardSummary>;
  pub fn learning_search(&self,query:&str,limit:usize)->Result<Vec<SearchResultPayload>>;
}
~~~

Validate trimmed Front, Back, deck, source quote, page, document existence, and tags. Create a new deck in the same transaction when needed. Write `cards`, `card_sources`, normalized `tags` and `card_tags`, and `card_text` together. `apply_review_atomic` must update the card and insert one log in one transaction.

- [ ] **Step 4: Verify and commit**

~~~bash
cargo test --manifest-path src-tauri/Cargo.toml learning_tests
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
git add src-tauri/src
git commit -m "feat: add atomic learning repository"
~~~

### Task 3: FSRS adapter

**Files:**
- Create: `apps/desktop/src-tauri/src/scheduler.rs`
- Create: `apps/desktop/src-tauri/src/scheduler_tests.rs`
- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing scheduler tests**

~~~rust
#[test]
fn new_card_has_all_four_next_intervals() {
    let preview = scheduler().preview(None,fixed_time()).unwrap();
    assert!(preview.again.interval_seconds >= 60);
    assert!(preview.easy.interval_seconds >= preview.good.interval_seconds);
}
#[test]
fn again_is_due_before_good_for_the_same_memory_state() {
    let state = stored_memory_state();
    assert!(scheduler().apply(Some(&state),Rating::Again,fixed_time()).unwrap().interval_seconds
      < scheduler().apply(Some(&state),Rating::Good,fixed_time()).unwrap().interval_seconds);
}
~~~

- [ ] **Step 2: Verify failure**

Run: `cargo test --manifest-path src-tauri/Cargo.toml scheduler_tests`  
Expected: FAIL because `scheduler.rs` is missing.

- [ ] **Step 3: Implement official FSRS wrapper**

Add to `Cargo.toml`:

~~~toml
chrono = { version = "0.4", default-features = false, features = ["std","clock"] }
fsrs = "=6.6.0"
~~~

Create `scheduler.rs`:

~~~rust
pub enum Rating { Again, Hard, Good, Easy }
pub struct SchedulerConfig { pub desired_retention:f64, pub version:String }
pub struct ScheduledState { pub state:String, pub due_at:String, pub interval_seconds:i64, pub stability:Option<f64>, pub difficulty:Option<f64>, pub memory_state_json:String }
pub struct ReviewScheduler { fsrs: fsrs::FSRS, config: SchedulerConfig }
impl ReviewScheduler {
  pub fn preview(&self,memory_state:Option<&str>,elapsed_days:u32,now:chrono::DateTime<chrono::Utc>)->Result<ReviewPreview,SchedulerError>;
  pub fn apply(&self,memory_state:Option<&str>,elapsed_days:u32,rating:Rating,now:chrono::DateTime<chrono::Utc>)->Result<ScheduledState,SchedulerError>;
}
~~~

Use `fsrs::FSRS::default()` and `next_states(previous_state, 0.9, elapsed_days)`. `elapsed_days` is calculated from the persisted `last_review_at` and review time, or zero for a new card. Serialize `MemoryState` using `serde_json`. Round intervals to at least 60 seconds and generate ISO-8601 due timestamps. Do not expose raw crate errors to the UI.

- [ ] **Step 4: Verify and commit**

~~~bash
cargo test --manifest-path src-tauri/Cargo.toml scheduler_tests
cargo test --manifest-path src-tauri/Cargo.toml
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/scheduler.rs src-tauri/src/scheduler_tests.rs src-tauri/src/lib.rs
git commit -m "feat: add FSRS review scheduler"
~~~

### Task 4: Commands and typed learning bridge

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands.rs`
- Modify: `apps/desktop/src-tauri/src/commands_tests.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Create: `apps/desktop/src/lib/learning.ts`
- Create: `apps/desktop/src/lib/learning.test.ts`

- [ ] **Step 1: Write failing native and frontend tests**

~~~rust
#[test]
fn create_card_rejects_empty_back_without_persisting() {
    let store = test_store_with_document();
    assert_eq!(create_card(empty_back_input(),store.state()).unwrap_err(),"card back is required");
    assert!(store.database.lock().unwrap().due_cards(&now(),10).unwrap().is_empty());
}
#[test]
fn good_rating_updates_card_and_writes_one_log() {
    let store = test_store_with_due_card();
    let rated = rate_card("card-1".into(),"good".into(),900,store.state()).unwrap();
    assert_eq!(rated.reps,1);
    assert_eq!(store.database.lock().unwrap().review_log_count("card-1").unwrap(),1);
}
~~~

~~~ts
import { expect,it,vi } from "vitest";
import { createCard,rateCard } from "./learning";
it("sends source anchor to create_card",async()=>{
 const invoke=vi.fn().mockResolvedValue({id:"card-1"});
 await createCard({deckName:"Math",front:"x",back:"y",source:{documentId:"doc-1",page:2,quote:"x",rects:[]},tags:[]},invoke);
 expect(invoke).toHaveBeenCalledWith("create_card",expect.any(Object));
});
it("sends rating and elapsed time",async()=>{
 const invoke=vi.fn().mockResolvedValue({});
 await rateCard("card-1","good",640,invoke);
 expect(invoke).toHaveBeenCalledWith("rate_card",{id:"card-1",rating:"good",elapsedMs:640});
});
~~~

- [ ] **Step 2: Verify failure**

~~~bash
cargo test --manifest-path src-tauri/Cargo.toml commands_tests::create_card_rejects_empty_back_without_persisting
npm test -- src/lib/learning.test.ts
~~~

- [ ] **Step 3: Implement and register commands**

Add these Tauri commands:

~~~text
create_card(input)
list_decks()
create_deck(name)
list_due_cards(limit)
preview_card_review(id)
rate_card(id,rating,elapsed_ms)
get_card_source(id)
search_everything(query)
get_document(id)
~~~

Each command validates inputs before a transaction. `rate_card` loads the stored card, calls `ReviewScheduler`, then calls `apply_review_atomic`. `search_everything` combines existing document matches with learning FTS results into typed `SearchResultPayload` objects. Create typed matching wrappers in `src/lib/learning.ts`.

- [ ] **Step 4: Verify and commit**

~~~bash
cargo test --manifest-path src-tauri/Cargo.toml commands_tests
npm test -- src/lib/learning.test.ts
git add src-tauri/src/commands.rs src-tauri/src/commands_tests.rs src-tauri/src/lib.rs src/lib/learning.ts src/lib/learning.test.ts
git commit -m "feat: expose learning command API"
~~~

### Task 5: PDF selection and editable card composer

**Files:**
- Create: `apps/desktop/src/features/reader/readerSelection.ts`
- Create: `apps/desktop/src/features/reader/readerSelection.test.ts`
- Create: `apps/desktop/src/features/reader/CardSelectionToolbar.tsx`
- Create: `apps/desktop/src/features/cards/CardComposer.tsx`
- Create: `apps/desktop/src/features/cards/CardComposer.test.tsx`
- Modify: `apps/desktop/src/features/reader/ReaderPage.tsx`
- Modify: `apps/desktop/src/app/App.tsx`

- [ ] **Step 1: Write failing selection/composer tests**

~~~ts
import { expect,it } from "vitest";
import { selectionDraft } from "./readerSelection";
it("creates one page source anchor",()=>{
 expect(selectionDraft({documentId:"doc-1",page:7,quote:"Bayes theorem",rects:[{x:4,y:8,width:30,height:12}]}))
 .toEqual({documentId:"doc-1",page:7,quote:"Bayes theorem",rects:[{x:4,y:8,width:30,height:12}]});
});
~~~

~~~tsx
it("prefills Front from selection and leaves Back editable",async()=>{
 const user=userEvent.setup();
 render(<CardComposer draft={{documentId:"doc-1",page:2,quote:"selected sentence",rects:[]}} decks={[deck()]} onSave={async()=>{}} onCancel={()=>{}} />);
 expect(screen.getByLabelText("Front")).toHaveValue("selected sentence");
 expect(screen.getByLabelText("Back")).toHaveValue("");
 await user.type(screen.getByLabelText("Back"),"my explanation");
 expect(screen.getByLabelText("Back")).toHaveValue("my explanation");
});
~~~

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/features/reader/readerSelection.test.ts src/features/cards/CardComposer.test.tsx`  
Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement selection capture and composition**

`readerSelection.ts` must reject blank/cross-page selections. `ReaderPage` captures selection from its PDF text layer on mouse/touch release, calculates page-relative client rects, and displays `CardSelectionToolbar`. Clicking Create flashcard calls `onCreateCard(draft)`.

`CardComposer` has labeled multiline Front and Back editors, deck selector, optional comma-separated tags, source preview, Cancel, and Save. Both Front and Back are required to save. Save disables while pending and shows an alert without closing if the command fails.

`App` adds a composer route/state. It loads decks when opening composer, calls `createCard`, then returns to the same Reader position on success.

- [ ] **Step 4: Verify and commit**

~~~bash
npm test -- src/features/reader/readerSelection.test.ts src/features/cards/CardComposer.test.tsx src/app/App.test.tsx
npm run build
git add src/features/reader src/features/cards src/app/App.tsx
git commit -m "feat: create cards from PDF selections"
~~~

### Task 6: Review today, decks, source link, and card search

**Files:**
- Create: `apps/desktop/src/features/review/ReviewPage.tsx`
- Create: `apps/desktop/src/features/review/ReviewPage.test.tsx`
- Create: `apps/desktop/src/features/decks/DeckSelector.tsx`
- Create: `apps/desktop/src/features/decks/DeckSelector.test.tsx`
- Modify: `apps/desktop/src/features/search/CommandPalette.tsx`
- Modify: `apps/desktop/src/features/search/CommandPalette.test.tsx`
- Modify: `apps/desktop/src/features/library/LibraryPage.tsx`
- Modify: `apps/desktop/src/app/App.tsx`

- [ ] **Step 1: Write failing review and card-search tests**

~~~tsx
it("reveals Back and rates Good using its preview interval",async()=>{
 const user=userEvent.setup(); const rate=vi.fn().mockResolvedValue(card());
 render(<ReviewPage cards={[card()]} preview={preview()} onRate={rate} onShowSource={()=>{}} />);
 await user.click(screen.getByRole("button",{name:"Show answer"}));
 expect(screen.getByText(card().back)).toBeVisible();
 await user.click(screen.getByRole("button",{name:"Good 4d"}));
 expect(rate).toHaveBeenCalledWith(card().id,"good",expect.any(Number));
});
~~~

~~~tsx
it("opens a card result from Cmd+K",async()=>{
 render(<CommandPalette search={async()=>[{kind:"card",id:"card-1",title:"Bayes theorem",subtitle:"Math"}]} onOpenDocument={()=>{}} onOpenCard={id=>opened.push(id)} />);
 await user.keyboard("{Meta>}k{/Meta}"); await user.type(screen.getByRole("searchbox"),"bayes"); await user.keyboard("{Enter}");
 expect(opened).toEqual(["card-1"]);
});
~~~

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/features/review/ReviewPage.test.tsx src/features/search/CommandPalette.test.tsx`  
Expected: FAIL because review/card search UI is missing.

- [ ] **Step 3: Implement user-facing learning flow**

`ReviewPage` shows Review today counts, Front, Show answer, Back, Show source, and accessible Again/Hard/Good/Easy buttons named with their calculated intervals. It starts an elapsed timer with Front, disables choices while saving, keeps the same card on failure, and moves to the next due/new card after success.

Add a Review today button to Library. `Show source` fetches the source and routes Reader to its document/page; unavailable source stays reviewable and presents an alert. Add `DeckSelector` to the composer with New deck creation and duplicate-name error feedback.

Refactor `CommandPalette` to accept a union:
~~~ts
type SearchResult = {kind:"document";id:string;title:string;subtitle:string|null} | {kind:"card";id:string;title:string;subtitle:string|null};
~~~
Document results open Reader; card results open Review focused on that card. Card rows visibly identify their deck/source.

- [ ] **Step 4: Verify and commit**

~~~bash
npm test -- src/features/review/ReviewPage.test.tsx src/features/decks/DeckSelector.test.tsx src/features/search/CommandPalette.test.tsx
npm test
git add src/features/review src/features/decks src/features/search src/features/library/LibraryPage.tsx src/app/App.tsx
git commit -m "feat: add Anki-like review experience"
~~~

### Task 7: End-to-end coverage, documentation, and verification

**Files:**
- Create: `apps/desktop/tests/e2e/learning.spec.ts`
- Modify: `apps/desktop/README.md`
- Modify: `PROJECT_MEMORY.md`

- [ ] **Step 1: Write the E2E lifecycle test**

~~~ts
import { test,expect } from "@playwright/test";
test("creates and reviews a sourced card",async({page})=>{
 await page.goto("http://127.0.0.1:1420");
 await page.getByRole("button",{name:"Review today"}).click();
 await expect(page.getByRole("heading",{name:"Review today"})).toBeVisible();
});
~~~

Extend the fixture so the full run creates a seeded card from PDF selection, types Back, saves, reveals it in Review, rates Good, and uses Show source to return to the seeded document page.

- [ ] **Step 2: Verify failure**

Run: `npm run test:e2e -- tests/e2e/learning.spec.ts`  
Expected: FAIL until the learning route and fixture are live.

- [ ] **Step 3: Document and verify**

Update README and PROJECT_MEMORY with manual card creation, four ratings, FSRS 90% default, source behavior, and deferred features.

~~~bash
npm test
npm run build
npm run test:e2e
cargo test --all-targets --manifest-path src-tauri/Cargo.toml
cargo clippy --all-targets --all-features --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo fmt --check --manifest-path src-tauri/Cargo.toml
git add apps/desktop/tests/e2e/learning.spec.ts apps/desktop/README.md PROJECT_MEMORY.md
git commit -m "test: verify native learning workflow"
~~~

## Coverage review

- Manual editable Front/Back and source anchor: Tasks 1, 2, and 5.
- FSRS/Again/Hard/Good/Easy/interval labels: Tasks 3, 4, and 6.
- Deck/tag and Search Everything: Tasks 2, 4, and 6.
- Atomic logs and recoverable errors: Tasks 2 and 4.
- Show source and unavailable source: Task 6.
- Full lifecycle verification: Task 7.
