# Flashcard Composer Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify flashcard creation by hiding tag editing, rendering image search as an image-only grid, and replacing the dense formatting toolbar with compact grouped menus.

**Architecture:** Keep tag persistence and image metadata contracts intact while changing only the composer-facing presentation and save inputs. Refactor `CardRichTextToolbar` around one reusable compact menu primitive, backed by the existing Tiptap state and Tabler icons; keep the image grid inside the existing parent `ScrollArea`.

**Tech Stack:** React 19, TypeScript, Tiptap, Tabler Icons React, Vitest, Testing Library, Tauri/WKWebView CSS tokens.

---

## File structure

- Modify `apps/desktop/src/features/cards/CardComposer.tsx`: remove tag UI/state and save new modal cards with `tags: []`.
- Modify `apps/desktop/src/features/cards/CardComposer.test.tsx`: cover hidden tags and empty tag save payload.
- Modify `apps/desktop/src/features/cards/CardSidePanel.tsx`: hide tag editing, save empty tags for new cards, preserve tags for edited cards.
- Modify `apps/desktop/src/features/cards/CardSidePanel.test.tsx`: cover new/edit tag semantics.
- Modify `apps/desktop/src/app/App.test.tsx`: update integration expectations that currently type into the composer Tags field.
- Modify `apps/desktop/src/features/cards/MediaPicker.tsx`: render image-only result buttons while retaining typed result metadata for staging.
- Modify `apps/desktop/src/features/cards/MediaPicker.test.tsx`: assert no visible provider/attribution/license UI and preserve search/staging/scroll behavior.
- Modify `apps/desktop/src/styles/tokens.css`: remove obsolete result-copy styles and make the image-only grid tiles equal-sized.
- Create `apps/desktop/src/features/cards/CompactToolbarMenu.tsx`: own one menu’s trigger, dismissal, focus restoration, and keyboard navigation.
- Create `apps/desktop/src/features/cards/CompactToolbarMenu.test.tsx`: focused accessibility and interaction coverage for the menu primitive.
- Modify `apps/desktop/src/features/cards/CardRichTextToolbar.tsx`: compose four compact menus and direct actions from current editor state.
- Modify `apps/desktop/src/features/cards/CardRichTextToolbar.test.tsx`: cover commands, grouping, Tabler icons, close-after-select behavior, and `Clear` text.
- Modify `apps/desktop/src/features/cards/CardRichTextEditor.css`: compact connected-button and menu styling using theme tokens.

### Task 1: Hide tags without deleting stored tags

**Files:**
- Modify: `apps/desktop/src/features/cards/CardComposer.test.tsx`
- Modify: `apps/desktop/src/features/cards/CardSidePanel.test.tsx`
- Modify: `apps/desktop/src/app/App.test.tsx`
- Modify: `apps/desktop/src/features/cards/CardComposer.tsx`
- Modify: `apps/desktop/src/features/cards/CardSidePanel.tsx`

- [ ] **Step 1: Write failing composer tests**

Replace the tag-entry expectation in `CardComposer.test.tsx` with explicit absence and an empty payload:

```tsx
test("hides tags and saves an empty tag list", async () => {
  const { onSave, user } = renderComposer();
  expect(screen.queryByRole("textbox", { name: "Tags" })).not.toBeInTheDocument();

  await user.click(editor("Back"));
  await user.keyboard("A set with vector operations.");
  await user.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  expect(onSave.mock.calls[0][0].tags).toEqual([]);
});
```

Keep the existing deck/source/rich-document assertions, but change their expected `tags` to `[]` and remove every attempt to find or type into the Tags textbox.

- [ ] **Step 2: Write failing side-panel tests**

Add both mode cases to `CardSidePanel.test.tsx`:

