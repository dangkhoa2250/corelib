# Shared Review Surface Design

## Problem

Before the Memora branch was merged, `.review-page` constrained both Review Due and Practice All to the same 720px content width. The merge retained `main`'s newer full-viewport `.review-page` shell, where the constraint moved into `.review-page__split > .review-page__body`, but only Practice All received that inner shell. Review Due therefore stretches its shared `ReviewFlashcard` across the viewport even though both modes still use the same flip component.

## Goal

Review Due and Practice All must render the active flashcard through the same layout surface so their card size, spacing, scrolling, flip behavior, pronunciation controls, YouGlish controls, and source controls remain visually identical. Their scheduling behavior and mode-specific controls remain distinct.

## Design

Introduce a shared review surface component responsible for:

- the full-page `.review-page` container;
- the constrained `.review-page__split` layout;
- the `.review-page__body` `ScrollArea` with its 20px thumb-side inset;
- header, `ReviewFlashcard`, auxiliary content, footer, and optional source-viewer slots.

Both Study and Practice render their active card through this component. Shared card content renders the same clickable front text, pronunciation button, source button, language picker, YouGlish panel, and back content in both modes.

Study continues to own backend session refresh, grant validation, interval previews, persisted ratings, and the elapsed time sent to the scheduler. Practice continues to own progress/navigation, local rating counts, completion summary, and a timer that never affects scheduling.

Empty, waiting, and completion states stay outside the active-card surface and retain their existing vertical offsets.

## Error handling

The shared surface does not own business errors. Study and Practice continue to create their existing error messages and pass them into the footer. Source and language failures keep their current behavior.

## Testing

- Add a failing component test proving Study and Practice render the same shared surface hierarchy around `ReviewFlashcard`.
- Assert both modes expose the same pronunciation and source controls.
- Preserve assertions that Study shows interval labels and Practice never does.
- Preserve per-card timer and scheduling callback tests.
- Keep the `ScrollArea` and 20px content-inset regression assertions required for WKWebView.
- Run the focused review tests, full frontend suite, production build, and relevant desktop verification.

## Non-goals

- No scheduling, FSRS, queue, timer, rating, or completion-summary changes.
- No new review controls or settings.
- No deck hierarchy or navigation changes.
