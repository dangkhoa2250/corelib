# Shared Flashcard Editor Toolbar

**Date:** 2026-08-01
**Status:** Approved (design)
**Feature branch:** feat/rich-flashcards-pixabay

## Problem

The card composer currently renders two independent Tiptap editors (Front and
Back), each with its own formatting toolbar inside `CardRichTextEditor`. That
duplicates the toolbar markup and consumes vertical space. The user wants a
single shared toolbar rendered once, placed below the Deck selector, used by
both Front and Back faces.

## Design

### Layout

```
Deck   [combobox]
[ undo redo | B I U S | ¶ H1 H2 H3 | • List 1. List | align | color highlight | Image Clear ]
Front  [editor body]
Front Language [picker]
Back   [editor body]
Tags   [input]
```

The toolbar is rendered once in `CardComposer` (and once in the panel variant
via `CardSidePanel`, which renders the same shared toolbar). No toolbar is
rendered inside `CardRichTextEditor` when `showToolbar` is false.

### Behavior

- The shared toolbar applies to the face that currently has focus.
- `CardRichTextEditor` reports focus via a new `onFocusChange(focused: boolean)`
  callback (Tiptap `focus`/`blur` editor events).
- `CardComposer` tracks `focusedFace: "front" | "back" | null`.
- Toolbar button state (B/I/list/heading/align active, undo/redo enabled) is
  derived from the focused editor via `useEditorState`.
- When no face is focused, all toolbar buttons (including undo/redo) are
  disabled — the toolbar does nothing.
- The "Image" button opens the file picker of the focused face via a new
  `openImagePicker()` handle method.
- The Pixabay and Translate buttons next to "Back" are unchanged (not part of
  the toolbar).
- Focus behavior on open: the modal composer still auto-focuses the Front
  editor on mount, so the toolbar is immediately active for the Front face.

### Component changes

- `CardRichTextEditor.tsx`
  - Add `showToolbar?: boolean` prop (default `true` to preserve any standalone
    usage; composer passes `false`).
  - Add `onFocusChange?: (focused: boolean) => void` prop.
  - Extend `CardRichTextEditorHandle` with `getEditor()` and `openImagePicker()`.
  - Keep the internal toolbar for `showToolbar === true` (used by tests and any
    non-composer consumers).
- `CardRichTextEditor.css`
  - Extract the toolbar styles into a shared class so the composer's toolbar
    reuses the same look (e.g. `.shared-editor-toolbar` reusing existing
    button/separator classes, or keep class names and apply the toolbar CSS to
    both).
- `CardComposer.tsx`
  - Render a single shared toolbar below the Deck selector.
  - Track `focusedFace` from the Front/Back `onFocusChange`.
  - Wire toolbar buttons to the focused editor; disable all when no focus.
  - Hide the per-editor toolbar via `showToolbar={false}`.
- `CardSidePanel.tsx`
  - Renders the same shared toolbar below its deck selector (identical to
    modal variant), tracking focus identically.

### Testing

- `CardRichTextEditor.test.tsx`
  - Keep existing toolbar tests (internal toolbar still renders by default).
  - Add tests for `onFocusChange` reporting and `getEditor`/`openImagePicker`
    handle methods.
- `CardComposer.test.tsx`
  - "toolbar applies to the focused face" — focus Front, toggle bold, assert
    Front editor gets bold; focus Back, assert Back gets bold.
  - "toolbar is disabled when no face is focused".
  - Update any tests that relied on per-editor toolbar aria-labels.
- `CardSidePanel.test.tsx`
  - Assert the panel renders the shared toolbar and it targets the focused
    face.

### Out of scope

- No changes to the review surface (`RichDocumentRenderer`) or backend.
- No changes to Pixabay/Translate buttons.
- No change to the rich document model.

## Risks / notes

- Focus/blur on Tiptap contenteditable: the `blur` event of one editor and the
  `focus` event of the other both fire when switching Front→Back. Update rule:
  on `onFocusChange(true)` set `focusedFace` to that face; on
  `onFocusChange(false)` only clear `focusedFace` if it still points at that
  face (so a blur that races ahead of the other face's focus does not blank
  the toolbar). Two editors cannot be focused simultaneously; `focusedFace`
  is a single value.
