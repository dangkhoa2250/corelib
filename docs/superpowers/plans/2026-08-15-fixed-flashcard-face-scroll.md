# Fixed Flashcard Face Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the Front and Back content viewports in the desktop flashcard side panel fixed at 140px and scroll long content inside each editor.

**Architecture:** Give the panel `CardComposer` a dedicated root class, then scope a 140px viewport rule to its existing rich-editor `ScrollArea`. The shared custom `ScrollArea` continues to provide the only scrollbar, while its existing 20px right inset protects content from the WKWebView overlay thumb.

**Tech Stack:** React 19, TypeScript, CSS, Vitest, Testing Library, Tauri/WKWebView.

## Global Constraints

- Keep Deck selection, both toolbars, and Save/Cancel outside the scrollable face-content viewports.
- Set the panel face-content viewport to exactly `140px`.
- Use the shared `ScrollArea`; do not add `overflow-y: auto` or WebKit scrollbar-track styling.
- Preserve a thumb-side content inset of at least `20px`.
- Do not change the modal composer's existing flex layout.
- Do not commit unless the user explicitly requests it.

---

### Task 1: Bound Panel Face Editors and Protect the Scroll Strategy

**Files:**
- Modify: `apps/desktop/src/features/cards/CardComposer.tsx:854-868`
- Modify: `apps/desktop/src/features/cards/CardRichTextEditor.css:235-255`
- Modify: `apps/desktop/src/features/cards/MediaPicker.test.tsx:131-156`

**Interfaces:**
- Consumes: `CardComposer`'s `variant="panel"` branch and `CardRichTextEditor`'s `.card-rich-text-editor__scroll-area` class.
- Produces: `.card-composer--panel` selector that fixes a panel face's content viewport at `140px` while retaining `ScrollArea`'s custom thumb.

- [ ] **Step 1: Write the failing regression test**

  In `MediaPicker.test.tsx`, read `CardRichTextEditor.css` beside the existing
  `CardComposer.tsx` source read. Add a test that proves the panel exposes the
  panel class and the CSS limits its existing scroll viewport:

  ```ts
  test("keeps panel Front and Back content at a fixed 140px ScrollArea viewport", () => {
    const composer = normalizeNewlines(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "CardComposer.tsx"), "utf8"));
    const editorCss = normalizeNewlines(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "CardRichTextEditor.css"), "utf8"));

    expect(composer).toContain('className="card-composer--panel"');
    expect(editorCss).toMatch(
      /\.card-composer--panel\s+\.card-rich-text-editor__scroll-area\s*\{[\s\S]*?flex:\s*0 0 140px;[\s\S]*?height:\s*140px;/,
    );
    expect(editorCss).toContain(".card-rich-text-editor__scroll-content");
    expect(composer).not.toMatch(/overflowY:\s*["'](auto|scroll)["']/);
  });
  ```

- [ ] **Step 2: Run the test to verify it fails for the intended reason**

  Run:

  ```bash
  npm test -- src/features/cards/MediaPicker.test.tsx
  ```

  Expected: FAIL because the panel section has no `card-composer--panel` class
  and no panel-specific 140px scroll-area rule exists.

- [ ] **Step 3: Implement the minimal panel-specific layout rule**

  Add `className="card-composer--panel"` to the `<section>` in the
  `variant === "panel"` branch of `CardComposer.tsx`. In
  `CardRichTextEditor.css`, add this rule directly after the base
  `.card-rich-text-editor__scroll-area` rule:

  ```css
  .card-composer--panel .card-rich-text-editor__scroll-area {
    flex: 0 0 140px;
    height: 140px;
  }
  ```

  Do not change `.card-rich-text-editor__scroll-content`; its component passes
  `paddingRight: "20px"` to the shared `ScrollArea`, which remains the required
  thumb-side inset.

