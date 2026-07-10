# Native Anki-like learning module design

## Goal

Add an Anki-like flashcard and spaced-repetition module inside Corelib. It is not an integration with an external Anki application. A user creates cards manually from text selected in a PDF, reviews them in the same desktop app, and can return to the source document at any time.

## Scope

### MVP

- Create a card from selected PDF text.
- Store editable Front and Back fields. The selected text is prefilled into Front; Back starts empty.
- Attach a source anchor containing document ID, page, quote, and selection location when available.
- Organize cards into decks and optional tags.
- Run a Review today session with Front, Show answer, Again, Hard, Good, and Easy.
- Save review history and schedule the next due time with an FSRS-compatible scheduler.
- Show the next interval on each answer button.
- Open the exact source page and quote through Show source.
- Search card Front, Back, deck, tags, and source metadata through the existing Search Everything surface.

### Deferred

- AI-generated cards.
- Cloze card type and custom note/card templates.
- Audio, images, LaTeX, and other advanced field media.
- External Anki import/export.
- Cross-device sync and account features.
- Advanced statistics, leech automation, and custom scheduler scripting.

## Card experience

While reading a PDF, selecting text exposes Create flashcard. The composer opens with:

- Front editor prefilled with the selected text.
- Empty Back editor.
- Deck selector and optional tag input.
- Source preview showing document title and page.
- Save and Cancel actions.

Front and Back are independent editable fields. The source quote is stored separately from both fields so it can be shown as provenance without being accidentally altered when the card is edited.

During Review today:

1. Show the Front.
2. Let the user reveal the Back with Show answer.
3. Show Again, Hard, Good, and Easy buttons with their calculated next intervals.
4. Save the rating and advance to the next due/new card.

Show source opens Reader at the saved page and selection anchor. If the source file is unavailable, the card remains reviewable and shows an unavailable-source state instead of failing the review.

## Data model

The learning module extends the existing SQLite database. All IDs are stable UUIDs from creation.

### `decks`

- `id` primary key.
- `name`, `description`, optional color, and created/updated timestamps.
- Ordering and archive state.

### `cards`

- `id` primary key and `deck_id` foreign key.
- Editable `front` and `back` content.
- `state`: `new`, `learning`, `review`, `relearning`, or `suspended`.
- `due_at`, `stability`, `difficulty`, `reps`, `lapses`, and `last_review_at`.
- Created/updated timestamps.

### `card_sources`

- `card_id` foreign key.
- `document_id` foreign key by stable ID.
- Page number, selected quote, and optional serialized selection rectangle/text offsets.
- A source snapshot is retained so the card still has provenance if the PDF later disappears.

### `review_logs`

- `id` primary key and `card_id` foreign key.
- Review timestamp, rating, prior state, next state, prior due, next due, interval, and elapsed answer time.
- Scheduler version/parameters identifier for reproducibility.

Tags should use normalized `tags` and `card_tags` tables rather than a comma-separated field, allowing Search Everything and future sync to query them safely.

## Scheduling

The scheduler follows Anki's user-facing behavior: Again, Hard, Good, and Easy each produce a next interval and update the card state. The implementation will wrap the official open-spaced-repetition Rust implementation (`fsrs-rs`) behind the scheduler interface, with its dependency version pinned during implementation. It stores the fields needed by FSRS from the first review and uses a default desired retention of 90%. The optimizer is deferred until enough review history exists; users should not edit raw FSRS parameters in the MVP.

The scheduler must be isolated behind an interface:

```text
schedule(card_state, rating, review_time, scheduler_config) -> next_card_state + interval
```

This keeps UI and persistence independent from the algorithm and makes scheduler tests deterministic with a fixed clock/configuration.

## Architecture and data flow

```text
PDF Reader selection
  -> card composer
  -> CardService
  -> SQLite cards/decks/card_sources

Review session
  -> ReviewService
  -> Scheduler
  -> SQLite cards + review_logs

Search Everything
  -> card/deck/tag/source FTS projection

Show source
  -> card_sources
  -> Reader(document_id, page, anchor)
```

React components call typed repository/service wrappers. Rust owns SQLite transactions, scheduler persistence, source-anchor validation, and migration logic. Review transitions update the card and append its review log in one transaction so a crash cannot update one without the other.

## Error handling and recovery

- Empty Front or Back values are rejected only where the card type requires them; MVP Basic cards require a non-empty Front and allow an intentionally empty Back only while composing, not when saving.
- A missing deck or source document returns a recoverable error and leaves the composer open.
- A deleted/missing PDF never deletes its card; Show source reports unavailable.
- A failed review transaction does not advance the session card and can be retried.
- Duplicate Save requests use an idempotency token or disabled submit state so one user action cannot create duplicate cards.
- Database migration failure stops learning-module startup with a clear recovery error; existing Library documents remain readable.
- Scheduler errors preserve the prior card state and log a diagnostic without silently marking the card reviewed.

## Testing strategy

- Unit tests for source-anchor creation, empty-field validation, tag normalization, stable IDs, and deck/card queries.
- Scheduler tests with fixed timestamps for all four ratings, new/learning/review/relearning transitions, due calculations, and invalid ratings.
- Transaction tests proving card update + review log are atomic on success and rollback together on failure.
- React tests for selection-to-composer prefill, independent Front/Back editing, Save/Cancel, Show answer, all answer buttons, next-interval labels, and Show source.
- Search tests for Front/Back/deck/tag/source matches and stale async result handling.
- End-to-end test: import/open PDF → select text → create card → review → rate → reopen source.

## Milestones

1. **Card foundation:** schema, repositories, source anchor, manual composer, and Save/Cancel.
2. **Review session:** Review today, Show answer, four answer buttons, due queue, and review logs.
3. **FSRS scheduler:** isolated scheduler interface, deterministic tests, persistent FSRS state, and next-interval labels. This is the MVP completion point.
4. **Decks/tags/Search Everything:** management UI and unified search projection.
5. **Polish/statistics:** history, streaks, retention, suspend/reset, backups, and migration hardening.

## Acceptance criteria for MVP

- Selecting text in a PDF can create exactly one editable card with the selection in Front, empty Back, deck, and source anchor.
- Both fields can be edited independently and persist after restart.
- Review today shows the card, reveals Back, accepts all four ratings, displays intervals, and advances safely.
- A rating updates the card and creates a matching review log atomically.
- Show source returns to the original document page or an explicit unavailable-source state.
- A new app build can migrate an existing Library database without losing documents or cards.
