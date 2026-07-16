# Memora Practical Anki-Like Learning Design

## Goal

Improve Memora from a basic FSRS-backed review flow into a dependable, practical Anki-like learning experience. The system should help ordinary users learn effectively without exposing Anki's full configuration surface or adding deck hierarchies, note-generated sibling cards, burying, custom scheduler scripts, or optimizer workflows.

The design keeps decks flat and focuses on:

- Correct learning and relearning steps.
- A backend-owned daily study queue.
- Configurable new-card limits.
- Reliable FSRS review scheduling.
- Clear separation between real study and consequence-free practice.
- Simple global settings with optional per-deck new-card overrides.

## Product principles

1. The default experience should work without configuration.
2. Real study must never schedule a suspended, future, stale, or unauthorized card.
3. Practice must never alter the real learning schedule.
4. Review cards should not be hidden behind a daily review limit. Only new cards are limited.
5. Advanced controls should remain small and safe.
6. Existing cards, FSRS memory state, and review history must survive migration.

## Scope

### Included

- Fixed learning steps for new cards.
- A fixed relearning step after a failed review.
- FSRS 6.6 for long-term review intervals.
- A backend `StudyQueueService`.
- Memora-wide new-card limit and per-deck overrides.
- Configurable desired retention.
- Queue/session validation when rating cards.
- Suspend and unsuspend behavior.
- Practice All without persistence.
- Settings under `Settings → Apps → Memora`.
- Migration, deterministic tests, React tests, and an end-to-end study flow.

### Excluded

- Nested decks or deck trees.
- Bury or unbury.
- Notes that generate sibling cards.
- Automatic sibling burying.
- Cloze-specific scheduling behavior.
- Daily review limits.
- Leeches or automatic suspension.
- User-editable learning/relearning steps.
- FSRS parameter optimization.
- Scheduler scripting.
- Anki import/export compatibility.

## Architecture

Rust owns all real-study decisions and persistence. React requests a study session, displays the returned cards and previews, and submits ratings using the session identity supplied by the backend.

The learning subsystem is split into three focused units:

### `StudyQueueService`

Responsibilities:

- Resolve effective Memora and deck settings.
- Build a queue for Review Today or a selected deck.
- Prioritize due learning/relearning cards, then due review cards, then eligible new cards.
- Enforce the effective new-card limit.
- Create and validate study sessions.
- Refresh a session when short learning steps become due.
- Reject ratings for cards that are no longer valid for the session.

It depends on the repository for data and on `ReviewScheduler` for interval previews and transitions.

### `ReviewScheduler`

Responsibilities:

- Apply fixed short-term learning and relearning steps.
- Delegate long-term memory updates and intervals to FSRS.
- Produce all four rating previews from the same state and configuration used by rating.
- Return the next card state, learning step, due timestamp, interval, stability, difficulty, and serialized FSRS memory state.

It does not read or write the database.

### `LearningRepository`

Responsibilities:

- Read cards, settings, counts, and review history.
- Persist Memora defaults and per-deck overrides.
- Create study sessions and session-card grants.
- Atomically update a card, append its review log, and consume the relevant session grant.
- Preserve existing card lifecycle, trash, source, tag, and browser behavior.

The existing broad `learning.rs` repository can remain initially, but new queue/session queries should be kept in a focused module if adding them would make the file harder to understand.

## Real study flow

### Starting a session

The frontend requests one of:

- Review Today across all active decks.
- Study a single deck.

The backend creates a session with a stable ID, scope, creation time, and granted card rows. The response includes:

- Session ID.
- Ordered cards currently available.
- Rating previews for each returned card.
- Counts for learning, review, and new cards.
- The next short-step due time when the queue is temporarily empty.

The frontend must not reconstruct eligibility by loading all cards and filtering them locally.

### Queue priority

At any queue refresh time, cards are gathered in this order:

1. Due `learning` and `relearning` cards, ordered by `due_at`, then card ID.
2. Due `review` cards, ordered by `due_at`, then card ID.
3. Eligible `new` cards, ordered by creation time, then card ID, up to the remaining new-card allowance.

Suspended, deleted, future review, and future learning cards are excluded.

Review cards have no daily cap. A user who has accumulated review backlog can work through the entire backlog. New cards are introduced only after the due learning and review cards currently available have been queued.

### Daily new-card allowance

The effective new-card limit is:

1. The selected deck's custom limit, when present.
2. Otherwise the Memora-wide default.