- [ ] **Step 4: Run the focused tests to verify they pass**

  Run:

  ```bash
  npm test -- src/features/cards/MediaPicker.test.tsx src/features/cards/CardRichTextEditor.test.tsx src/features/cards/CardComposer.test.tsx
  ```

  Expected: PASS. The new source-level regression test proves the panel's fixed
  viewport; the editor test continues to prove the `ScrollArea` and 20px inset.

- [ ] **Step 5: Run static desktop verification**

  Run:

  ```bash
  npm run build
  ```

  Expected: PASS with TypeScript and Vite completing without errors.

- [ ] **Step 6: Fresh macOS runtime verification**

  Record `git rev-parse --short HEAD` and `git status --short`; identify and
  stop any existing `tauri dev`, `vite`, or `library_desktop` processes. Start
  `npm run tauri dev` from `apps/desktop` for this checkout. In both light and
  dark themes, create a flashcard from a long reader selection and verify:

  1. Front and Back content viewports are 140px high.
  2. Long translated text scrolls inside Back without clipping.
  3. The custom thumb shows no white native track and text is clear of it.
  4. Deck, toolbars, and Save/Cancel do not scroll with the face content.

### Task 2: Prevent an Empty Panel Editor from Showing a Thumb

**Files:**
- Modify: `apps/desktop/src/features/cards/CardRichTextEditor.css:241-262`
- Modify: `apps/desktop/src/features/cards/MediaPicker.test.tsx:157-168`

**Interfaces:**
- Consumes: the panel's fixed `140px` scroll viewport; the scroll-content's
  fixed vertical padding of `10px + 26px`; the shared `ScrollArea` condition
  that only renders a thumb when content height exceeds viewport height.
- Produces: a panel-only empty-editor minimum content height of `104px`, so an
  empty face exactly fits `104px + 36px = 140px` and does not display a thumb.

- [ ] **Step 1: Write the failing regression assertion**

  Extend the fixed-viewport test in `MediaPicker.test.tsx` with an assertion
  that requires the panel-specific Tiptap rule:

  ```ts
  expect(editorCss).toMatch(
    /\.card-composer--panel\s+\.card-rich-text-editor\s+\.tiptap\s*\{[\s\S]*?min-height:\s*104px;/,
  );
  ```

- [ ] **Step 2: Run the focused test to verify it fails**

  Run:

  ```bash
  npm test -- src/features/cards/MediaPicker.test.tsx
  ```

  Expected: FAIL because no panel-specific `.tiptap` minimum height rule exists.

- [ ] **Step 3: Implement the minimal panel-only content-height rule**

  Add this selector after the panel scroll-area rule in
  `CardRichTextEditor.css`:

  ```css
  .card-composer--panel .card-rich-text-editor .tiptap {
    min-height: 104px;
  }
  ```

  This preserves the 140px outer viewport and its 36px top/bottom content
  padding while preventing an empty document's existing 120px minimum height
  from creating artificial overflow. Do not alter the shared `ScrollArea`, the
  20px right inset, or modal-only layout rules.

- [ ] **Step 4: Run focused verification**

  Run:

  ```bash
  npm test -- src/features/cards/MediaPicker.test.tsx src/features/cards/CardRichTextEditor.test.tsx src/features/cards/CardComposer.test.tsx
  npm run build
  ```

  Expected: all focused tests and the TypeScript/Vite build pass.

- [ ] **Step 5: Fresh desktop behavior check**

  With a freshly restarted `tauri dev` from this worktree, confirm in both
  themes that an empty Front or Back field has no thumb, while a translation
  taller than 140px shows the custom thumb and scrolls internally.

### Task 3: Make Panel Editor Content Exactly Fill Its Viewport

**Files:**
- Modify: `apps/desktop/src/features/cards/CardRichTextEditor.css:241-274`
- Modify: `apps/desktop/src/features/cards/MediaPicker.test.tsx:157-173`

**Interfaces:**
- Consumes: the 140px panel `ScrollArea` viewport, whose thumb appears only
  when `scrollHeight` is greater than `clientHeight`.
