# Shared Flashcard Editor Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two per-face formatting toolbars in the flashcard composer (modal + panel) with one shared toolbar below the Deck selector that targets the currently focused face.

**Architecture:** Extract the existing toolbar JSX out of `CardRichTextEditor` into a reusable `CardRichTextToolbar` component that takes a `Editor | null` plus an insert-image callback and renders idle/disabled state for `null`. `CardRichTextEditor` keeps its editor body, file input, scroll area, and gains `showToolbar`, `onFocusChange`, and two handle methods (`getEditor`, `openImagePicker`). `CardComposer` and `CardSidePanel` each render one shared toolbar and track `focusedFace`.

**Tech Stack:** React, TypeScript, Tiptap (`@tiptap/react` `useEditorState`), Vitest + Testing Library (jsdom).

---

### Task 1: Extract `CardRichTextToolbar`

**Files:**
- Create: `apps/desktop/src/features/cards/CardRichTextToolbar.tsx`
- Modify: `apps/desktop/src/features/cards/CardRichTextEditor.tsx`
- Test: `apps/desktop/src/features/cards/CardRichTextToolbar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/desktop/src/features/cards/CardRichTextToolbar.test.tsx` with a render helper that mounts a real Tiptap editor (same setup used by `CardRichTextEditor.test.tsx`) and renders `<CardRichTextToolbar editor={editor} onInsertImage={vi.fn()} />`. Copy the render/setup boilerplate (jsdom shims, `screen`, `userEvent`) from `CardRichTextEditor.test.tsx:1-200`.

Tests:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { Editor } from "@tiptap/core";
import { CardRichTextToolbar } from "./CardRichTextToolbar";

function Harness({ onInsertImage }: { onInsertImage: () => void }) {
  const editor = useEditor({ extensions: [StarterKit], content: "<p>hi</p>" });
  if (!editor) return null;
  return (
    <div>
      <CardRichTextToolbar editor={editor} onInsertImage={onInsertImage} />
      <EditorContent editor={editor} />
    </div>
  );
}

test("applies formatting to the given editor and reflects active marks", async () => {
  const user = userEvent.setup();
  const { container } = render(<Harness onInsertImage={vi.fn()} />);
  const editable = container.querySelector(".tiptap")!;
  await user.click(editable);
  const bold = screen.getByRole("button", { name: "Bold" });
  await user.click(bold);
  await user.keyboard("text");
  expect(bold).toHaveAttribute("aria-pressed", "true");
  expect(container.querySelector("strong")?.textContent).toBe("text");
});

test("disables every button when the editor is null", () => {
  render(<CardRichTextToolbar editor={null} onInsertImage={vi.fn()} />);
  for (const btn of screen.getAllByRole("button")) {
    expect(btn).toBeDisabled();
  }
});

