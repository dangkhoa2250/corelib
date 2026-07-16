# Command Palette Stability and Input Privacy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop command-palette result flashing, simplify its surface, and disable native text suggestions for all desktop-app text controls.

**Architecture:** `CommandPalette` keeps the last settled search result visible while its next search is pending and passes an explicit busy state to the shared view, which prevents stale execution. A root-mounted `InputPrivacyGuard` observes and normalizes editable DOM controls so all current and future app fields get the same WebKit/browser suggestion settings. Palette CSS remains entirely token-based.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, CSS custom properties, WKWebView/Tauri.

---

### Task 1: Root input privacy guard

**Files:**
- Create: `apps/desktop/src/components/InputPrivacyGuard.tsx`
- Create: `apps/desktop/src/components/InputPrivacyGuard.test.tsx`
- Modify: `apps/desktop/src/app/App.tsx`

- [ ] **Step 1: Write the failing input-guard tests**

```tsx
import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { InputPrivacyGuard } from "./InputPrivacyGuard";

test("normalizes existing, inserted, and focused editable controls", async () => {
  const { container } = render(<><InputPrivacyGuard /><input aria-label="existing" /></>);
  const existing = container.querySelector("input")!;
  const inserted = document.createElement("textarea");
  container.append(inserted);
  inserted.focus();

  for (const control of [existing, inserted]) {
    expect(control).toHaveAttribute("autocomplete", "off");
    expect(control).toHaveAttribute("autocorrect", "off");
    expect(control).toHaveAttribute("autocapitalize", "off");
    expect(control).toHaveAttribute("spellcheck", "false");
  }
});
```

- [ ] **Step 2: Run the focused test to prove it fails**

Run: `npm test -- --run src/components/InputPrivacyGuard.test.tsx`

Expected: FAIL because `InputPrivacyGuard` does not exist.

- [ ] **Step 3: Implement the guard and mount it once in the app**

```tsx
const EDITABLE_SELECTOR = "input, textarea, [contenteditable='true']";

function disableNativeSuggestions(element: Element) {
  if (!(element instanceof HTMLElement) || !element.matches(EDITABLE_SELECTOR)) return;
  element.setAttribute("autocomplete", "off");
  element.setAttribute("autocorrect", "off");
  element.setAttribute("autocapitalize", "off");
  element.setAttribute("spellcheck", "false");
}

export function InputPrivacyGuard() {
  useLayoutEffect(() => {
    document.querySelectorAll(EDITABLE_SELECTOR).forEach(disableNativeSuggestions);
    const observer = new MutationObserver((records) => {
      for (const record of records) record.addedNodes.forEach((node) => {
        if (node instanceof Element) {
          disableNativeSuggestions(node);
          node.querySelectorAll(EDITABLE_SELECTOR).forEach(disableNativeSuggestions);
        }
      });
    });
    document.addEventListener("focusin", (event) => disableNativeSuggestions(event.target as Element), true);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); document.removeEventListener("focusin", onFocus, true); };
  }, []);
  return null;
}
```

Define the named `onFocus` listener before registering it so cleanup removes the same function. Render `<InputPrivacyGuard />` at the top of `App`, before the Settings early return, so all routes are covered.

- [ ] **Step 4: Run the focused tests**

Run: `npm test -- --run src/components/InputPrivacyGuard.test.tsx src/app/App.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/InputPrivacyGuard.tsx apps/desktop/src/components/InputPrivacyGuard.test.tsx apps/desktop/src/app/App.tsx
git commit -m "feat: disable native text suggestions globally"
```

### Task 2: Stable pending palette search

**Files:**
- Modify: `apps/desktop/src/features/search/CommandPalette.tsx`
- Modify: `apps/desktop/src/features/search/CommandPaletteView.tsx`
- Modify: `apps/desktop/src/features/search/CommandPalette.test.tsx`
- Modify: `apps/desktop/src/features/search/CommandPaletteView.test.tsx`

- [ ] **Step 1: Replace the stale-results test with the desired failure case**

