# Review Media Modal Design

## Context

`ReviewSessionSurface` currently renders a card source PDF as a second column beside the flashcard and renders the selected word's YouGlish player below the review footer. Both behaviors change the review layout and divide attention between the active flashcard, review controls, and supporting media.

Review Due and Practice All already share `ReviewSessionSurface`; the revised behavior must remain identical in both modes.

## Goal

Show source PDFs and YouGlish videos in a focused modal above the current flashcard. The modal temporarily blocks the review surface without navigating away from the session or changing the card's state.

## Non-goals

- Replacing `SourceViewer`, PDF.js, YouGlish, or the YouGlish-hosted player.
- Changing how cards store source provenance or front language.
- Changing review scheduling, ratings, practice navigation, or elapsed-time semantics beyond explicitly keeping the existing timer active while a modal is open.
- Adding a new public route, command, command-palette action, or navigation destination.
- Supporting more media types in this change.

## Chosen approach

Use one shared modal shell with content specialized for PDF and YouGlish. A shared shell avoids duplicating dismissal, backdrop, focus-management, and accessibility behavior while allowing each content type to use an appropriate size.

The rejected alternatives are:

- Separate modal implementations for PDF and YouGlish, which would duplicate lifecycle and accessibility logic.
- A full-screen route or page, which would make supporting media feel like navigation away from the review session.

## Component boundaries

### `ReviewSessionSurface`

`ReviewSessionSurface` remains the shared owner of the active card's supporting-media state. It replaces the independent `showYouGlish` and `sourceView` presentation flags with a single discriminated state representing exactly one of:

- no modal;
- a source modal with the selected `CardSource`; or
- a YouGlish modal with the selected word.

Selecting a source or a word opens the corresponding state. Closing the modal clears it. The current card, revealed face, study/practice progress, language, and timer remain owned by their existing components. `ClickableFrontText` derives its selected word from the YouGlish branch of this state, so clearing the modal state also clears the highlight without a second presentation flag.

### `ReviewMediaModal`

Add a shared modal shell responsible only for modal behavior and presentation:

- render the backdrop and dialog container above the review surface;
- expose a content-size variant for `pdf` and `video`;
- label the dialog for the active content;
- prevent interaction with the background;
- close from the close button, `Escape`, or a pointer click that begins and ends on the backdrop;
- keep keyboard focus inside the dialog;
- place initial focus on the shared close control;
- restore focus to the exact eye button or word trigger after dismissal when that trigger still exists; and
- render caller-provided content without owning PDF or YouGlish behavior.

The dialog is mounted in a layer that is not clipped by `ScrollArea` or the flashcard's stacking context. Only one dialog can be mounted at once.

### `SourceViewer`

`SourceViewer` continues to own PDF loading, page rendering, source highlighting, match navigation, loading, and error states. Its review presentation becomes modal-compatible instead of participating in `.review-page__split`.

`ReviewMediaModal` supplies the dialog title and only close control. In modal presentation, `SourceViewer` omits its existing `Source` title and close control but retains its page label and match-navigation toolbar below the shared modal header.

### `YouGlishPanel`

`YouGlishPanel` continues to own the embed URL, iframe sizing messages, unsupported-language/no-result handling, and visible YouGlish attribution. Its review presentation becomes modal content rather than a card rendered after the review footer.

`ReviewMediaModal` supplies the dialog title and only close control. In modal presentation, `YouGlishPanel` omits its existing title and close control but retains the player, errors, and attribution. Closing unmounts the panel and iframe so playback cannot continue in the background.

## Interaction flow

### Source PDF

1. The learner activates the enabled eye button.
2. A large modal opens above a dimmed review surface.
3. The source PDF opens at the saved page and retains the existing highlight and match navigation behavior.
4. The review surface cannot be clicked, focused, flipped, rated, or navigated while the modal is open.
5. Closing the modal returns the learner to the same card and face and restores focus to the eye button.

The eye button remains disabled with the existing unavailable-source explanation when the PDF source no longer exists.

### YouGlish

1. The learner activates a clickable word wherever the shared flashcard already exposes its clickable front text.
2. The word becomes highlighted and a video-sized modal opens above a dimmed review surface.
3. The existing YouGlish player loads the word in the card's confirmed front language.
4. The review surface cannot be interacted with while the modal is open.
5. Closing the modal unmounts the player, clears the word highlight, and restores focus to the selected word when it still exists.

The existing language prompt remains responsible for cards without a confirmed supported front language.

## Layout and motion

The two content types use the same backdrop, corner treatment, elevation, spacing scale, and dismissal behavior but different content-aware sizes.

### PDF size

