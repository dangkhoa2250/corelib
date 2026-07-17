# Shared Review Flashcard Design

## Goal

Make Review Due and Practice All use the same card-flip structure and animation while preserving their mode-specific content and behavior.

## Root cause

Practice All keeps both the front and back faces mounted and rotates their shared inner container. Review Due conditionally mounts only one face when `revealed` changes. Because the DOM face is replaced at the same moment as the transform, Review Due cannot produce the same continuous 3D flip.

## Design

Add a shared `ReviewFlashcard` component under `apps/desktop/src/features/review/`. It owns:

- The accessible flashcard section and keyboard interaction.
- The shared inner container.
- Permanently mounted front and back faces.
- The flipped modifier class.
- Shared labels, divider, and flip hint.

The component receives controlled `revealed` and `onReveal` props. It also receives renderable front, back-front, and back content so each mode can keep its existing presentation:

- Review Due passes its plain front and back text.
- Practice All passes its clickable front text and pronunciation controls.

`ReviewFlashcard` does not own the current card, rating buttons, navigation, YouGlish state, language selection, queue state, or scheduling. Those remain in the existing mode components.

## Behavior

Both modes always mount both faces. Clicking the unrevealed card or pressing Enter/Space calls `onReveal`; once revealed, the component does not call it again. The existing shared CSS continues to animate the inner container with the same `0.5s` `rotateX` transition.

Changing cards continues to reset `revealed` in the parent mode. Review Due still shows rating controls only after reveal, and Practice All retains its current self-rating and navigation behavior.

## Testing

- Add focused component tests for two mounted faces, click reveal, and keyboard reveal.
- Update ReviewPage tests to assert Review Due and Practice All render the shared card structure.
- Run the focused review tests, the complete frontend test suite, and the production frontend build.

## Out of scope

- Scheduler, session, and rating logic.
- Visual restyling or animation timing changes.
- Practice language, pronunciation, and YouGlish behavior.
- Extracting the review header, footer, or rating controls.