For Review Today across multiple decks, each deck receives its own effective allowance. A deck using the global default can introduce up to that default, while a deck with an override uses its own value. This avoids adding parent-deck allocation rules while keeping per-deck customization meaningful.

The daily allowance counts cards that received their first real rating during the current local study day, not merely cards that were placed into an abandoned session. Starting or reopening a session therefore does not consume the allowance.

The app uses the device's local calendar day for daily-limit accounting. Existing UTC timestamps remain the persistence format; the backend derives the local day boundary when counting introductions.

`0` means no new cards are introduced, while due learning and review cards remain available.

### Live short-step refresh

When a card is rated into a short learning or relearning delay, it leaves the currently visible queue. If its due time arrives while the study screen remains open, the frontend requests a queue refresh and the backend grants the card again.

When no card is currently available but a learning card is due soon, the completion view may show the next due time and allow the user to wait, leave, or refresh. The app does not need to hold a long-running backend timer.

## Scheduling behavior

### Fixed steps

Memora uses fixed, non-editable short-term steps:

- New-card learning: `1 minute → 10 minutes`.
- Review lapse relearning: `10 minutes`.

These values are shown in Advanced settings as informational text.

### New and learning cards

For a new card:

- `Again`: enter `learning` at the first step, due in 1 minute.
- `Hard`: remain in `learning` with a delay between Again and Good. With the fixed steps, use 6 minutes.
- `Good`: enter or advance learning. The first Good is due in 10 minutes; Good at the final step graduates the card into FSRS review.
- `Easy`: skip remaining learning steps and graduate directly into FSRS review.

For a card already in learning:

- `Again`: return to the first step, due in 1 minute.
- `Hard`: remain at the current learning position with the 6-minute hard delay.
- `Good`: advance to the next step or graduate after the final step.
- `Easy`: graduate immediately.

Every real rating is logged, including ratings made during learning.

### Review and relearning cards

For a due review card:

- `Again`: record a lapse, update FSRS with Again, enter `relearning`, and become due in 10 minutes.
- `Hard`, `Good`, or `Easy`: remain in `review` and use the matching FSRS interval.

For a card in relearning:

- `Again`: remain in relearning and become due in 10 minutes.
- `Hard`: remain in relearning with a 10-minute delay.
- `Good` or `Easy`: leave relearning and return to FSRS review using the matching FSRS result.

`lapses` increases only when a card that was in long-term `review` is rated Again. Repeated Again ratings while already in learning or relearning do not increment lapses again. `reps` increases for every persisted real rating.

### FSRS configuration

The existing pinned FSRS 6.6 dependency remains the long-term scheduler. Desired retention defaults to `0.90` and is configurable from `0.80` through `0.97`.

The scheduler version stored in review logs must identify both the FSRS implementation and the Memora learning policy, for example `memora-learning-v2+fsrs-6.6.0`. This makes later scheduling changes auditable.

Preview and apply must receive the same:

- Card state.
- Learning step.
- Previous FSRS memory state.
- Elapsed time.
- Desired retention.
- Review time.

This prevents the interval displayed on a rating button from differing from the interval persisted after selection.

## Study-session validation

Each real rating includes:

- Session ID.
- Card ID.
- Rating.
- Elapsed answer time.
- Expected card state.
- Expected due timestamp.
- A grant/version token from the session-card row.

The backend validates that:

- The session exists and has not expired.
- The session scope permits the card's deck.
- The card was granted to this session.
- The grant has not already been consumed.
- The card is active and not suspended or deleted.
- Card state and due timestamp still match the expected values.
- A non-new card is due at rating time.
- A new card was admitted within the effective daily allowance.

The update, review-log insert, and grant consumption happen in one SQLite transaction. A retry after an uncertain response either returns the already-applied result for the same consumed grant or reports a clear stale-rating error; it must not create a second review log.

Sessions are short-lived coordination records, not durable study plans. They can expire after 24 hours. Restarting the app or returning later creates a new session from current database state.

## Practice All

Practice All is explicitly separate from real study:

- It may display every active, non-deleted card in a selected deck, including cards not due.
- It never calls the real rating command.
- It never writes review logs.
- It never changes state, due time, reps, lapses, stability, difficulty, memory state, or daily new-card counts.
- The four buttons are self-assessment labels used only for the in-memory practice summary.

The UI should label the mode as Practice and state that answers do not affect the schedule.

## Suspend behavior