```tsx
test("hides tags and creates a new card with no tags", async () => {
  const newCard = baseCard({ id: "", front: "", back: "", tags: ["legacy"] });
  const { user } = renderPanel(newCard);
  expect(screen.queryByRole("textbox", { name: "Tags" })).not.toBeInTheDocument();
  await user.click(editor("Front"));
  await user.keyboard("Question");
  await user.click(editor("Back"));
  await user.keyboard("Answer");
  await user.click(screen.getByRole("button", { name: "Add Card" }));
  await waitFor(() => expect(createCard).toHaveBeenCalledTimes(1));
  expect(vi.mocked(createCard).mock.calls[0][0].tags).toEqual([]);
});

test("hides tags and preserves existing tags when editing", async () => {
  const { user } = renderPanel(baseCard({ tags: ["energy", "biology"] }));
  expect(screen.queryByRole("textbox", { name: "Tags" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Save Changes" }));
  await waitFor(() => expect(updateAndMoveCard).toHaveBeenCalledTimes(1));
  expect(vi.mocked(updateAndMoveCard).mock.calls[0][0].tags).toEqual(["energy", "biology"]);
});
```

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
cd apps/desktop
npm test -- --run src/features/cards/CardComposer.test.tsx src/features/cards/CardSidePanel.test.tsx src/app/App.test.tsx
```

Expected: FAIL because Tags inputs still render and the composer still parses entered tags.

- [ ] **Step 4: Implement minimal tag behavior**

In `CardComposer.tsx`:

- Delete `tagsFromInput`.
- Delete `const [tags, setTags] = useState("")`.
- Delete the Tags `<label>` and `<input>`.
- Send `tags: []` from `handleSave`.

In `CardSidePanel.tsx`:

- Delete tag state, tag hydration, tag dirty comparison, parsing, and the Tags field.
- Use the existing `card` mode directly:

```ts
const tagsForSave = card.id ? [...card.tags] : [];
```

- Pass `tags: tagsForSave` to both update and create payloads.

In `App.test.tsx`, remove Tags textbox interactions from composer integration tests and expect `tags: []` for newly composed cards.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the Step 3 command.

Expected: all selected test files pass with no Tags textbox rendered.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/features/cards/CardComposer.tsx \
  apps/desktop/src/features/cards/CardComposer.test.tsx \
  apps/desktop/src/features/cards/CardSidePanel.tsx \
  apps/desktop/src/features/cards/CardSidePanel.test.tsx \
  apps/desktop/src/app/App.test.tsx
git commit -m "feat: simplify flashcard tags"
```

### Task 2: Render an image-only result grid

**Files:**
- Modify: `apps/desktop/src/features/cards/MediaPicker.test.tsx`
- Modify: `apps/desktop/src/features/cards/MediaPicker.tsx`
- Modify: `apps/desktop/src/styles/tokens.css`

- [ ] **Step 1: Write failing image-only tests**

Replace the attribution-focused picker test with:

```tsx
test("renders an accessible image-only result grid", async () => {
  const { container, onSearch } = renderPicker();
  await waitFor(() => expect(onSearch).toHaveBeenCalledWith("algebra", 1));
  const result = await screen.findByRole("button", { name: "Fox" });
  expect(result.querySelector("img")).toHaveAttribute("alt", "Fox");
  expect(result).not.toHaveTextContent("Wikimedia");
  expect(result).not.toHaveTextContent("Jane Doe");
  expect(result).not.toHaveTextContent("CC BY");
  expect(container.querySelector(".media-picker__result-copy")).not.toBeInTheDocument();
});
```

Update the 15-result test to count result buttons/data attributes rather than provider badges:

```tsx
await waitFor(() => expect(container.querySelectorAll("[data-media-result]")).toHaveLength(15));
expect(screen.queryByText("Wikimedia")).not.toBeInTheDocument();
expect(screen.queryByText("DuckDuckGo")).not.toBeInTheDocument();
expect(screen.queryByText("Openverse")).not.toBeInTheDocument();
```

Update the source-contract assertion to require no `media-picker__provider`, `media-picker__attribution`, or `media-picker__result-copy` markup.

- [ ] **Step 2: Run picker tests and verify RED**

Run:

```bash
cd apps/desktop
npm test -- --run src/features/cards/MediaPicker.test.tsx
```

Expected: FAIL because provider and attribution copy are still rendered and the accessible label includes the provider.

- [ ] **Step 3: Implement the image-only tile**

In `MediaPicker.tsx`, keep `providerName` only for provider warnings; change result rendering to:

```tsx
<button
  aria-label={result.title || "Image result"}
  className="media-picker__result-button"
  disabled={stagingId === key}
  onClick={() => void stage(result)}
  type="button"
>
  <RemoteImagePreview
    url={result.previewUrl}
    fallbackUrl={result.imageUrl}
    alt={result.title}
  />
</button>
```

Delete visible provider/attribution/license markup. Preserve `result` unchanged when passing it to `stage`, so attribution persistence is unaffected.

In `tokens.css`:

