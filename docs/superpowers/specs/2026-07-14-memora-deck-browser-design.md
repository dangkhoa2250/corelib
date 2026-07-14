# Memora deck list and Card Browser redesign

## Scope

Refresh the Memora deck-list view and the deck-specific Card Browser to match the supplied visual direction while preserving the existing card, deck, review, and filtering behavior.

## Memora page

- Keep the existing page structure, deck creation, rename, delete, and global review flow.
- The top-level action beside `New Deck` reads `Review X Due`, where `X` is the total number of due cards across every deck. It starts the existing global due-review flow.
- Render each deck as a compact, single-row item. The left side contains its name and optional description; the center shows separate New, Learning, and Due counts; the right side contains study and overflow actions.
- Clicking the deck row, excluding interactive controls, opens that deck's Card Browser.
- Replace the current row's study affordance with a `Study` button that opens a menu containing:
  - `Review Due`: starts review for cards due in that deck.
  - `Practice All`: starts a review session for every card in that deck.
- The study menu and overflow menu must not trigger row navigation.

## Deck Card Browser

- Replace the existing deck detail statistics header with a compact browser header: Back navigation, `{deck name} Card Browser`, and card count.
- Remove the duplicate New/Learning/Due summary from this view.
- Put the deck-scoped actions in the header: `Review Due`, `Practice All`, and `Add Card`.
- `Review Due` only reviews due cards for the open deck; `Practice All` covers all cards for that deck.
- Preserve the existing search, sort, filters, table, selection/bulk actions, editing, and source-view behavior.

## Visual and interaction rules

- Treat the supplied screenshots as layout and hierarchy references, not exact pixel targets. Deck rows should be visibly more compact than the reference image.
- Reuse established application tokens and controls; do not change sidebar navigation or unrelated screens.
- Disabled review actions communicate an empty state when their applicable card set is empty.

## Verification

- Add/adjust component tests for deck-row navigation, study-menu actions, global due count, and deck-scoped Card Browser actions.
- Run the affected Vitest tests and the desktop production build.
