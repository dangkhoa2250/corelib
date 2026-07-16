# Command Palette Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make both command surfaces available from Settings and deliver a neutral, Codex-inspired palette that works in light and dark themes without a white scrollbar gutter.

**Architecture:** Keep `CommandPalette.tsx` responsible for keyboard shortcuts, search requests, selection, execution, and focus restoration. Extract all shared visual rendering into `CommandPaletteView.tsx`, including neutral query-match fragments, grouped rows, keycaps, footer, and error state. Render the existing palette pair in the Settings branch and style the view exclusively through CSS custom properties.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, Playwright, CSS custom properties, Tauri/WKWebView.

---

## File structure

- Create: `apps/desktop/src/features/search/CommandPaletteView.tsx` — shared dialog presentation and neutral title-match primitive.
- Create: `apps/desktop/src/features/search/CommandPaletteView.test.tsx` — unit coverage for visual-only components.
- Modify: `apps/desktop/src/features/search/CommandPalette.tsx` — preserve controller behavior and delegate rendering to the view.
- Modify: `apps/desktop/src/features/search/CommandPalette.test.tsx` — cover selected result movement and execution through the controller.
- Modify: `apps/desktop/src/app/App.tsx` — render the existing palette pair in the Settings route.
- Modify: `apps/desktop/src/app/App.test.tsx` — assert both shortcut listeners remain present after Settings navigation.
- Modify: `apps/desktop/src/styles/tokens.css` — neutral palette tokens, Codex-inspired layout, explicit WebKit scrollbar rules.
- Modify: `apps/desktop/src/styles/tokens.test.ts` — enforce token-based palette scrollbar styling.
- Modify: `apps/desktop/tests/e2e/library.spec.ts` — open Settings then validate both command surfaces.

### Task 1: Create shared palette presentation primitives

**Files:**
- Create: `apps/desktop/src/features/search/CommandPaletteView.tsx`
- Create: `apps/desktop/src/features/search/CommandPaletteView.test.tsx`

- [ ] **Step 1: Write failing tests for neutral query matching and the shared footer**

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { CommandPaletteView, highlightMatch } from "./CommandPaletteView";

test("renders matched query characters without an accent color", () => {
  render(<>{highlightMatch("Appearance", "appe")}</>);

  expect(screen.getByText("Appe")).toHaveClass("command-palette__match");
  expect(screen.getByText("arance")).toBeInTheDocument();
});