- Produces: a panel-only editor-content box with `height: 100%` and
  `min-height: 0`, so WKWebView cannot treat default editor sizing or wrapper
  padding as empty-content overflow. Descendant text remains visible outside
  its fixed block and therefore contributes genuine overflow only when long.

- [ ] **Step 1: Write the failing regression assertions**

  Extend the panel fixed-viewport test to require these two panel-only rules:

  ```ts
  expect(editorCss).toMatch(
    /\.card-composer--panel\s+\.card-rich-text-editor__scroll-content\s*\{[\s\S]*?height:\s*100%;[\s\S]*?min-height:\s*0;/,
  );
  expect(editorCss).toMatch(
    /\.card-composer--panel\s+\.card-rich-text-editor\s+\.tiptap\s*\{[\s\S]*?height:\s*100%;[\s\S]*?min-height:\s*0;/,
  );
  ```

- [ ] **Step 2: Run the focused test to verify it fails**

  Run:

  ```bash
  npm test -- src/features/cards/MediaPicker.test.tsx
  ```

  Expected: FAIL because panel-specific exact-fill rules do not yet exist.

- [ ] **Step 3: Replace the panel's minimum-height workaround with exact-fill rules**

  Replace the panel-specific `104px` Tiptap minimum-height rule with:

  ```css
  .card-composer--panel .card-rich-text-editor__scroll-content {
    height: 100%;
    min-height: 0;
  }

  .card-composer--panel .card-rich-text-editor .tiptap {
    height: 100%;
    min-height: 0;
  }
  ```

  Do not change the 140px panel `ScrollArea`, the 20px inline right inset, the
  shared `ScrollArea`, or modal rules.

- [ ] **Step 4: Run automated verification**

  Run:

  ```bash
  npm test -- src/features/cards/MediaPicker.test.tsx src/features/cards/CardRichTextEditor.test.tsx src/features/cards/CardComposer.test.tsx src/components/ScrollArea.test.tsx
  npm run build
  ```

  Expected: all listed tests and the TypeScript/Vite build pass.

- [ ] **Step 5: Restart and inspect the current-worktree desktop app**

  Stop the existing worktree `tauri dev`, `vite`, and debug `library_desktop`
  processes without touching `/Applications/Corelib.app`. Restart `npm run
  tauri dev` from `apps/desktop`, then verify in both themes that one-line
  Front/Back content shows no thumb while a translation taller than 140px
  displays the custom thumb and scrolls internally.

### Task 4: Recompute the Custom Thumb When Editor Text Changes

**Files:**
- Modify: `apps/desktop/src/components/ScrollArea.tsx:142-161`
- Modify: `apps/desktop/src/components/ScrollArea.test.tsx:20-37`
- Modify: `apps/desktop/src/features/cards/CardRichTextEditor.css:249-271`
- Modify: `apps/desktop/src/features/cards/MediaPicker.test.tsx:157-180`

**Interfaces:**
- Consumes: `ScrollArea`'s `MutationObserver` and `updateMetrics` callback;
  editor text changes occur in nested Tiptap text nodes rather than as direct
  children of the `ScrollArea`.
- Produces: an up-to-date custom thumb: text that grows beyond the 140px panel
  viewport reveals it without a wheel event, and deleting content hides it
  without a wheel event.

- [ ] **Step 1: Write the failing behavioral test**

  In `ScrollArea.test.tsx`, add a test that renders a `ScrollArea` with a
  nested text node. Define `clientHeight` as 200 and make `scrollHeight` return
  200 for `"short"` text and 1000 for `"long"` text. After initializing the
  area with a `scroll` event, rerender from `"short"` to `"long"` and assert
  the vertical thumb becomes `display: block` without dispatching another
  scroll event; rerender back to `"short"` and assert it becomes
  `display: none`.

- [ ] **Step 2: Run the test to verify it fails**

  Run:

  ```bash
  npm test -- src/components/ScrollArea.test.tsx
  ```

  Expected: FAIL because the observer only listens for direct child-list
  changes, not nested text (`characterData`) changes.