Suspend remains the only manual mechanism for removing a card from study indefinitely.

- Suspending preserves the previous lifecycle state in `suspended_from_state`.
- Suspended cards never appear in real study or practice.
- Unsuspending restores the previous state and due timestamp.
- Rating a card that was suspended after session creation is rejected without changing the card or log.

No bury state or temporary hide-until-tomorrow behavior is introduced.

## Settings experience

### Global Memora settings

The Settings sidebar gains an `Apps` section containing `Memora`.

The main Memora settings view shows:

- `New cards per day`
  - Integer from `0` through `999`.
  - Default `20`.
  - Help text explaining that `0` pauses new cards but keeps due reviews.

An `Advanced` disclosure contains:

- `Desired retention`
  - Percentage from `80%` through `97%`.
  - Default `90%`.
- Read-only learning-step text: `1 minute → 10 minutes`.
- Read-only relearning-step text: `10 minutes`.
- `Restore defaults`, which restores `20` and `90%` after confirmation.

Settings search should match terms such as Memora, learning, cards, review, retention, and FSRS.

### Per-deck settings

The `…` menu on each Memora deck row gains `Learning settings`.

The deck dialog offers:

- `Use Memora default`, showing the currently inherited value such as `20/day`.
- `Custom limit`, with an integer input from `0` through `999`.

Only the new-card limit is overridable per deck. Desired retention remains global to keep scheduling behavior understandable.

Removing a custom limit immediately returns the deck to inheritance. Changing the Memora default automatically affects every inheriting deck.

## Data model and migration

A new migration adds the following logical data. Exact table names may follow established repository naming conventions.

### Memora settings

One singleton row:

- `new_cards_per_day INTEGER NOT NULL CHECK 0..999`.
- `desired_retention REAL NOT NULL CHECK 0.80..0.97`.
- `updated_at TEXT NOT NULL`.

The migration inserts defaults of `20` and `0.90`.

### Deck learning overrides

One optional row per deck:

- `deck_id` primary key and foreign key with cascade delete.
- `new_cards_per_day INTEGER NOT NULL CHECK 0..999`.
- `updated_at TEXT NOT NULL`.

Absence of a row means inheritance.

### Card learning progress

Cards gain a nullable learning-step field:

- `learning_step INTEGER`.

Expected values:

- `NULL` for `new`, `review`, and `suspended` cards whose saved prior state does not require a step.
- `0` or `1` for the two new-card learning steps.
- `0` for relearning.

Repository validation enforces consistency between lifecycle state and learning step.

### Study sessions

`study_sessions` stores:

- Session ID.
- Scope kind: all decks or one deck.
- Optional deck ID.
- Created and expiry timestamps.

`study_session_cards` stores:

- Session ID and card ID.
- Grant token.
- Expected state and due timestamp.
- Whether the card was admitted as new.
- Consumed timestamp.
- Resulting review-log ID when consumed.

Session cleanup may delete expired sessions opportunistically when a new session is created.

### Migration of existing cards

- Existing `new` cards keep state `new` and `learning_step = NULL`.
- Existing `review` cards keep due time, stability, difficulty, memory state, reps, lapses, and last-review time.
- Existing `learning` cards receive the nearest valid new-card step based on their current due time: due within 5 minutes maps to step 0; later due maps to step 1.
- Existing `relearning` cards receive step 0.
- Existing suspended cards retain `suspended_from_state`; if the saved prior state is learning or relearning, the migration assigns the matching valid step.
- Existing review logs are unchanged.

The migration must be covered by an upgrade test that starts from the current schema and representative card states.

## API changes

The existing frontend flow based on `list_due_cards`, per-card preview calls, and unrestricted `rate_card` is replaced for real study by commands shaped around:

- `start_study_session(scope)`.
- `refresh_study_session(session_id)`.
- `rate_study_card(session_id, card_id, grant_token, expected_state, expected_due_at, rating, elapsed_ms)`.
- `get_memora_settings()`.
- `update_memora_settings(settings)`.
- `get_deck_learning_settings(deck_id)`.
- `update_deck_learning_settings(deck_id, override_or_inherit)`.

Legacy commands can remain temporarily for compatibility during implementation, but the production Review Today and Study Deck routes must stop using them before the work is considered complete. The unrestricted legacy rating path should then be removed or made private to tests.

## Error handling

