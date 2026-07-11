# Design: Deck Statistics and Flashcard UI

## Overview
Add deck-level statistics display (New, Learning, Due counts) and improve the deck detail view to show statistics with a "Study Now" button, followed by the card browser.

## Requirements

### Deck List Statistics
- Display card counts per deck in the deck list
- Show: "New: X | Learning: Y | Due: Z" format
- Load statistics efficiently without blocking the UI

### Deck Detail View
When clicking on a deck, show a split view:
- **Top section:** Deck statistics + "Study Now" button
- **Bottom section:** Card browser for that deck

### Flashcard UI
- Utilize existing `ReviewPage` component (Anki-style)
- Improve if needed for better UX

## Architecture

### Backend (Rust)

#### New Command: `get_deck_statistics`
Add a new Tauri command to fetch card statistics for a specific deck:

```rust
pub struct DeckStatistics {
    pub total_cards: i64,
    pub new_cards: i64,
    pub learning_cards: i64,
    pub review_cards: i64,
    pub relearning_cards: i64,
    pub suspended_cards: i64,
    pub due_cards: i64,
}

// In LibraryDatabase:
pub fn get_deck_statistics(&self, deck_id: &str) -> Result<DeckStatistics> {
    // Query cards grouped by state and due date
    // Calculate counts for each state
    // Calculate due cards (state != suspended AND due_at <= now)
}
```

SQL query structure:
```sql
SELECT
    COUNT(*) as total_cards,
    SUM(CASE WHEN state = 'new' THEN 1 ELSE 0 END) as new_cards,
    SUM(CASE WHEN state = 'learning' THEN 1 ELSE 0 END) as learning_cards,
    SUM(CASE WHEN state = 'review' THEN 1 ELSE 0 END) as review_cards,
    SUM(CASE WHEN state = 'relearning' THEN 1 ELSE 0 END) as relearning_cards,
    SUM(CASE WHEN state = 'suspended' THEN 1 ELSE 0 END) as suspended_cards,
    SUM(CASE WHEN state != 'suspended' AND due_at <= ?1 THEN 1 ELSE 0 END) as due_cards
FROM cards
WHERE deck_id = ?2 AND deleted_at IS NULL
```

#### New Tauri Command
Expose as a Tauri command in `lib.rs` or `learning.rs`:

```rust
#[tauri::command]
pub async fn get_deck_statistics(deck_id: String) -> Result<DeckStatistics, String> {
    let db = get_db()?;
    db.get_deck_statistics(&deck_id).map_err(|e| e.to_string())
}
```

### Frontend (TypeScript/React)

#### Domain Layer Update
Update `src/domain/learning.ts`:

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

export interface Deck {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  archived: boolean;
  statistics?: DeckStatistics; // Optional for lazy loading
}
```

#### API Layer Update
Update `src/lib/learning.ts` (or appropriate API file):

```typescript
export async function getDeckStatistics(deckId: string): Promise<DeckStatistics> {
  return invoke<DeckStatistics>("get_deck_statistics", { deckId });
}
```

#### Component Changes

**1. MemoraPage.tsx - Deck List**
Update `DeckRow` component to display statistics:
- Add `getDeckStatistics` prop
- Load statistics on mount
- Display "New: X | Learning: Y | Due: Z" badge below deck name

**2. New Component: DeckDetailPage.tsx**
Create new component for deck detail view:

```typescript
export interface DeckDetailPageProps {
  deck: Deck;
  getDeckStatistics: (deckId: string) => Promise<DeckStatistics>;
  listDueCards: () => Promise<LearningCard[]>;
  onStudyDeck: (deckId: string) => void;
  // CardBrowser props...
}

export function DeckDetailPage({ deck, getDeckStatistics, onStudyDeck, ...cardBrowserProps }: DeckDetailPageProps) {
  const [stats, setStats] = useState<DeckStatistics | null>(null);

  useEffect(() => {
    getDeckStatistics(deck.id).then(setStats);
  }, [deck.id, getDeckStatistics]);

  return (
    <div className="deck-detail-page">
      <header className="deck-detail-page__stats">
        {/* Statistics display */}
        {/* Study Now button */}
      </header>
      <div className="deck-detail-page__card-browser">
        {/* CardBrowser component */}
      </div>
    </div>
  );
}
```

**3. Routing Update**
Update routing to show `DeckDetailPage` when a deck is selected:
- Modify `App.tsx` or routing logic
- Handle navigation between deck list and deck detail

#### Styling (CSS)

Add styles for new components in `src/styles/` or component-specific CSS files:

```css
/* Deck statistics badge */
.deck-statistics-badge {
  font-size: 0.85rem;
  color: #6e6e73;
  margin-top: 4px;
}

/* Deck detail page */
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

### Data Flow

```
User Action: Click deck
→ Update route to deck detail
→ Load deck statistics (async)
→ Display stats + Study Now button
→ Load card browser below
→ User clicks "Study Now"
→ Navigate to ReviewPage with deck-specific cards
```

## Implementation Phases

1. **Backend Statistics Command**
   - Add `DeckStatistics` struct in Rust
   - Implement `get_deck_statistics` in `LibraryDatabase`
   - Add Tauri command
   - Test with SQL queries

2. **Frontend Domain & API**
   - Update TypeScript interfaces
   - Add API function wrapper

3. **Deck List Update**
   - Modify `DeckRow` to load and display statistics
   - Add CSS for statistics badge

4. **Deck Detail Page**
   - Create `DeckDetailPage` component
   - Implement statistics display section
   - Integrate CardBrowser
   - Add routing/navigation

5. **Study Now Integration**
   - Ensure proper navigation to ReviewPage
   - Load deck-specific due cards

6. **Testing**
   - Test statistics calculation accuracy
   - Test UI display
   - Test navigation flow

## Error Handling

- Backend: Return errors for invalid deck IDs
- Frontend: Show error state if statistics fail to load
- Graceful degradation: Hide statistics if loading fails

## Performance Considerations

- Lazy load statistics (only when deck list is visible)
- Cache statistics in component state
- Consider debouncing if frequent updates needed

## Success Criteria

- ✅ Deck list shows accurate "New: X | Learning: Y | Due: Z" for each deck
- ✅ Clicking deck opens detail view with statistics
- ✅ "Study Now" button starts review session for that deck
- ✅ Card browser shows cards for selected deck
- ✅ Statistics update in real-time as cards change