- [ ] **Step 3: Implement the minimal observer fix and remove failed CSS workarounds**

  Change `mutationObserver.observe(element, { childList: true })` to observe
  `{ childList: true, subtree: true, characterData: true }`. Keep metrics
  updates coalesced through the existing animation-frame scheduler.

  Remove the panel-only exact-fill rules for `.card-rich-text-editor__scroll-content`
  and `.tiptap`, and remove their source assertions. They were a failed
  workaround for stale metrics; preserve only the panel's fixed 140px
  `ScrollArea` rule.

- [ ] **Step 4: Run automated verification**

  Run:

  ```bash
  npm test -- src/components/ScrollArea.test.tsx src/features/cards/MediaPicker.test.tsx src/features/cards/CardRichTextEditor.test.tsx src/features/cards/CardComposer.test.tsx
  npm run build
  ```

  Expected: all listed tests and the TypeScript/Vite build pass.

- [ ] **Step 5: Restart and manually verify the current-worktree app**

  Restart only the worktree's `tauri dev`, Vite, and debug app processes. In
  Front and Back, verify a short value has no thumb, typing/pasting long text
  shows the thumb without scrolling first, and deleting back to short hides it
  immediately. Verify long text still scrolls internally and retains its 20px
  right content inset in both themes.

### Task 5: Fit Empty Panel Content to the 140px Viewport

**Files:**
- Modify: `apps/desktop/src/features/cards/CardRichTextEditor.css:249-263`
- Modify: `apps/desktop/src/features/cards/MediaPicker.test.tsx:158-168`

**Interfaces:**
- Consumes: the panel's fixed 140px `ScrollArea` viewport and the base
  `.tiptap { min-height: 120px }` rule. Headless measurement confirmed the base
  empty editor measures `120px + 36px padding = 156px`, overflowing the 140px
  viewport by 16px and always showing a thumb.
- Produces: a panel-only `.tiptap { min-height: 104px }` override so empty
  content measures exactly `104px + 36px = 140px`; long content still grows and
  drives overflow. The earlier `height: 100%` approach is rejected because it
  lost ~34px of scrollable content.

- [ ] **Step 1: Write the failing regression assertion**

  In `MediaPicker.test.tsx`, add to the fixed-viewport test:

  ```ts
  expect(editorCss).toMatch(
    /\.card-composer--panel\s+\.card-rich-text-editor\s+\.tiptap\s*\{[\s\S]*?min-height:\s*104px;/,
  );
  ```

- [ ] **Step 2: Run the focused test to verify it fails**

  Run:

  ```bash
  npm test -- src/features/cards/MediaPicker.test.tsx
  ```

  Expected: FAIL because the panel `.tiptap` minimum-height override is absent.

- [ ] **Step 3: Implement the minimal panel-only rule**

  Add directly after the panel scroll-area rule:

  ```css
  .card-composer--panel .card-rich-text-editor .tiptap {
    min-height: 104px;
  }
  ```

  This keeps the 140px outer viewport and its 36px top/bottom padding while
  removing the empty document's artificial 16px overflow. Long text still grows
  the editor and reveals the custom thumb.

- [ ] **Step 4: Run automated verification**

  Run:

  ```bash
  npm test -- src/components/ScrollArea.test.tsx src/features/cards/MediaPicker.test.tsx src/features/cards/CardRichTextEditor.test.tsx src/features/cards/CardComposer.test.tsx
  npm run build
  ```

  Expected: all listed tests and the TypeScript/Vite build pass.

- [ ] **Step 5: Restart and manually verify the current-worktree app**

  Restart only the worktree's `tauri dev`, Vite, and debug app processes. In
  both themes verify: short Front/Back content shows no thumb; pasting long
  text shows the thumb immediately; deleting back to short hides it immediately;
  long text scrolls internally with its 20px right inset.