test("renders shared keyboard guidance and a selected result", () => {
  render(
    <CommandPaletteView
      error={null}
      groups={[{ section: "Settings", results: [{ id: "appearance", title: "Appearance", breadcrumb: ["Settings", "General"], group: "Settings", aliases: [], surface: "quick-open", execute: vi.fn() }] }]}
      label="Quick Open"
      onClose={vi.fn()}
      onExecute={vi.fn()}
      onQueryChange={vi.fn()}
      onSelectNext={vi.fn()}
      onSelectPrevious={vi.fn()}
      query="appe"
      resultVerb="Open"
      selectedIndex={0}
    />,
  );

  expect(screen.getByRole("button", { name: "Open Appearance" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText("Enter")).toBeInTheDocument();
  expect(screen.getByText("Escape")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the new view tests to verify they fail**

Run: `npm test -- --run src/features/search/CommandPaletteView.test.tsx`

Expected: FAIL because `CommandPaletteView.tsx` does not exist.

- [ ] **Step 3: Implement the visual-only component and match primitive**

```tsx
export function highlightMatch(value: string, query: string) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return value;
  const characters = [...value];
  const matched = new Set<number>();
  for (const term of terms) {
    let cursor = 0;
    for (const [index, character] of characters.entries()) {
      if (character.toLocaleLowerCase() === term[cursor]) {
        matched.add(index);
        cursor += 1;
        if (cursor === term.length) break;
      }
    }
  }
  return characters.map((character, index) => matched.has(index)
    ? <mark className="command-palette__match" key={`${character}-${index}`}>{character}</mark>
    : <span key={`${character}-${index}`}>{character}</span>);
}
```

Implement `CommandPaletteView` with a `role="dialog"` section, a controlled `searchbox`, the provided grouped entries, row callbacks, an error alert, and footer keycaps. Keep the component free of global listeners, search requests, or route/action knowledge.

- [ ] **Step 4: Run the view tests to verify they pass**

Run: `npm test -- --run src/features/search/CommandPaletteView.test.tsx`

Expected: PASS with 2 tests.

- [ ] **Step 5: Commit the presentation primitives**

```bash
git add apps/desktop/src/features/search/CommandPaletteView.tsx apps/desktop/src/features/search/CommandPaletteView.test.tsx
git commit -m "feat: add shared command palette view"
```

### Task 2: Keep the controller behavior while using the shared view

**Files:**
- Modify: `apps/desktop/src/features/search/CommandPalette.tsx`
- Modify: `apps/desktop/src/features/search/CommandPalette.test.tsx`

- [ ] **Step 1: Add a failing controller test for keyboard selection**

```tsx
test("moves the neutral selection with ArrowDown before executing", async () => {
  const user = userEvent.setup();
  const first = vi.fn();
  const second = vi.fn();
  render(<CommandPalette mode="quick-open" search={vi.fn().mockResolvedValue([entry({ id: "first", title: "First", execute: first }), entry({ id: "second", title: "Second", execute: second })])} />);

  await user.keyboard("{Control>}k{/Control}");
  await user.keyboard("{ArrowDown}{Enter}");

  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run the controller test to record the expected failure**

Run: `npm test -- --run src/features/search/CommandPalette.test.tsx`

Expected: FAIL until `CommandPalette` passes its selected index and callbacks into the new view.

- [ ] **Step 3: Replace inline dialog JSX with the shared view**

```tsx
return isOpen ? (
  <CommandPaletteView
    error={error}
    groups={groups}
    label={label}
    onClose={close}
    onExecute={executeEntry}
    onQueryChange={(nextQuery) => {
      sequence.current += 1;
      setQuery(nextQuery);
      setSelectedIndex(0);
    }}
    onSelectNext={() => setSelectedIndex((index) => (index + 1) % Math.max(1, results.length))}
    onSelectPrevious={() => setSelectedIndex((index) => (index - 1 + Math.max(1, results.length)) % Math.max(1, results.length))}
    query={query}
    resultVerb={resultVerb(mode)}
    searchboxRef={searchboxRef}
    selectedIndex={selectedIndex}
  />
) : null;
```

Keep the controller's one-listener-per-mode shortcut effect, debounce sequence guard, focus restoration, and asynchronous close-on-success behavior. Move the dialog key handling into explicit view callbacks so the controller remains the only owner of selected index.

- [ ] **Step 4: Run the controller and view tests**

Run: `npm test -- --run src/features/search/CommandPalette.test.tsx src/features/search/CommandPaletteView.test.tsx`

Expected: PASS with shortcut, click, Escape, focus-restoration, match, footer, and ArrowDown coverage.

- [ ] **Step 5: Commit the controller/view integration**

```bash
git add apps/desktop/src/features/search/CommandPalette.tsx apps/desktop/src/features/search/CommandPalette.test.tsx
git commit -m "refactor: render command palettes through shared view"
```

### Task 3: Make Settings and native scrolling use the shared command surfaces

**Files:**
- Modify: `apps/desktop/src/app/App.tsx`
- Modify: `apps/desktop/src/app/App.test.tsx`
- Modify: `apps/desktop/src/styles/tokens.css`
- Modify: `apps/desktop/src/styles/tokens.test.ts`
- Modify: `apps/desktop/tests/e2e/library.spec.ts`

- [ ] **Step 1: Add failing route and style assertions**

```tsx
test("opens both command surfaces after navigating to Settings", async () => {
  const user = userEvent.setup();
  render(<App libraryApi={{ list: vi.fn().mockResolvedValue([]), pick: vi.fn(), importDocuments: vi.fn() }} />);

  await user.click(screen.getByRole("button", { name: "Settings" }));
  await user.keyboard("{Control>}k{/Control}");
  expect(await screen.findByRole("dialog", { name: "Quick Open" })).toBeInTheDocument();
  await user.keyboard("{Escape}");
  await user.keyboard("{Control>}{Shift>}k{/Shift}{/Control}");
  expect(await screen.findByRole("dialog", { name: "Command Palette" })).toBeInTheDocument();
});
```

```ts
expect(css).toContain(".command-palette__results::-webkit-scrollbar-track-piece {");
expect(css).toContain("background: var(--scrollbar-track);");
expect(css).toContain(".command-palette__results::-webkit-scrollbar-thumb {");
expect(css).toContain("background: var(--scrollbar-thumb);");
expect(css).not.toContain("#0e9df4");
```

- [ ] **Step 2: Run focused tests to verify they fail**

Run: `npm test -- --run src/app/App.test.tsx src/styles/tokens.test.ts`

Expected: FAIL because the Settings early return omits `{palette}` and the palette has no direct scrollbar selectors.

- [ ] **Step 3: Render the palette pair in Settings and add neutral theme styles**

```tsx
if (route.name === "settings") {
  return (
    <>
      <SettingsPage /* existing props unchanged */ initialSection={route.section} />
      {palette}
    </>
  );
}
```

Add palette-specific tokens based on `--surface-*`, `--text-*`, `--interactive-*`, and `--scrollbar-*`. Use direct `.command-palette__results::-webkit-scrollbar*` rules with a transparent track, a padding-clipped thumb, and no hard-coded color. Style selected rows through `--interactive-selected`, matched text through a neutral text token, and use the same variables under `[data-theme="dark"]`.

- [ ] **Step 4: Extend the browser test through Settings**

```ts
await page.getByRole("button", { name: "Settings" }).click();
await expect(page.getByRole("heading", { name: "Model" })).toBeVisible();
await page.keyboard.press("Control+K");
await expect(page.getByRole("dialog", { name: "Quick Open" })).toBeVisible();
await page.keyboard.press("Escape");
await page.keyboard.press("Control+Shift+K");
await expect(page.getByRole("dialog", { name: "Command Palette" })).toBeVisible();
```

- [ ] **Step 5: Run focused regression checks**

Run: `npm test -- --run src/app/App.test.tsx src/styles/tokens.test.ts`

Expected: PASS.

Run: `npm run test:e2e -- --grep "Quick Open and Command Palette"`

Expected: PASS after navigating into Settings.

- [ ] **Step 6: Commit route availability and style changes**

```bash
git add apps/desktop/src/app/App.tsx apps/desktop/src/app/App.test.tsx apps/desktop/src/styles/tokens.css apps/desktop/src/styles/tokens.test.ts apps/desktop/tests/e2e/library.spec.ts
git commit -m "fix: polish command palette across app routes"
```

### Task 4: Run final verification

**Files:**
- Verify all modified files above.

- [ ] **Step 1: Run complete frontend verification**

Run: `npm test && npm run test:e2e && npm run build`

Expected: Vitest reports zero failures, Playwright reports two passing tests, and TypeScript/Vite exits 0.

- [ ] **Step 2: Validate fresh desktop runtime only if launched from this checkout**

Run: `git rev-parse --short HEAD && git status --short && ps -axo pid,command | rg "tauri dev|vite|library_desktop"`

Expected: Record the exact revision and any existing processes before deciding whether to launch a fresh `tauri dev` or release build. Do not describe an older running app as verification.
