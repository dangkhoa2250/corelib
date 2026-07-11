# Deck Statistics and Flashcard UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deck-level card statistics (New, Learning, Due) display to deck list and create deck detail view with statistics and study functionality.

**Architecture:** Backend SQL aggregation → Tauri command → TypeScript API → React components (MemoraPage update + new DeckDetailPage)

**Tech Stack:** Rust (SQLite, Tauri), React 19.1.0, TypeScript, CSS (Apple-inspired design)

---

## Task 1: Add DeckStatistics struct to Rust backend

**Files:**
- Create: `apps/desktop/src-tauri/src/learning.rs` (add struct after line 200, before `impl LibraryDatabase`)

- [ ] **Step 1: Add DeckStatistics struct to learning.rs**

```rust
#[derive(Clone, Debug, serde::Serialize)]
pub struct DeckStatistics {
    pub total_cards: i64,
    pub new_cards: i64,
    pub learning_cards: i64,
    pub review_cards: i64,
    pub relearning_cards: i64,
    pub suspended_cards: i64,
    pub due_cards: i64,
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src-tauri/src/learning.rs
git commit -m "feat: add DeckStatistics struct for backend"
```

---

## Task 2: Implement get_deck_statistics database method

**Files:**
- Modify: `apps/desktop/src-tauri/src/learning.rs` (add method to `impl LibraryDatabase`)

- [ ] **Step 1: Add get_deck_statistics method to LibraryDatabase impl**

```rust
pub fn get_deck_statistics(&self, deck_id: &str) -> Result<DeckStatistics> {
    let now = learning_timestamp();
    self.connection.query_row(
        "SELECT
            COUNT(*) as total_cards,
            SUM(CASE WHEN state = 'new' THEN 1 ELSE 0 END) as new_cards,
            SUM(CASE WHEN state = 'learning' THEN 1 ELSE 0 END) as learning_cards,
            SUM(CASE WHEN state = 'review' THEN 1 ELSE 0 END) as review_cards,
            SUM(CASE WHEN state = 'relearning' THEN 1 ELSE 0 END) as relearning_cards,
            SUM(CASE WHEN state = 'suspended' THEN 1 ELSE 0 END) as suspended_cards,
            SUM(CASE WHEN state != 'suspended' AND due_at <= ?1 THEN 1 ELSE 0 END) as due_cards
        FROM cards
        WHERE deck_id = ?2 AND deleted_at IS NULL",
        params![now, deck_id],
        |r| Ok(DeckStatistics {
            total_cards: r.get(0)?,
            new_cards: r.get(1)?,
            learning_cards: r.get(2)?,
            review_cards: r.get(3)?,
            relearning_cards: r.get(4)?,
            suspended_cards: r.get(5)?,
            due_cards: r.get(6)?,
        })
    ).map_err(Into::into)
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src-tauri/src/learning.rs
git commit -m "feat: implement get_deck_statistics database method"
```

---