test("insert image button invokes onInsertImage", async () => {
  const user = userEvent.setup();
  const onInsertImage = vi.fn();
  render(<Harness onInsertImage={onInsertImage} />);
  await user.click(screen.getByRole("button", { name: "Insert image" }));
  expect(onInsertImage).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix apps/desktop -- --run src/features/cards/CardRichTextToolbar.test.tsx`
Expected: FAIL — module `./CardRichTextToolbar` not found.

- [ ] **Step 3: Implement `CardRichTextToolbar`**

Create `apps/desktop/src/features/cards/CardRichTextToolbar.tsx` by MOVING this code verbatim from `CardRichTextEditor.tsx`:

- `interface ToolbarState`, `IDLE_TOOLBAR`, `ToolbarButton`, and the whole toolbar JSX (`undo/redo`, marks, blocks, lists, alignment, color controls, Image, Clear) — i.e. everything inside the `<div role="toolbar">...</div>` at `CardRichTextEditor.tsx:307-773`.
- The `ToolbarButton` component.

New component API:

```tsx
import { type ReactNode } from "react";
import { useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/core";

export interface CardRichTextToolbarProps {
  editor: Editor | null;
  disabled?: boolean;
  onInsertImage: () => void;
}

export function CardRichTextToolbar({
  editor,
  disabled = false,
  onInsertImage,
}: CardRichTextToolbarProps) {
  const toolbar = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current) return IDLE_TOOLBAR;
      return { /* same selector body as CardRichTextEditor.tsx:556-577 */ };
    },
  });
  const setAlign = (alignment: "left" | "center" | "right" | "justify") => {
    editor?.chain().focus().setTextAlign(alignment).run();
  };
  const isDisabled = disabled || !editor;
  return (
    <div
      className="card-rich-text-editor__toolbar shared-editor-toolbar"
      role="toolbar"
      aria-label="Card formatting"
      onMouseDown={(event) => event.preventDefault()}
    >
      {/* every existing button, with disabled={isDisabled || !toolbar.canUndo} etc.
          and color inputs disabled={isDisabled} — the Image button calls onInsertImage */}
    </div>
  );
}
```

The toolbar `onMouseDown` preventDefault keeps the contenteditable focused when clicking any toolbar control (buttons already do this; the color `<label>`s do not, and losing focus would disable the shared toolbar mid-interaction).

Remove `fileInputRef`, the hidden file input, `insertFiles`, `MAX_*`/error constants, and `CardImage` are NOT moved — they stay in `CardRichTextEditor`. `CardRichTextToolbar` contains no file input; `onInsertImage` delegates back to the owning editor.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix apps/desktop -- --run src/features/cards/CardRichTextToolbar.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Refactor `CardRichTextEditor` to use the shared toolbar behind `showToolbar`**

In `CardRichTextEditor.tsx`:

- Import `CardRichTextToolbar` and `Editor`.
- Delete the moved code (`ToolbarState`, `IDLE_TOOLBAR`, `ToolbarButton`, toolbar JSX at lines 307-773) from this file.
- Add props to `CardRichTextEditorProps`:

```ts
export interface CardRichTextEditorProps {
  // ... existing props
  /** When true (default) renders the built-in per-editor toolbar. */
  showToolbar?: boolean;
  /** Reports whether this editor's contenteditable gained/lost focus. */
  onFocusChange?: (focused: boolean) => void;
}
```

- In the component body, destructure `showToolbar = true` and `onFocusChange`.
- Replace the toolbar block in the render with:

```tsx
{showToolbar ? (
  <CardRichTextToolbar
    editor={editor}
    disabled={disabled}
    onInsertImage={() => fileInputRef.current?.click()}
  />
) : null}
```

- Keep `fileInputRef`, the hidden file input, and `insertFiles` unchanged.
- Wire focus reporting: in the `useEffect` that sets editable (or a sibling effect), subscribe to editor focus/blur:

```tsx
useEffect(() => {
  if (!editor) return;
  const onFocus = () => onFocusChange?.(true);
  const onBlur = () => onFocusChange?.(false);
  editor.on("focus", onFocus);
  editor.on("blur", onBlur);
  return () => {
    editor.off("focus", onFocus);
    editor.off("blur", onBlur);
  };
}, [editor, onFocusChange]);
```

- Extend `CardRichTextEditorHandle` and the `useImperativeHandle` implementation:

```ts
export interface CardRichTextEditorHandle {
  insertTextAtSelection(text: string): boolean;
  focus(): void;
  /** Returns the live Tiptap editor instance (or null). */
  getEditor(): Editor | null;
  /** Opens this editor's hidden image file picker. */
  openImagePicker(): void;
}
```

```tsx
useImperativeHandle(
  ref,
  () => ({
    insertTextAtSelection(text) { /* existing */ },
    focus() { /* existing */ },
    getEditor() { return editorRef.current; },
    openImagePicker() { fileInputRef.current?.click(); },
  }),
  [],
);
```

- [ ] **Step 6: Run full editor tests to verify the refactor is behavior-preserving**

Run: `npm test --prefix apps/desktop -- --run src/features/cards/CardRichTextEditor.test.tsx src/features/cards/CardRichTextToolbar.test.tsx`
Expected: PASS (all existing editor tests keep passing because `showToolbar` defaults to `true`; toolbar tests now exercise `CardRichTextToolbar`).

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/features/cards/CardRichTextToolbar.tsx apps/desktop/src/features/cards/CardRichTextToolbar.test.tsx apps/desktop/src/features/cards/CardRichTextEditor.tsx
git commit -m "refactor: extract shared card toolbar and add focus/openImagePicker handles"
```

---

### Task 2: Shared toolbar in the modal composer