- Occupy most of the available viewport while preserving a visible outer margin.
- Give the PDF canvas the remaining height after its header.
- Keep page and match controls visible while the PDF content scrolls.
- Adapt down to the minimum supported desktop window without forcing the dialog beyond the viewport.

### Video size

- Use a narrower centered dialog sized to the YouGlish/video content.
- Preserve the player's natural aspect and the existing dynamic viewport-height behavior.
- Keep the title, close control, error state, and `Powered by YouGlish.com` attribution visible.
- Avoid empty space that would result from giving video the PDF dialog's dimensions.

The backdrop visibly dims the flashcard and review controls. Opening and closing use a 120 ms ease-out opacity transition plus a subtle dialog scale from 98% to 100%. Under `prefers-reduced-motion: reduce`, both transitions have zero duration and no scale change.

## Lifecycle and timing

- Opening supporting media does not flip or otherwise mutate the flashcard.
- The elapsed review/practice timer continues while either modal is open because consulting the source or pronunciation is part of the active learning session.
- Changing cards, completing the session, or leaving Review closes the modal and disposes its content.
- Closing a modal does not clear an unrelated review error or change rating/navigation state.
- A PDF or iframe must never remain mounted after its modal closes.

## Loading and error behavior

Loading and errors stay inside the dialog so the background layout does not move.

- PDF keeps its existing loading and rendering-error presentation.
- YouGlish keeps its unsupported-language and no-result/error presentation.
- Every loading or error state retains a usable close button and `Escape` dismissal.
- An error does not dismiss the dialog automatically.
- Closing during an asynchronous load must prevent stale content from reappearing after the modal unmounts.

## Accessibility

- The container uses `role="dialog"` and `aria-modal="true"` with a content-specific accessible name.
- Background review content is inert for pointer and keyboard interaction while the dialog is mounted.
- Keyboard focus cannot escape to the review surface.
- `Escape` closes the dialog.
- The close control has an explicit accessible name.
- Focus is restored to the originating trigger when it remains mounted. If a card change removed that trigger while the dialog was closing, focus moves to the active `ReviewFlashcard`; when navigation removes the review surface entirely, no restoration is attempted.
- Backdrop dismissal is supplementary; all behavior remains keyboard-operable.

## Scroll-surface requirements

The PDF dialog is a new scrollable desktop surface. Before implementation modifies it, the implementation must load and follow `checking-scroll-surfaces`. Automated coverage must include the native WKWebView scrollbar-track reset and the custom-thumb content-inset checks required by that skill. A browser-only CSS assertion is not sufficient evidence of real WKWebView behavior.

## Testing

### Component tests

- Both Study and Practice open the same PDF dialog from the eye button.
- Both modes open the same YouGlish dialog from a clickable word.
- At most one media dialog exists.
- Dialog content clicks do not dismiss; backdrop click, close button, and `Escape` do.
- Background flashcard, ratings, and navigation cannot be activated while the dialog is open.
- Focus enters the dialog, remains trapped, and returns to its trigger after dismissal.
- Closing YouGlish clears the word highlight and removes its iframe.
- Closing PDF removes the viewer and prevents a pending load from restoring it.
- Card change, session completion, and page exit dispose the active dialog.
- Flashcard face, active card, session progress, and unrelated error state survive open/close.
- The elapsed timer continues advancing while the modal is open.
- PDF and YouGlish loading/error states remain dismissible.
- Reduced-motion styles remove nonessential modal transition motion.

### Layout and style tests

- PDF and video variants use their intended content-aware dimensions and stay within the viewport.
- The PDF header remains fixed while its content region scrolls.
- The modal is not clipped by the review `ScrollArea`.
- Existing split-pane and below-footer review presentation rules are removed or no longer active.
- The required scroll-surface track and inset checks pass.

### Desktop verification

Unit tests and a Vite build do not prove WKWebView focus, iframe cleanup, or scrollbar behavior. Before reporting the UI verified, record the source revision and dirty state, restart `tauri dev` from the current checkout or build a fresh release artifact, and report the exact launch mode and artifact tested as required by the repository instructions.

## Acceptance criteria

1. Activating the eye button shows only the source PDF in a focused large modal above the dimmed, inert flashcard.
2. After dismissing that modal, the learner returns to the same flashcard and can activate a word to open YouGlish in a focused, content-sized modal instead of below the card.
3. Both modals close by close button, `Escape`, and backdrop click; neither continues rendering or playing after close.
4. PDF and video use distinct content-aware sizes within one consistent modal system.
5. Review Due and Practice All behave identically.
6. The timer continues while supporting media is open.
7. Focus, keyboard dismissal, background inertness, loading/error states, and reduced motion meet the accessibility behavior described above.
8. Required automated tests, scroll-surface checks, and fresh desktop-runtime verification are completed before the implementation is reported as finished.
