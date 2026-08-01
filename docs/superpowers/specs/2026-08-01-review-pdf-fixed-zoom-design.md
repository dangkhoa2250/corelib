# Review media modal sizing design

## Goal

Make review media easier to read and give both media modal types a compact,
uncluttered header.

## Scope

- Apply a fixed 150% PDF.js scale only when `SourceViewer` is presented in the
  review media modal.
- Retain the existing initial-page and source-highlight anchoring behavior.
- Retain vertical and horizontal scrolling through the existing `ScrollArea`.
- Leave the non-modal source viewer panel's current whole-page fit unchanged.
- Increase the YouGlish modal maximum width by 16 CSS pixels, while retaining
  its viewport-relative width cap.
- Reduce the shared review-media modal header to 32 CSS pixels tall; remove
  its bottom border and avoid applying header container styles to the title.
  This removes the apparent underline below titles such as “Pronunciation for
  ‘something’” and “Source PDF”.

## Implementation boundary

`SourceViewer` owns its PDF.js scale selection. Its existing `presentation`
prop determines the mode: `modal` selects `1.5`; `panel` continues selecting
`page-fit`. The resize observer reapplies the selected mode, so resizing the
window does not revert the modal to whole-page fit.

No new route, command, controls, or modal surface is introduced.

## Error handling and accessibility

The existing loading/error states, focus-managed modal, page label, source
highlights, and keyboard scrolling remain unchanged. The established
`ScrollArea` continues to provide the modal PDF scrolling behavior and its
thumb-side content inset.

## Tests

- Add a focused source-viewer test proving modal presentation configures PDF.js
  with a 1.5 scale and reapplies it after a resize.
- Preserve or extend the panel test to prove panel presentation still uses
  `page-fit`.
- Add or update modal styling assertions for the 16px wider video dialog and
  its compact, borderless header.
- Run the focused desktop test suite and perform fresh Tauri runtime verification
  from this checkout when practical.
