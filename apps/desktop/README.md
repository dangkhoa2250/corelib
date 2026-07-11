# Library

Desktop application built with Tauri, React, and TypeScript.

## Native learning cards

Select text in the PDF reader and choose **Create flashcard**. The selected text becomes Front; write and edit Back yourself, then choose a deck and optional tags. Review today uses FSRS 6.6 with Again, Hard, Good, and Easy ratings. Cmd/Ctrl+K searches both documents and cards, and Show source returns to the original PDF page when it is still available.

The learning data is local SQLite data. Removing a source PDF keeps its card and quote, but marks the source unavailable. Sync, AI card generation, cloze cards, and advanced statistics are intentionally deferred.

## Memora

A persistent sidebar (Search, Library, Memora) provides navigation. Inside Memora, each deck opens a Card Browser with the full card lifecycle: create, edit (front/back/tags/deck), move between decks, suspend/unsuspend, trash, restore (to original or a different deck), delete permanently, and empty trash. Tag pills, status filters, sort, and infinite scroll are supported.

Editing a card's content and moving it to another deck is a single atomic backend operation (`update_and_move_card`) — if the deck move fails, the content change rolls back too.

The Trash page lists soft-deleted cards with their original deck name. Deleting a deck soft-deletes its cards into Trash, preserving them for restore to any other deck. Migration 0006 (`card_lifecycle`) adds the `deleted_at`, `deleted_from_deck_name`, and `suspended_from_state` columns that power this lifecycle.

## Tests

- **91 frontend** unit tests (Vitest + Testing Library)
- **89 Rust** unit tests + **1** PDF extraction isolation test
- **2 Playwright E2E** tests (library import + learning card lifecycle)

```bash
npm test                                    # frontend unit tests
npm run build                               # TypeScript + Vite production build
cargo test --all-targets --manifest-path src-tauri/Cargo.toml
cargo clippy --all-targets --all-features --manifest-path src-tauri/Cargo.toml -- -D warnings
npx playwright test                         # E2E tests
```