- Invalid setting values are rejected by both typed frontend validation and backend/database constraints.
- A stale rating returns a specific recoverable error. The UI refreshes the session and explains that the card changed elsewhere.
- A suspended or deleted card is removed on refresh and is never silently rated.
- Scheduler errors leave the current card visible and retryable.
- Database transaction failure leaves the card, grant, and review log unchanged.
- Invalid stored FSRS state produces a safe error and does not reset the card silently.
- If a session expires, the UI starts a fresh session and continues from current database state.
- If no cards are available but a learning card is due soon, the response distinguishes “finished for now” from “nothing due today.”

## Testing strategy

### Scheduler unit tests

Use fixed timestamps and deterministic configuration to cover every transition:

- `new × Again/Hard/Good/Easy`.
- First and final `learning` steps × all four ratings.
- `review × Again/Hard/Good/Easy`.
- `relearning × Again/Hard/Good/Easy`.
- Lapse counting rules.
- Preview/apply equality.
- Desired-retention validation.
- Invalid state/step combinations.

### Queue and repository tests

- Priority is learning/relearning, review, then new.
- Future and suspended cards are excluded.
- Review backlog is not capped.
- Global new-card limit is enforced.
- Per-deck overrides replace the inherited limit.
- Limit `0` introduces no new cards.
- Daily allowance counts first persisted ratings, not session grants.
- Starting abandoned sessions cannot consume or bypass daily limits.
- Review Today applies limits independently per flat deck.
- Short-step cards return after their due time.
- Stale, consumed, suspended, and expired grants are rejected.
- Applying a rating and consuming a grant is atomic.
- Retrying a consumed grant cannot create a duplicate review.
- Existing lifecycle, trash, and suspend behavior remains valid.

### Migration tests

- Defaults are inserted.
- Existing FSRS fields and review logs are unchanged.
- Every current lifecycle state migrates to a valid learning-step combination.
- Suspended cards preserve their prior state.
- Opening an already-migrated database remains idempotent.

### React tests

- Settings sidebar shows `Apps → Memora`.
- New-card limit validates `0–999`.
- Advanced disclosure contains retention and read-only steps.
- Restore defaults restores `20` and `90%`.
- Deck menu opens Learning settings and supports inherit/custom modes.
- Real study uses session commands rather than local card filtering.
- Practice All never invokes a persistence/rating command.
- Stale-session errors refresh the queue without advancing incorrectly.
- A temporarily empty learning queue communicates the next due time.

### End-to-end tests

- Create a new card, start study, rate through `1 minute → 10 minutes`, and graduate into review.
- Rate a due review card Again, complete the 10-minute relearning step, and return to review.
- Set the global new-card limit to zero and confirm reviews remain available.
- Override one deck's new-card limit without changing another deck.
- Practice a future card and confirm its persisted schedule and review-log count are unchanged.

Desktop UI verification must follow the repository's version-sensitive Tauri instructions. A fresh runtime must be launched from the tested checkout before reporting real WKWebView behavior as verified.

## Acceptance criteria

- Real study is built by the backend and cannot include suspended or future cards.
- Due learning/relearning cards appear before reviews, and reviews before new cards.
- New cards follow the fixed `1 minute → 10 minutes` learning sequence.
- Failed review cards follow the fixed 10-minute relearning sequence.
- Long-term intervals and memory state are produced by FSRS 6.6 with the configured desired retention.
- Review Today has no review cap and honors each deck's effective new-card limit.
- Settings exist at `Settings → Apps → Memora`; per-deck overrides exist in the deck `…` menu.
- Practice All does not change any persisted learning data.
- Ratings are session-validated, atomic, and safe against duplicate or stale submission.
- Existing cards and review history migrate without loss.
- No nested decks, burying, sibling behavior, or advanced Anki configuration is added.

## Approved follow-up: review fixes and UI simplification

The July 17 implementation review approved these corrections:

- Queue previews and persisted ratings use the same elapsed-day input.
- Every persisted learning and relearning rating updates FSRS memory state, while fixed short steps continue to own the immediate due time.
- Relearning Hard uses the FSRS Hard memory result, not Again.
- An expired study session is replaced in application route state so later ratings and refreshes use the replacement session ID.
- Automatic refresh runs only when the visible queue is empty and waits until the next learning due time. There is no manual Refresh now action.
- Stale-rating handling no longer performs a special UI refresh. The normal error is shown and the user can leave the session.
- Practice uses a compact Practice heading without a persistent schedule disclaimer.
- Restore defaults is removed from Memora settings.