- Remove `.media-picker__result-copy`, `.media-picker__provider`, and `.media-picker__attribution` rules.
- Keep equal-sized `3 / 2` previews.
- Reduce result tile padding to a small border/frame and preserve `min-width: 0`.
- Keep stage errors below their owning tile and `overflow-wrap: anywhere`.

- [ ] **Step 4: Run picker tests and verify GREEN**

Run the Step 2 command.

Expected: all picker tests pass; the scroll-surface assertion still confirms no nested overflow and the parent 20px inset.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/cards/MediaPicker.tsx \
  apps/desktop/src/features/cards/MediaPicker.test.tsx \
  apps/desktop/src/styles/tokens.css
git commit -m "feat: show image-only media results"
```

### Task 3: Build the accessible compact menu primitive

**Files:**
- Create: `apps/desktop/src/features/cards/CompactToolbarMenu.tsx`
- Create: `apps/desktop/src/features/cards/CompactToolbarMenu.test.tsx`
- Modify: `apps/desktop/src/features/cards/CardRichTextEditor.css`

- [ ] **Step 1: Write failing primitive tests**

Create `CompactToolbarMenu.test.tsx` with a harness containing two items:

```tsx
test("opens from an icon trigger and closes after selection", async () => {
  const user = userEvent.setup();
  const select = vi.fn();
  render(
    <CompactToolbarMenu
      label="Text formatting"
      icon={<span>A</span>}
      items={[
        { label: "Bold", active: false, disabled: false, onSelect: select },
        { label: "Italic", active: false, disabled: false, onSelect: vi.fn() },
      ]}
    />,
  );
  const trigger = screen.getByRole("button", { name: "Text formatting" });
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  await user.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  await user.click(screen.getByRole("menuitemcheckbox", { name: "Bold" }));
  expect(select).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});
```

Add tests for:

- opening one menu closes another;
- outside pointer/click closes;
- Escape closes and restores trigger focus;
- ArrowDown/ArrowUp move focus through enabled menu items;
- Enter/Space select the focused item;
- active items expose `aria-checked="true"`;
- a disabled trigger cannot open.

- [ ] **Step 2: Run primitive tests and verify RED**

Run:

```bash
cd apps/desktop
npm test -- --run src/features/cards/CompactToolbarMenu.test.tsx
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement `CompactToolbarMenu`**

Define the interface:

```ts
export interface CompactToolbarMenuItem {
  label: string;
  icon?: ReactNode;
  active: boolean;
  disabled?: boolean;
  role?: "menuitemcheckbox" | "menuitemradio";
  onSelect(): void;
}

export interface CompactToolbarMenuProps {
  label: string;
  icon: ReactNode;
  active?: boolean;
  disabled?: boolean;
  items: CompactToolbarMenuItem[];
  layout?: "vertical" | "horizontal";
}
```

Implement these exact behaviors:

- Local `open` state; opening dispatches a document-level custom event such as `corelib-toolbar-menu-open` carrying a per-instance id so peer menus close.
- Trigger uses `aria-haspopup="menu"`, `aria-expanded`, `title`, and the shared compact toolbar button class.
- Menu is positioned absolutely beneath its trigger inside a `position: relative` root.
- A document `pointerdown` listener closes when the target is outside the root.
- Escape closes and calls `triggerRef.current?.focus()`.
- Arrow keys cycle through enabled item refs.
- Item click calls `onSelect()` and closes immediately.
- Radio items use `menuitemradio`; multi-mark items use `menuitemcheckbox`.
- `onMouseDown` prevents editor focus loss for buttons, matching current toolbar behavior.

- [ ] **Step 4: Add compact menu styling**

In `CardRichTextEditor.css`, add theme-token-based rules:

```css
.card-rich-text-editor__toolbar-menu-root { position: relative; display: inline-flex; }
.card-rich-text-editor__toolbar-menu {
  position: absolute;
  z-index: 30;
  top: calc(100% + 3px);
  left: 0;
  display: grid;
  min-width: max-content;
  padding: 2px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--surface-2);
  box-shadow: var(--shadow-md);
}
.card-rich-text-editor__toolbar-menu--horizontal { grid-auto-flow: column; }
.card-rich-text-editor__toolbar-menu-item {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 23px;
  padding: 0 6px;
  border: 0;
  border-radius: 4px;
  color: var(--text-primary);
  background: transparent;
  font-size: 11px;
  white-space: nowrap;
}
```

