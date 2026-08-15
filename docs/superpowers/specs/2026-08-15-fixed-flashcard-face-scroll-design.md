# Fixed Flashcard Face Scroll Design

## Goal

Keep the Front and Back editors in the desktop flashcard side panel at their
current 140px content-viewport height. When manually entered or translated
content exceeds that height, it must scroll inside the relevant editor. Deck
selection, the editor toolbars, and the Save/Cancel actions must remain outside
those scroll regions.

## Root cause

The panel variant of `CardComposer` renders its form in a non-shrinking,
auto-sized wrapper. Its face rows have no bounded height, so an editor's
`ScrollArea` grows with translated content instead of creating overflow. The
panel itself clips that expanded form with `overflow: hidden`, making the lower
content unreachable.

## Design

1. Mark the side-panel composer with a panel-specific CSS class.
2. Add a panel-only CSS rule that fixes each face editor's existing
   `ScrollArea` viewport to 140px. The current `ScrollArea` remains the sole
   scroll implementation; no native `overflow: auto` scrollbar is introduced.
3. Preserve the existing 20px thumb-side content inset so WKWebView's custom
   overlay thumb cannot cover translated text or selections.
4. Leave the modal composer unchanged: its faces continue to share the modal's
   available height through its existing flex layout.

## Testing

Add a focused regression test that verifies the panel selector fixes the face
scroll viewport at 140px, continues to use the shared `ScrollArea`, and keeps
the required 20px thumb-side inset. Retain the existing assertion that the
composer does not use native vertical scrolling or a WebKit scrollbar track.

Run the focused card/editor tests and the relevant desktop test suite. For
runtime validation, restart `tauri dev` from this checkout and check a long
translation in both themes: Front and Back remain fixed in size, their text
scrolls internally, and no white track or thumb/content overlap appears.

## Scope

This change applies to the desktop side-panel composer used from reader
selection and Add/Edit Card. It does not add a route, command, or new user
action.
