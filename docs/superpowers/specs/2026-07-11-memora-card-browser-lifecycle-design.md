# Memora Card Browser and card lifecycle design

## Goal

Make Memora's basic card management safe and practical for daily use. Opening a deck should show a searchable Card Browser instead of the current slideshow. A user can create and edit cards, move or suspend them individually or in bulk, send them to a recoverable Trash, and permanently delete them only through an explicit confirmation.

This slice deliberately completes card management before expanding the review engine or adding advanced content formats.

## Scope

### Included

- A deck-scoped Card Browser as the main deck screen.
- Plain-text card creation and editing in a side panel.
- Search, state and tag filters, and sorting.
- Multi-selection and bulk move, suspend, unsuspend, and trash actions.
- A global Memora Trash with restore, permanent delete, and empty-trash actions.
- Soft deletion that preserves card content, source, tags, scheduler state, and review history.
- Atomic backend operations and complete UI, repository, migration, and end-to-end coverage.

### Deferred

- Markdown, rich text, LaTeX, images, and audio.
- Cloze notes and custom note/card templates.
- A global Browser for active cards across all decks.
- Review queue changes, review undo, daily limits, and session summaries.
- Import/export, advanced statistics, and AI-assisted card creation.

## User experience

### Opening a deck

Opening a deck navigates directly to its Card Browser. The existing slideshow is removed from the management flow; studying remains a separate session initiated from a Study action.

The Browser contains:

- A header with back navigation, deck name, active card count, and Add Card.
- A toolbar with text search, state filter, tag filter, and sort control.
- A table with selection checkbox, Front, Back, Tags, State, and Due columns.
- A right-side editor panel for the selected card.
- A bulk action bar when one or more rows are selected.

Search matches Front, Back, and tags without case sensitivity. The state filter supports All, New, Learning, Review, Relearning, and Suspended. The tag filter accepts one or more tags. The initial sort choices are Updated, Created, Due, and Front.

Changing deck clears the current selection. Filtering does not implicitly alter selected cards; the bulk action bar reports both the total selected count and how many are currently visible. Bulk actions always apply to the explicit selected ID set, never to an inferred query result.

### Creating and editing

Add Card opens the same side panel used for editing. Front and Back are required plain-text fields. Tags are trimmed, empty tags are removed, and duplicates are collapsed case-insensitively while preserving the first spelling entered.

The edit panel supports:

- Front and Back.
- Tags.
- Destination deck.
- Read-only card state, due information, and PDF source provenance.
- Explicit Save and Cancel actions.

Changing the destination deck uses the same backend move operation as a bulk move. Source provenance cannot be edited in this slice.

The editor never autosaves. Closing the panel, navigating back, changing deck, or selecting another card while the form is dirty opens a shared confirmation with Discard and Continue editing actions.

### Bulk actions

Selecting multiple cards exposes:

- Move to deck.
- Suspend.
- Unsuspend.
- Move to Trash.

The UI submits one request containing the selected IDs. It does not loop over per-card commands. Selection remains intact when an operation fails, allowing the user to retry or adjust it.

### Trash

Memora exposes one global Trash so deleted cards remain recoverable even if their original deck is no longer part of the active navigation. Each row identifies its original deck when that deck still exists.

Cards remain in Trash indefinitely. Trash supports single and bulk Restore, Delete permanently, and Empty Trash. Permanent deletion requires confirmation that states the number of affected cards. Restore returns a card to its original deck. If that deck no longer exists, restore requires the user to choose an existing destination deck before the operation can proceed.

Trashed cards cannot be edited, rated, moved, or suspended. They are excluded from active deck queries, Search Everything, and all due/review queues.

## Data model

Add a nullable `deleted_at` timestamp and nullable `deleted_from_deck_name` snapshot to `cards`. Rebuild the `cards` table so `deck_id` becomes nullable while retaining its foreign key. Existing rows migrate with `deleted_at = NULL`, `deleted_from_deck_name = NULL`, and their current non-null `deck_id`. A non-null `deleted_at` means the card is in Trash. An active card must always have a non-null `deck_id`.

Soft deletion preserves:

- Front and Back content.
- Deck association while the deck exists, plus a deck-name snapshot when deck deletion removes that association.
- Tags and source anchors.
- FSRS state and due timestamp.
- Review history.

The migration must not rewrite or reschedule existing cards. Active-card indexes and queries should account for `deleted_at IS NULL`. Trash queries use `deleted_at IS NOT NULL` and return original deck metadata when available.

Deck deletion must not make Trash recovery ambiguous. Deleting a deck with cards remains a separately confirmed operation. In one transaction it copies the deck name into each affected card's `deleted_from_deck_name`, sets `deleted_at`, clears `deck_id`, removes active FTS projections, and then removes the deck. Restoring a card with a null `deck_id` requires a destination deck. A successful restore sets `deck_id`, clears both deletion fields, and recreates the active FTS projection.

Permanent card deletion removes the card. Existing foreign-key cascades remove its source, tag joins, and review logs; repository logic removes its FTS row in the same transaction.

## Backend interfaces

Rust owns validation, transactions, database timestamps, and lifecycle invariants. Add operations equivalent to:

```text
query_deck_cards(deck_id, query, states, tags, sort) -> CardPage
list_trashed_cards(query, sort) -> CardPage
update_card(card_id, front, back, tags) -> Card
move_cards(card_ids, destination_deck_id) -> BulkResult
set_cards_suspended(card_ids, suspended) -> BulkResult
trash_cards(card_ids) -> BulkResult
restore_cards(card_ids, optional_destination_deck_id) -> BulkResult
delete_cards_permanently(card_ids) -> BulkResult
empty_trash() -> BulkResult
```

