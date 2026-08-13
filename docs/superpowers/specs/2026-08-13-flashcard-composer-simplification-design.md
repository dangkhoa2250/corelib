# Flashcard Composer Simplification Design

## Goal

Reduce visual clutter in flashcard creation and editing without removing stored capabilities from the rest of Corelib. The composer should hide tag editing, present image search as a clean image-only grid, and replace the dense formatting toolbar with a compact grouped toolbar.

## Scope

This change applies to:

- The modal and panel variants of `CardComposer`.
- The Add/Edit Card `CardSidePanel`.
- The shared `CardRichTextToolbar` used by those surfaces.
- The `MediaPicker` shown from the Image action.

It does not remove tags from persistence, search, filtering, Card Browser, Trash, or existing cards.

## Tags

The Tags field is removed from the Create Flashcard modal and the Add/Edit Card side panel.

- A newly created card from either surface sends `tags: []`.
- Editing an existing card preserves its current tags unchanged even though the field is hidden.
- Tag storage, APIs, Card Browser display, tag filters, and tag-aware search remain intact.
- Tags are not migrated or deleted.

This preserves existing user data and limits the change to reducing form complexity.

## Image Picker

The picker uses an equal-sized responsive image grid.

- Result tiles display only the image preview.
- Provider names such as Wikimedia, DuckDuckGo, and Openverse are not rendered.
- Attribution, author, and license text are not rendered in the picker.
- Provider and attribution metadata remain attached to each result and continue through staging and persistence.
- Each image remains an accessible button whose label uses the image title, without adding a visible caption.
- Loading, empty, provider-warning, per-result failure, retry, search, and load-more states remain available.
- Failed previews keep a compact visual fallback rather than exposing provider metadata.
- The grid stays inside the composer’s existing parent `ScrollArea`; it does not introduce a nested scroll surface.

## Toolbar Structure

All current formatting behavior remains available. The visual treatment changes from many large independent buttons to a compact segmented toolbar.

### Direct actions

- Undo and Redo remain direct icon buttons.
- Text color and highlight remain direct controls.
- Image remains a direct button using Tabler `IconPhoto`, visually showing a framed image with sun and mountain.
- Clear formatting remains a direct text button labeled `Clear`; it does not use a clear-formatting icon.

### Menu actions

Four icon-only triggers open compact menus:

1. Text formatting, represented by `A`:
   - Bold
   - Italic
   - Underline
   - Strikethrough
2. Paragraph style, represented by the active paragraph/heading icon:
   - Paragraph
   - Heading 1
   - Heading 2
   - Heading 3
3. List, represented by Tabler’s bullet-list icon:
   - Bullet list, with visible bullet dots
   - Numbered list, with visible numbers
4. Alignment, represented by the active Tabler alignment icon:
   - Align left
   - Align center
   - Align right
   - Justify

No menu trigger displays a dropdown chevron. Clicking the icon itself opens its menu.

### Menu behavior

- Selecting any item applies the command and closes the menu immediately.
- Clicking outside a menu closes it.
- Pressing Escape closes it and returns focus to its trigger.
- Only one toolbar menu may be open at a time.
- Active items are indicated with `aria-checked` or `aria-pressed` semantics and a visible check/selected state.
- Triggers expose accessible names and `aria-expanded`/`aria-haspopup` state.
- Keyboard navigation supports opening, moving through items, selecting, and closing without requiring a pointer.

## Visual Design

- Toolbar buttons are approximately 23–24px square/high.
- Adjacent buttons use `gap: 0`, producing a connected segmented-control appearance.
- Thin separators divide conceptual groups; there is no spacing between buttons inside a group.
- Icons use Tabler icons with a consistent approximately 1.5px stroke and 14–15px size.
- Buttons use small backgrounds close to their icon bounds; active and hover backgrounds derive from existing theme tokens.
- Compact menu rows are approximately 23–24px high with 11px labels and 14px icons.
- Menus size to their content instead of using a broad fixed width.
- Alignment uses clearly distinct left, center, right, and justified line geometry.
- Tooltips expose icon meaning on hover/focus.

## Component Design

`CardRichTextToolbar` owns toolbar state and the four menus. A small internal menu primitive handles open state, outside-click dismissal, Escape handling, focus restoration, and keyboard navigation. Menu definitions remain close to their Tiptap commands so active state and command execution cannot drift apart.

`MediaPicker` keeps result metadata in its existing typed result objects but renders only `RemoteImagePreview` inside each result button.

`CardComposer` always saves an empty tag list for new cards. `CardSidePanel` chooses tags based on mode: empty for a new card and the original card tags for an edit.

## Error Handling

- Image search and staging errors retain their existing retry paths.
- Removing visible metadata must not remove accessible result names.
- A toolbar command that cannot run is disabled through the existing Tiptap capability state.
- Closing a menu never changes formatting by itself.

## Testing

Focused component tests will verify:

- Neither composer surface renders a Tags field.
- New cards save empty tags and edited cards preserve existing tags.
- Image results contain previews but no visible provider, attribution, or license labels.
- Search, load-more, warnings, retry, staging, and image insertion still work.
- The toolbar renders compact grouped triggers and a text `Clear` button.
- Each menu contains the correct commands and closes after selection.
- List icons distinguish bullets from numbers.
- Alignment options use the four correct Tabler icons and commands.
- Outside click, Escape, active state, focus restoration, and keyboard navigation work.
- The picker remains content of the existing `ScrollArea` with the required 20px thumb-side inset.

Relevant Vitest suites and the desktop production build must pass. A fresh `tauri dev` process from the current worktree is required for final macOS verification; the long image grid and toolbar menus should be checked in both themes when authenticated runtime access is available.

## Non-goals

- Removing the tags database schema or tag APIs.
- Redesigning Card Browser or Trash tag behavior.
- Adding new formatting commands.
- Changing image providers or attribution persistence.
- Adding a nested image-picker scrollbar.