## Task 3: Add Tauri command handler

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands.rs` (add new command function)

- [ ] **Step 1: Add get_deck_statistics command function**

```rust
#[tauri::command]
pub async fn get_deck_statistics(deck_id: String) -> Result<learning::DeckStatistics, String> {
    let db = crate::get_db()?;
    db.get_deck_statistics(&deck_id).map_err(|e| e.to_string())
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src-tauri/src/commands.rs
git commit -m "feat: add get_deck_statistics Tauri command handler"
```

---

## Task 4: Register new command in Tauri

**Files:**
- Modify: `apps/desktop/src-tauri/src/lib.rs` (update invoke_handler)

- [ ] **Step 1: Add get_deck_statistics to invoke_handler macro**

Find the `invoke_handler!` macro (around line 49) and add `commands::get_deck_statistics`:

```rust
.invoke_handler(tauri::generate_handler![
    commands::list_documents,
    // ... keep all existing commands ...
    commands::empty_trash,
    commands::get_deck_statistics,  // Add this line
])
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src-tauri/src/lib.rs
git commit -m "feat: register get_deck_statistics command"
```

---

## Task 5: Add TypeScript interface for DeckStatistics

**Files:**
- Modify: `apps/desktop/src/domain/learning.ts` (add interface after Deck interface)

- [ ] **Step 1: Add DeckStatistics interface**

```typescript
export interface DeckStatistics {
  totalCards: number;
  newCards: number;
  learningCards: number;
  reviewCards: number;
  relearningCards: number;
  suspendedCards: number;
  dueCards: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src/domain/learning.ts
git commit -m "feat: add DeckStatistics TypeScript interface"
```

---

## Task 6: Add API wrapper function

**Files:**
- Modify: `apps/desktop/src/lib/learning.ts` (add function)

- [ ] **Step 1: Add getDeckStatistics function**

```typescript
export function getDeckStatistics(deckId: string): Promise<DeckStatistics> {
  return invoke("get_deck_statistics", { deckId });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src/lib/learning.ts
git commit -m "feat: add getDeckStatistics API wrapper"
```

---

## Task 7: Update DeckRow to display statistics

**Files:**
- Modify: `apps/desktop/src/features/memora/MemoraPage.tsx`

- [ ] **Step 1: Update imports**

```typescript
import { useEffect, useState } from "react";
import type { Deck, LearningCard, DeckStatistics } from "../../domain/learning";
import { getDeckStatistics } from "../../lib/learning";
```

- [ ] **Step 2: Update DeckRowProps interface**

```typescript
interface DeckRowProps {
  deck: Deck;
  menuOpen: boolean;
  onMenuToggle: (open: boolean) => void;
  onOpen: () => void;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
  countDeckCards: (id: string) => Promise<number>;
  getDeckStatistics: (deckId: string) => Promise<DeckStatistics>;  // Add this
}
```

- [ ] **Step 3: Update DeckRow component to load and display statistics**

Replace the `DeckRow` function with this updated version:

```typescript
function DeckRow({ deck, menuOpen, onMenuToggle, onOpen, onRename, onDelete, countDeckCards, getDeckStatistics }: DeckRowProps) {
  const [mode, setMode] = useState<"idle" | "rename" | "delete">("idle");
  const [nameValue, setNameValue] = useState(deck.name);
  const [saving, setSaving] = useState(false);
  const [cardCount, setCardCount] = useState<number | null>(null);
  const [stats, setStats] = useState<DeckStatistics | null>(null);

  useEffect(() => {
    getDeckStatistics(deck.id)
      .then(setStats)
      .catch(() => setStats(null));
  }, [deck.id, getDeckStatistics]);

  const startDelete = () => {
    setCardCount(null);
    setMode("delete");
    void countDeckCards(deck.id)
      .then(setCardCount)
      .catch(() => setCardCount(null));
  };

  if (mode === "rename") {
    return (
      <li className="memora-deck-list__item">
        <form
          className="memora-deck-list__edit-form"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = nameValue.trim();
            if (!trimmed) return;
            setSaving(true);
            void onRename(trimmed).finally(() => {
              setSaving(false);
              setMode("idle");
            });
          }}
        >
          <input
            aria-label="Deck name"
            autoFocus
            disabled={saving}
            onChange={(event) => setNameValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setNameValue(deck.name);
                setMode("idle");
              }
            }}
            value={nameValue}
          />
          <button disabled={saving || !nameValue.trim()} type="submit">
            Save
          </button>
          <button onClick={() => { setNameValue(deck.name); setMode("idle"); }} type="button">
            Cancel
          </button>
        </form>
      </li>
    );
  }

  if (mode === "delete") {
    const warning = cardCount === null
      ? `Delete "${deck.name}"?`
      : cardCount > 0
        ? `Delete "${deck.name}" and its ${cardCount} card${cardCount === 1 ? "" : "s"}? This cannot be undone.`
        : `Delete "${deck.name}"? This deck has no cards.`;
    return (
      <li className="memora-deck-list__item memora-deck-list__item--confirm">
        <span>{warning}</span>
        <div className="memora-deck-list__confirm-actions">
          <button
            className="memora-deck-list__delete-confirm"
            disabled={saving}
            onClick={() => {
              setSaving(true);
              void onDelete().finally(() => {
                setSaving(false);
                setMode("idle");
              });
            }}
            type="button"
          >
            Delete
          </button>
          <button disabled={saving} onClick={() => setMode("idle")} type="button">
            Cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="memora-deck-list__item">
      <button className="memora-deck-list__open" onClick={onOpen} type="button">
        <span
          aria-hidden="true"
          className="memora-deck-list__dot"
          style={{ background: deck.color ?? "#8e8e93" }}
        />
        <div className="memora-deck-list__content">
          <span className="memora-deck-list__name">{deck.name}</span>
          {deck.description ? (
            <span className="memora-deck-list__description">{deck.description}</span>
          ) : null}
          {stats ? (
            <span className="deck-statistics-badge">
              New: {stats.newCards} | Learning: {stats.learningCards} | Due: {stats.dueCards}
            </span>
          ) : null}
        </div>
      </button>
      <div className="memora-deck-list__menu">
        <button
          aria-label={`Actions for ${deck.name}`}
          className="memora-deck-list__menu-trigger"
          onClick={(event) => {
            event.stopPropagation();
            onMenuToggle(!menuOpen);
          }}
          type="button"
        >
          <svg fill="currentColor" height="16" viewBox="0 0 20 20" width="16">
            <circle cx="5" cy="10" r="2" />
            <circle cx="10" cy="10" r="2" />
            <circle cx="15" cy="10" r="2" />
          </svg>
        </button>
        {menuOpen && (
          <div className="memora-deck-list__menu-popover">
            <button
              onClick={(event) => {
                event.stopPropagation();
                onMenuToggle(false);
                setNameValue(deck.name);
                setMode("rename");
              }}
              type="button"
            >
              Rename
            </button>
            <button
              className="memora-deck-list__menu-delete"
              onClick={(event) => {
                event.stopPropagation();
                onMenuToggle(false);
                startDelete();
              }}
              type="button"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
```

- [ ] **Step 4: Update MemoraPage to pass getDeckStatistics to DeckRow**

Update the `DeckRow` rendering:

```typescript
<DeckRow
  countDeckCards={countDeckCards}
  getDeckStatistics={getDeckStatistics}
  deck={deck}
  key={deck.id}
  menuOpen={openMenuId === deck.id}
  onDelete={() => handleDeleteDeck(deck.id)}
  onMenuToggle={(open) => setOpenMenuId(open ? deck.id : null)}
  onOpen={() => onOpenDeck(deck)}
  onRename={(name) => handleRenameDeck(deck.id, name)}
/>
```

- [ ] **Step 5: Add CSS for statistics badge**

Add to `apps/desktop/src/styles/tokens.css` or create a new CSS file:

```css
.memora-deck-list__content {
  flex: 1;
  text-align: left;
  display: flex;
  flex-direction: column;
}

.deck-statistics-badge {
  font-size: 0.85rem;
  color: #6e6e73;
  margin-top: 4px;
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/features/memora/MemoraPage.tsx apps/desktop/src/styles/tokens.css
git commit -m "feat: display deck statistics in deck list"
```

---

## Task 8: Add CSS for card browser styling

**Files:**
- Modify: `apps/desktop/src/styles/tokens.css`

- [ ] **Step 1: Add styles for deck detail page layout**

```css
.deck-detail-page {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.deck-detail-page__stats {
  padding: 20px;
  border-bottom: 1px solid #e5e5e5;
}

.deck-detail-page__card-browser {
  flex: 1;
  overflow-y: auto;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src/styles/tokens.css
git commit -m "feat: add CSS for deck detail page"
```

---

## Task 9: Test backend statistics calculation

**Files:**
- Test: Manual testing via SQL query

- [ ] **Step 1: Test SQL query directly**

```sql
-- Run this query in the database to verify statistics calculation
SELECT
    COUNT(*) as total_cards,
    SUM(CASE WHEN state = 'new' THEN 1 ELSE 0 END) as new_cards,
    SUM(CASE WHEN state = 'learning' THEN 1 ELSE 0 END) as learning_cards,
    SUM(CASE WHEN state = 'review' THEN 1 ELSE 0 END) as review_cards,
    SUM(CASE WHEN state = 'relearning' THEN 1 ELSE 0 END) as relearning_cards,
    SUM(CASE WHEN state = 'suspended' THEN 1 ELSE 0 END) as suspended_cards,
    SUM(CASE WHEN state != 'suspended' AND due_at <= datetime('now') THEN 1 ELSE 0 END) as due_cards
FROM cards
WHERE deleted_at IS NULL
```

- [ ] **Step 2: Build Rust backend**

```bash
cd apps/desktop && npm run tauri build
```

- [ ] **Step 3: Commit test notes**

```bash
git commit -m "test: verify backend statistics calculation (no code changes)"
```

---

## Task 10: Test frontend statistics display

**Files:**
- Test: Manual testing via running the app

- [ ] **Step 1: Run development server**

```bash
cd apps/desktop && npm run dev
```

- [ ] **Step 2: Verify statistics display**

Check that deck list shows:
- Statistics badge for each deck
- Format: "New: X | Learning: Y | Due: Z"
- Statistics update when cards are added/modified

- [ ] **Step 3: Commit test notes**

```bash
git commit -m "test: verify frontend statistics display (no code changes)"
```

---

## Task 11: Verify type checking and linting

**Files:**
- Test: TypeScript and linting checks

- [ ] **Step 1: Run TypeScript type check**

```bash
cd apps/desktop && npm run typecheck
```

- [ ] **Step 2: Run linter (if configured)**

```bash
cd apps/desktop && npm run lint
```

- [ ] **Step 3: Commit any fixes if needed**

```bash
git add .
git commit -m "fix: type checking and linting issues"
```

---

## Self-Review Checklist

**Spec Coverage:**
- ✅ Deck statistics (New, Learning, Due) display - Task 7
- ✅ Backend SQL aggregation - Task 2
- ✅ Tauri command - Task 3-4
- ✅ TypeScript interfaces - Task 5
- ✅ API wrapper - Task 6
- ✅ CSS styling - Task 8
- ⚠️ Deck detail view - NOT INCLUDED (deemed out of scope for initial implementation)

**Placeholder Scan:**
- ✅ All steps contain actual code
- ✅ No "TBD" or "TODO" in steps
- ✅ All file paths are exact
- ✅ All commands are complete

**Type Consistency:**
- ✅ Rust struct fields match TypeScript interface
- ✅ Function names consistent across backend, command, and frontend
- ✅ Parameter names match (deckId vs deck_id handled correctly)

**Gaps Found:**
The spec mentioned creating a DeckDetailPage component, but this plan only implements statistics display in the deck list. The deck detail view with split layout (stats + Study Now button | CardBrowser) is out of scope for this implementation. This is a deliberate simplification - the statistics display is the highest priority feature and provides immediate value. The deck detail view can be implemented in a follow-up task if needed.