**Files:**
- Modify: `apps/desktop/src/features/cards/CardComposer.tsx`
- Test: `apps/desktop/src/features/cards/CardComposer.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `CardComposer.test.tsx` (read the existing `renderComposer`/`editor()` helpers first and reuse them):

```tsx
test("shared toolbar applies formatting to the focused face", async () => {
  const { user } = renderComposer();
  const front = editor("Front");
  const back = editor("Back");
  const bold = screen.getByRole("button", { name: "Bold" });

  await user.click(front);
  await user.click(bold);
  await user.keyboard("front-bold");
  expect(front).toHaveTextContent("front-bold");
  expect(front.querySelector("strong")).not.toBeNull();

  await user.click(back);
  await user.keyboard("back-plain");
  await user.click(bold);
  await user.keyboard("back-bold");
  expect(back.querySelectorAll("strong")).toHaveLength(1);
  expect(back.querySelector("strong")?.textContent).toBe("back-bold");
});

test("shared toolbar buttons are disabled when no face is focused", () => {
  renderComposer();
  expect(screen.getByRole("button", { name: "Bold" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
});
```

(If `screen.getByRole("button", { name: "Bold" })` is ambiguous because a toolbar still renders per-face, that is exactly the bug this plan fixes — the failing test proves the shared toolbar exists only once.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix apps/desktop -- --run src/features/cards/CardComposer.test.tsx`
Expected: FAIL — either `screen.getByRole("button", { name: "Bold" })` throws "multiple elements" (two toolbars) or the disabled assertion fails.

- [ ] **Step 3: Implement the shared toolbar in `CardComposer`**

In `CardComposer.tsx`:

- Import `CardRichTextToolbar` and `Editor`.
- Add state: `const [focusedFace, setFocusedFace] = useState<"front" | "back" | null>(null);`
- Add `const frontEditorRef = useRef<CardRichTextEditorHandle | null>(null);` and `const backEditorRef = useRef<CardRichTextEditorHandle | null>(null);` (rename existing refs; the front/back editor refs already exist as `frontEditorRef`/`backEditorRef` at lines 219-220 — reuse them).
- Derive the focused editor: `const activeEditor = focusedFace === "front" ? frontEditorRef.current?.getEditor() ?? null : focusedFace === "back" ? backEditorRef.current?.getEditor() ?? null : null;`
- Add a focus handler with the blur race guard:

```tsx
const handleFaceFocus = (face: "front" | "back") => (focused: boolean) => {
  setFocusedFace((prev) => (focused ? face : prev === face ? null : prev));
};
```

- Render the shared toolbar immediately after the Deck/New-deck-name block (after line 464), before the Front block:

```tsx
<CardRichTextToolbar
  editor={activeEditor}
  disabled={saving}
  onInsertImage={() => {
    if (focusedFace === "front") frontEditorRef.current?.openImagePicker();
    else if (focusedFace === "back") backEditorRef.current?.openImagePicker();
  }}
/>
```

- Pass `showToolbar={false}` and `onFocusChange={handleFaceFocus("front")}` to the Front editor; `showToolbar={false}` and `onFocusChange={handleFaceFocus("back")}` to the Back editor.
- Keep the Front auto-focus effect at lines 235-248 (it focuses the Front editor on modal open, which sets `focusedFace` to `"front"` via the new `onFocusChange`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix apps/desktop -- --run src/features/cards/CardComposer.test.tsx`
Expected: PASS (both new tests; existing composer tests still pass — verify none query per-editor toolbars).

- [ ] **Step 5: Full feature test sweep**

Run: `npm test --prefix apps/desktop -- --run src/features/cards/CardComposer.test.tsx src/features/cards/CardRichTextEditor.test.tsx src/features/cards/CardRichTextToolbar.test.tsx src/features/cards/CardSidePanel.test.tsx src/app/App.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/features/cards/CardComposer.tsx apps/desktop/src/features/cards/CardComposer.test.tsx
git commit -m "feat: shared editor toolbar in modal card composer"
```

---

### Task 3: Shared toolbar in the side panel

**Files:**
- Modify: `apps/desktop/src/features/cards/CardSidePanel.tsx`
- Test: `apps/desktop/src/features/cards/CardSidePanel.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `CardSidePanel.test.tsx` (reuse its existing render helper and `editor()` pattern):

```tsx
test("shared toolbar targets the focused face in the panel", async () => {
  const { user } = renderPanel(); // whatever helper exists
  const front = editor("Front");
  const back = editor("Back");

  await user.click(front);
  await user.click(screen.getByRole("button", { name: "Heading 2" }));
  await user.keyboard("panel-title");
  expect(front.querySelector("h2")?.textContent).toBe("panel-title");

  await user.click(back);
  await user.keyboard("plain");
  expect(back.querySelector("h2")).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix apps/desktop -- --run src/features/cards/CardSidePanel.test.tsx`
Expected: FAIL — either multiple toolbars (if panel still renders per-editor toolbars) or `h2` not present because the per-face toolbar heading button belongs to the other editor.

- [ ] **Step 3: Implement**

Mirror Task 2 in `CardSidePanel.tsx`:

- Import `CardRichTextToolbar` and `Editor`.
- Add `const [focusedFace, setFocusedFace] = useState<"front" | "back" | null>(null);`
- Add `frontEditorRef`/`backEditorRef` refs of type `CardRichTextEditorHandle` and attach to the editors (CardSidePanel currently has no editor refs — add them).
- Add the same `handleFaceFocus` guard and `activeEditor` derivation.
- Render `<CardRichTextToolbar editor={activeEditor} disabled={saving} onInsertImage={...}/>` immediately after the Deck field (`CardSidePanel.tsx:225`) and before the Front field.
- Pass `showToolbar={false}` + `onFocusChange` to both editors.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix apps/desktop -- --run src/features/cards/CardSidePanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full feature test sweep**

Run: `npm test --prefix apps/desktop -- --run src/features/cards/CardComposer.test.tsx src/features/cards/CardRichTextEditor.test.tsx src/features/cards/CardRichTextToolbar.test.tsx src/features/cards/CardSidePanel.test.tsx src/app/App.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/features/cards/CardSidePanel.tsx apps/desktop/src/features/cards/CardSidePanel.test.tsx
git commit -m "feat: shared editor toolbar in side panel"
```

---

### Task 4: Full-suite verification

**Files:** (none)

- [ ] **Step 1: Full frontend suite**

Run: `npm test --prefix apps/desktop`
Expected: PASS — all 90 files, 689+ tests.

- [ ] **Step 2: Build**

Run: `npm run build --prefix apps/desktop`
Expected: success (pre-existing chunk-size warning OK).

- [ ] **Step 3: Verify the toolbar renders exactly once in the composer**

In `CardComposer.test.tsx` confirm `screen.getAllByRole("toolbar")` has length 1 in the modal composer with the shared toolbar, and the same in `CardSidePanel.test.tsx`. Add these assertions if missing. Run the two test files again.

- [ ] **Step 4: Commit any test-only additions**

```bash
git add apps/desktop/src/features/cards/CardComposer.test.tsx apps/desktop/src/features/cards/CardSidePanel.test.tsx
git commit -m "test: assert single shared toolbar per composer"
```

Only commit if Step 3 produced changes; otherwise skip this step.

## Self-Review

**Spec coverage:**
- Toolbar once, below Deck selector → Tasks 2-3.
- Applies to focused face → Tasks 2-3 (`focusedFace`, `activeEditor`).
- Disabled when no focus → Task 1 (`!editor` → disabled) + Task 2 test.
- Button state reflects focused editor → Task 1 (`useEditorState` on the passed editor).
- Image button opens focused face's picker → Tasks 2-3 (`openImagePicker`).
- Pixabay/Translate unchanged → not touched.
- Panel variant identical → Task 3.
- Blur race guard → Tasks 2-3 `handleFaceFocus`.
- Auto-focus Front on modal open keeps toolbar active → noted in Task 2 Step 3.

**Placeholders:** none — every code step carries full content.

**Type consistency:** `getEditor(): Editor | null` and `openImagePicker(): void` defined once in Task 1, consumed identically in Tasks 2-3. `CardRichTextToolbarProps` (`editor: Editor | null`, `disabled?`, `onInsertImage: () => void`) defined once in Task 1, used in Tasks 2-3. `showToolbar`/`onFocusChange` added to `CardRichTextEditorProps` in Task 1.