Use `var(--interactive-hover)` and `var(--interactive-selected)` for hover/active states. Do not add `overflow`, a native scrollbar, or hard-coded light colors.

- [ ] **Step 5: Run primitive tests and verify GREEN**

Run the Step 2 command.

Expected: all compact menu tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/features/cards/CompactToolbarMenu.tsx \
  apps/desktop/src/features/cards/CompactToolbarMenu.test.tsx \
  apps/desktop/src/features/cards/CardRichTextEditor.css
git commit -m "feat: add compact toolbar menu"
```

### Task 4: Recompose the toolbar with compact grouped controls

**Files:**
- Modify: `apps/desktop/src/features/cards/CardRichTextToolbar.test.tsx`
- Modify: `apps/desktop/src/features/cards/CardRichTextToolbar.tsx`
- Modify: `apps/desktop/src/features/cards/CardRichTextEditor.css`

- [ ] **Step 1: Expand the toolbar test harness**

Configure the test editor with the same extensions needed by the production toolbar (`StarterKit`, `TextStyle`, `Color`, `Highlight`, and `TextAlign`) so every command exists. Add tests that assert:

```tsx
expect(screen.getByRole("button", { name: "Text formatting" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "Paragraph style" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "Lists" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "Alignment" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "Insert image" }).querySelector("svg")).not.toBeNull();
expect(screen.getByRole("button", { name: "Clear formatting" })).toHaveTextContent("Clear");
expect(screen.queryByRole("button", { name: "Bold" })).not.toBeInTheDocument();
```

Open each trigger and verify its item labels and commands. For alignment, assert each menu item contains the corresponding icon class/test title and that selecting Align right produces `textAlign: "right"` in editor JSON/HTML. For lists, assert Bullet list and Numbered list use distinct SVGs and commands.

- [ ] **Step 2: Run toolbar tests and verify RED**

Run:

```bash
cd apps/desktop
npm test -- --run src/features/cards/CardRichTextToolbar.test.tsx
```

Expected: FAIL because formatting, heading, list, and alignment are still direct buttons and Image is text.

- [ ] **Step 3: Import the approved Tabler icons**

Use:

```tsx
import {
  IconAlignCenter,
  IconAlignJustified,
  IconAlignLeft,
  IconAlignRight,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconList,
  IconListNumbers,
  IconPhoto,
  IconPilcrow,
  IconTypography,
} from "@tabler/icons-react";
```

Render icons at `size={14}` or `15` and `stroke={1.5}`. Use `IconList` for visible bullet dots and `IconListNumbers` for numbered rows. Use the four dedicated alignment icons; do not use Unicode approximations.

- [ ] **Step 4: Replace direct formatting controls with four menus**

Compose `CompactToolbarMenu` instances:

```tsx
<CompactToolbarMenu
  label="Text formatting"
  icon={<IconTypography size={14} stroke={1.5} />}
  active={toolbar.bold || toolbar.italic || toolbar.underline || toolbar.strike}
  disabled={isDisabled}
  items={[
    { label: "Bold", active: toolbar.bold, role: "menuitemcheckbox", onSelect: () => editor?.chain().focus().toggleBold().run() },
    { label: "Italic", active: toolbar.italic, role: "menuitemcheckbox", onSelect: () => editor?.chain().focus().toggleItalic().run() },
    { label: "Underline", active: toolbar.underline, role: "menuitemcheckbox", onSelect: () => editor?.chain().focus().toggleUnderline().run() },
    { label: "Strikethrough", active: toolbar.strike, role: "menuitemcheckbox", onSelect: () => editor?.chain().focus().toggleStrike().run() },
  ]}