Change the test named `clears stale results while a newer query is still searching` so, after typing `new`, it asserts that `Open Stale` remains visible, the result list has `aria-busy="true"`, and Enter does not call `staleExecute`. Resolve the deferred search, then assert the latest entry replaces the stale entry and can execute.

- [ ] **Step 2: Run the focused controller test to prove it fails**

Run: `npm test -- --run src/features/search/CommandPalette.test.tsx`

Expected: FAIL because the controller clears `results` in `changeQuery` and the view has no busy state.

- [ ] **Step 3: Add explicit pending-search state and block stale execution**

```tsx
const [isSearchPending, setIsSearchPending] = useState(false);

const changeQuery = useCallback((nextQuery: string) => {
  sequence.current += 1;
  setQuery(nextQuery);
  setSelectedIndex(0);
  setError(null);
  setIsSearchPending(true);
}, []);

// In the current request's resolve and reject branches:
setIsSearchPending(false);

// In CommandPaletteView:
<ul aria-busy={isSearchPending} ...>
...
if (selected && !isSearchPending) onExecute(selected);
```

Pass `isSearchPending` through `CommandPaletteViewProps`; disable result buttons while it is true so mouse and keyboard use the same safety rule. Clear the pending state when closing. Keep the current sequence guard so an older async response cannot unset busy state or replace a newer result.

- [ ] **Step 4: Add a shared-view assertion for pending rows**

Render the view with `isSearchPending={true}` and assert the results list is `aria-busy="true"` and its result buttons are disabled. This verifies the view boundary separately from the controller.

- [ ] **Step 5: Run focused palette tests**

Run: `npm test -- --run src/features/search/CommandPalette.test.tsx src/features/search/CommandPaletteView.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/features/search/CommandPalette.tsx apps/desktop/src/features/search/CommandPaletteView.tsx apps/desktop/src/features/search/CommandPalette.test.tsx apps/desktop/src/features/search/CommandPaletteView.test.tsx
git commit -m "fix: keep command palette results stable while searching"
```

### Task 3: Simplify and theme-safe palette chrome

**Files:**
- Modify: `apps/desktop/src/styles/tokens.css`
- Modify: `apps/desktop/src/styles/tokens.test.ts`

- [ ] **Step 1: Update CSS contract tests first**

Change the palette-specific test to require `border-bottom: 0;` in `.command-palette__input`, reject the `.command-palette__results button::before` rule, and require `var(--surface-1)` for the palette scrollbar, track, track piece, and corner. Keep assertions that highlight and selection use neutral tokens and no hard-coded blue is present.

- [ ] **Step 2: Run the style test to prove it fails**

Run: `npm test -- --run src/styles/tokens.test.ts`

Expected: FAIL because the input divider and square pseudo-element remain and the palette scrollbar uses transparent track declarations.

- [ ] **Step 3: Update the palette CSS**

```css
.command-palette__input {
  border: 0;
}

.command-palette__results button {
  grid-template-columns: minmax(0, 1fr) auto;
}

.command-palette__results::-webkit-scrollbar,
.command-palette__results::-webkit-scrollbar-track,
.command-palette__results::-webkit-scrollbar-track-piece,
.command-palette__results::-webkit-scrollbar-corner {
  background: var(--surface-1);
}
```

Delete the decorative `button::before` rule. Preserve the existing themed thumb, selected row, matches, and responsive geometry.

- [ ] **Step 4: Run the focused style test**

Run: `npm test -- --run src/styles/tokens.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/styles/tokens.css apps/desktop/src/styles/tokens.test.ts
git commit -m "style: simplify command palette chrome"
```

### Task 4: Final verification

**Files:**
- Verify only; no source changes expected.

- [ ] **Step 1: Run the complete unit suite serially**

Run: `npm test -- --maxWorkers=1`

Expected: all test files and tests pass.

- [ ] **Step 2: Build the desktop frontend**

Run: `npm run build`

Expected: TypeScript and Vite build exit with code 0.

- [ ] **Step 3: Run browser E2E coverage**

Run: `npm run test:e2e`

Expected: all Playwright tests pass.

- [ ] **Step 4: Inspect the final worktree**

Run: `git status --short && git diff --check`

Expected: clean worktree and no whitespace errors.
