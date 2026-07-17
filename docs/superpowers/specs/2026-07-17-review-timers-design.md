# Review Timers Design

## Goal

Show a per-card elapsed timer in both Review Due and Practice All while keeping scheduling effects exclusive to Review Due.

## Root cause

The original review surface displayed a per-card timer. When Review Due moved into its own backend-session component, it retained `startedAt` for review-log `elapsedMs` but lost the ticking `now` state and `.review-page__elapsed` output. Practice All retained a visible timer, but its current timer runs for the whole practice session rather than resetting for each card.

## Design

Add a small shared `useElapsedTime(startedAt)` hook under the review feature. It owns the ticking wall-clock state and returns a nonnegative elapsed duration. The hook restarts its display cycle whenever `startedAt` changes.

Review Due keeps a per-card `startedAt`. It resets that value when the active card or session changes, displays the hook's elapsed value in the footer, and continues using `Date.now() - startedAt` as the `elapsedMs` sent with a real rating.

Practice All separates two time concepts:

- `practiceStartedAt` is created once and is used only for the final total-duration summary.
- `cardStartedAt` resets whenever the active practice card changes and drives the visible per-card timer through the shared hook.

Practice ratings remain in memory. They never call the study rating backend, write review logs, or modify scheduling state.

## UI behavior

Both active modes render the existing `.review-page__elapsed` element in the footer above their rating buttons. The text starts at `0s`, increments while the card remains active, and returns to `0s` after moving to another card.

The Practice Complete summary continues to report the total duration of the full practice session rather than the duration of the final card.

## Testing

- Use fake time to prove Review Due displays an increasing timer and passes the same per-card duration to its rating callback.
- Prove a replacement Review Due card resets the visible timer.
- Prove moving to the next Practice All card resets the visible timer.
- Prove Practice All still has no persistence callback and retains a whole-session completion duration.
- Run the complete frontend test suite and production build.

## Out of scope

- Scheduler interval calculations and interval labels.
- Changing timer position, typography, or tick frequency.
- Persisting practice timing or practice ratings.