/>
```

Build Paragraph style with `menuitemradio` items and `IconPilcrow`; Lists with `IconList`/`IconListNumbers`; Alignment with horizontal layout and the four alignment icons. Selecting every item closes its menu through the primitive.

- [ ] **Step 5: Replace remaining glyphs and retain direct actions**

- Undo: `IconArrowBackUp`.
- Redo: `IconArrowForwardUp`.
- Image: `IconPhoto`, accessible label/title `Insert image`.
- Clear: visible text `Clear`, accessible label/title `Clear formatting`.
- Color inputs remain native and keep the current mousedown exception.

- [ ] **Step 6: Compact the connected toolbar CSS**

Update `CardRichTextEditor.css`:

```css
.card-rich-text-editor__toolbar {
  gap: 0;
  padding: 3px;
}
.card-rich-text-editor__toolbar-button {
  min-width: 23px;
  height: 23px;
  padding: 0 4px;
  border-radius: 4px;
  font-size: 11px;
}
.card-rich-text-editor__toolbar-button--icon { width: 23px; padding: 0; }
.card-rich-text-editor__toolbar-separator {
  height: 14px;
  margin: 0 2px;
}
.card-rich-text-editor__color-control {
  width: 23px;
  height: 23px;
  padding: 2px;
  border-radius: 4px;
}
```

Keep focus rings visible and theme-token based. Ensure menu roots do not introduce gaps between adjacent triggers.

- [ ] **Step 7: Run toolbar and editor tests and verify GREEN**

Run:

```bash
cd apps/desktop
npm test -- --run src/features/cards/CardRichTextToolbar.test.tsx src/features/cards/CompactToolbarMenu.test.tsx src/features/cards/CardRichTextEditor.test.tsx
```

Expected: all tests pass, including native color input behavior and image picker invocation.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/features/cards/CardRichTextToolbar.tsx \
  apps/desktop/src/features/cards/CardRichTextToolbar.test.tsx \
  apps/desktop/src/features/cards/CardRichTextEditor.css
git commit -m "feat: compact flashcard formatting toolbar"
```

### Task 5: Integration and desktop verification

**Files:**
- Modify only if a failing test exposes an in-scope integration defect.

- [ ] **Step 1: Run focused frontend verification**

```bash
cd apps/desktop
npm test -- --run \
  src/features/cards/CardComposer.test.tsx \
  src/features/cards/CardSidePanel.test.tsx \
  src/features/cards/MediaPicker.test.tsx \
  src/features/cards/RemoteImagePreview.test.tsx \
  src/features/cards/CompactToolbarMenu.test.tsx \
  src/features/cards/CardRichTextToolbar.test.tsx \
  src/features/cards/CardRichTextEditor.test.tsx \
  src/app/App.test.tsx
```

Expected: all selected tests pass with zero failures.

- [ ] **Step 2: Run the production frontend build**

```bash
cd apps/desktop
npm run build
```

Expected: TypeScript and Vite complete successfully. The existing large-chunk advisory is acceptable; new errors are not.

- [ ] **Step 3: Verify diff hygiene and exact revision**

```bash
git diff --check
git rev-parse --short HEAD
git status --short
ps -axo pid=,command= | rg 'tauri dev|vite|library_desktop'
```

Expected: no whitespace errors. Record the revision and distinguish pre-existing worktree changes from this feature’s files.

- [ ] **Step 4: Restart the desktop runtime from this checkout**

Stop only the Tauri/Vite/library processes whose command paths point into this worktree, then run:

```bash
cd apps/desktop
npm run tauri dev
```

Expected: Vite starts on the configured development port, Rust compiles, and `target/debug/library_desktop` launches from this worktree.

- [ ] **Step 5: Manually verify WKWebView behavior**

When authenticated runtime access is available, check:

- modal and panel contain no Tags field;
- image search shows only equal-sized images;
- long results scroll through the parent `ScrollArea` with no white native track and no content beneath the thumb;
- all four toolbar menus are compact, connected, and keyboard-operable;
- bullet/numbered and four alignment icons are visually distinct;
- Image uses `IconPhoto`, while the final button visibly reads `Clear`;
- both light and dark themes use tokens and retain visible focus states.

If login blocks the composer, report runtime launch as verified but state plainly that post-login UI verification was not performed.

- [ ] **Step 6: Final feature commit if verification required adjustments**

Only when Step 1–5 produced an in-scope correction:

```bash
git status --short
git add apps/desktop/src/features/cards/CardComposer.tsx \
  apps/desktop/src/features/cards/CardSidePanel.tsx \
  apps/desktop/src/features/cards/MediaPicker.tsx \
  apps/desktop/src/features/cards/CompactToolbarMenu.tsx \
  apps/desktop/src/features/cards/CardRichTextToolbar.tsx \
  apps/desktop/src/features/cards/CardRichTextEditor.css \
  apps/desktop/src/styles/tokens.css
git commit -m "fix: finalize simplified flashcard composer"
```

Remove every unchanged path from the `git add` command before running it, and do not stage unrelated dirty-worktree files.