Commands use typed request structures rather than positional arguments. `CardPage` includes rows, a total count, and an opaque cursor for the next page. The first implementation uses a bounded default page size and stable keyset pagination based on the selected sort plus card ID, so the Browser never loads an unbounded deck into React.

Every multi-card mutation runs in one SQLite transaction. Input IDs are deduplicated before execution. If any requested card or destination deck is invalid, or a card is in an incompatible lifecycle state, the entire operation rolls back. A successful result reports the affected IDs/count so the frontend can verify that it applied the intended operation.

Lifecycle invariants include:

- Trashed cards cannot enter scheduler operations.
- Only active cards can be updated, moved, suspended, or trashed.
- Only trashed cards can be restored or permanently deleted through Trash commands.
- Front and Back remain non-empty after trimming.
- A move destination must be an active existing deck.
- Suspend preserves scheduling memory and due time; unsuspend makes the card eligible according to its preserved schedule.

## Frontend structure and data flow

The existing deck route renders a focused Browser feature instead of the slideshow. Keep responsibilities separated into:

- `CardBrowserPage`: coordinates route context, query state, results, and refreshes.
- `CardBrowserToolbar`: search, filter, and sort controls.
- `CardTable`: rows, selection, empty/loading/error states, and accessible table interaction.
- `CardBulkActions`: validates intent and submits atomic bulk requests.
- `CardEditorPanel`: create/edit form, validation, deck selection, source display, and dirty-state guard.
- `TrashPage`: reuses table primitives but exposes only Trash-appropriate actions.

React owns transient query, sort, filter, selection, open-card, and draft state. Rust and SQLite remain authoritative for card data.

Each query is associated with a monotonically increasing request token. React ignores a response that belongs to an older token, preventing stale results from replacing a newer search. After a successful edit or bulk mutation, the Browser reloads the current query rather than attempting to reproduce backend lifecycle rules locally. It then removes IDs that no longer belong to the active result set from selection.

Search input is debounced for interaction quality, but explicit filter and sort changes run immediately. All controls have keyboard-accessible labels and visible focus states. Table rows are not made into inaccessible nested buttons; row selection, editor opening, and per-row menus use distinct controls.

## Error handling

- On query failure, retain the current filters and show a retryable error state.
- On editor save failure, retain the draft and keep the panel open.
- On bulk failure, retain selection and leave the visible rows unchanged until the next successful refresh.
- If a selected card was concurrently changed or removed, the backend rolls back the mutation and the UI reports the conflict before refreshing.
- If a destination deck no longer exists, move/restore fails without changing any card.
- Empty Front or Back is rejected in both React and Rust.
- Permanent deletion and Empty Trash require a confirmation that states the affected count.
- Dirty-form protection applies consistently to row changes, panel close, deck changes, back navigation, and Trash navigation.

## Search and scheduler integration

Every existing active-card read path must explicitly exclude `deleted_at IS NOT NULL`, including:

- Cards in a deck.
- Due-card and review queries.
- Card-by-ID paths used to start or continue review.
- Search Everything and FTS projections.
- Scheduler preview and rating commands.

Soft delete removes or suppresses the card's active FTS projection in the same transaction. Restore recreates the projection. Permanent delete removes it permanently. These behaviors prevent trashed content from leaking into search results while preserving recoverability.

Suspended cards remain searchable and visible in their deck but are excluded from due queues. Editing, moving, trashing, or restoring a card does not modify FSRS memory or create a review log.

## Testing strategy

### Rust and database

- Migration gives all existing cards `deleted_at = NULL` without changing schedule fields.
- Update validates required fields and normalizes tags.
- Move and suspend/unsuspend preserve scheduler state and review history.
- Trash preserves card data and excludes the card from all active reads.
- Restore returns a card to its original deck or requires a valid destination if that deck is gone.
- Permanent delete and Empty Trash remove the intended dependent data.
- Bulk operations deduplicate IDs and update every requested card exactly once.
- An invalid ID, invalid destination, or incompatible lifecycle state rolls back an entire bulk operation.
- Due, review preview/rating, deck listing, card lookup, and Search Everything cannot surface trashed cards.

### React

- Search debounce and stale-response protection.
- State/tag filters and each sort choice.
- Single, visible-page, and multi-row selection behavior.
- Bulk action availability and success/failure states.
- Create and edit in the shared side panel.
- Dirty-state confirmation on every exit path.
- Read-only source provenance.
- Trash restore, destination selection, permanent-delete confirmation, and Empty Trash.
- Keyboard labels, focus behavior, and table semantics.

### End to end and verification

The primary end-to-end flow is:

```text
create card
  -> edit content and tags
  -> select multiple cards
  -> move to another deck
  -> suspend and unsuspend
  -> move to Trash
  -> verify absence from deck/search/review
  -> restore
  -> trash again
  -> permanently delete
```

Completion requires the production frontend build, frontend unit tests, Rust tests, Rust formatting, clippy with warnings denied, and the relevant Playwright smoke tests to pass.

## Acceptance criteria

- Opening a deck shows a searchable and filterable table rather than the old slideshow.
- A user can create and edit a plain-text Basic card without losing its source or scheduler state.
- A user can select multiple cards and atomically move, suspend, unsuspend, or trash them.
- A failed bulk request changes no card and preserves the user's selection.
- A trashed card remains recoverable indefinitely and appears only in the global Trash.
- Restoring a card preserves its prior content, tags, source, scheduler state, and review history.
- Trashed cards never appear in active deck results, Search Everything, or review scheduling.
- Permanent deletion and Empty Trash require explicit count-based confirmation.
- Existing databases migrate without losing or rescheduling cards.
