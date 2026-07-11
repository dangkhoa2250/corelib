# Theme System Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace flat dark/light mode with semantic surface hierarchy (ChatGPT/Codex style).

**Architecture:** Single CSS file (`tokens.css`) defines all theme tokens. Components reference tokens via `var(--token-name)`. No hardcoded colors. No `filter: invert`.

**Tech Stack:** Plain CSS with custom properties, React components, CSS modules via tokens.css

---

### Task 1: Rewrite tokens.css with semantic theme tokens

**Files:**
- Modify: `apps/desktop/src/styles/tokens.css`

- [ ] **Step 1: Replace all CSS variables in `:root` with new light theme tokens**

Replace the existing `:root` block (lines 1-84) with the new semantic token system:

```css
:root {
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display",
    "Helvetica Neue", sans-serif;
  font-synthesis: none;
  text-rendering: optimizeLegibility;

  --window-bg: #f2f2f4;
  --sidebar-bg: rgba(238, 238, 241, 0.78);
  --main-bg: #ffffff;

  --viewer-canvas-bg: #d9d9dc;
  --toolbar-bg: rgba(248, 248, 250, 0.92);
  --panel-bg: #ffffff;

  --surface-1: #ffffff;
  --surface-2: #f5f5f7;
  --surface-3: #ececef;

  --interactive-hover: rgba(0, 0, 0, 0.055);
  --interactive-selected: rgba(0, 0, 0, 0.09);
  --interactive-pressed: rgba(0, 0, 0, 0.14);

  --border-subtle: rgba(0, 0, 0, 0.08);
  --border-strong: rgba(0, 0, 0, 0.16);

  --text-primary: #1d1d1f;
  --text-secondary: #6e6e73;
  --text-disabled: rgba(29, 29, 31, 0.35);

  --button-primary-bg: #171717;
  --button-primary-text: #ffffff;
  --button-secondary-bg: #ffffff;
  --button-secondary-text: #171717;
  --button-secondary-hover: #f0f0f2;

  --focus-ring: rgba(0, 0, 0, 0.35);

  --warning: #b85c00;
  --error: #c9362b;
  --success: #248a3d;
  --link: #3b6fb6;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.08);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.06);
  --shadow-lg: 0 10px 28px rgba(0, 0, 0, 0.05);
  --shadow-xl: 0 24px 80px rgba(0, 0, 0, 0.20);
  --shadow-card: 0 1px 2px rgba(0, 0, 0, 0.08);

  color: var(--text-primary);
  background: var(--window-bg);
}
```

- [ ] **Step 2: Replace `[data-theme="dark"]` block with new dark theme tokens**

```css
[data-theme="dark"] {
  --window-bg: #131315;
  --sidebar-bg: rgba(70, 68, 72, 0.72);
  --main-bg: #18181a;

  --viewer-canvas-bg: #38383b;
  --toolbar-bg: rgba(35, 35, 38, 0.94);
  --panel-bg: #202023;

  --surface-1: #252529;
  --surface-2: #2c2c31;
  --surface-3: #34343a;

  --interactive-hover: rgba(255, 255, 255, 0.07);
  --interactive-selected: rgba(255, 255, 255, 0.11);
  --interactive-pressed: rgba(255, 255, 255, 0.16);

  --border-subtle: rgba(255, 255, 255, 0.08);
  --border-strong: rgba(255, 255, 255, 0.16);

  --text-primary: #f5f5f7;
  --text-secondary: #a1a1a6;
  --text-disabled: rgba(245, 245, 247, 0.32);

  --button-primary-bg: #ffffff;
  --button-primary-text: #171717;
  --button-secondary-bg: #303034;
  --button-secondary-text: #f5f5f7;
  --button-secondary-hover: #3a3a40;

  --focus-ring: rgba(255, 255, 255, 0.35);

  --warning: #ff9f0a;
  --error: #ff453a;
  --success: #30d158;
  --link: #7ca8e8;

  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.28);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.38);
  --shadow-lg: 0 10px 28px rgba(0, 0, 0, 0.45);
  --shadow-xl: 0 24px 80px rgba(0, 0, 0, 0.60);
  --shadow-card: 0 1px 2px rgba(0, 0, 0, 0.28);
}
```

- [ ] **Step 3: Remove old color tokens from both blocks**

Remove: `--color-text-primary`, `--color-bg-primary`, `--color-accent`, `--color-surface-hover`, `--color-focus-ring`, all old `--color-*` vars. Replace them with the new semantic tokens above.

Keep only: reader-specific and card-status tokens (will migrate separately).

- [ ] **Step 4: Add focus-visible global rule**

```css
:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

button:focus-visible,
input:focus-visible,
textarea:focus-visible,
select:focus-visible,
[tabindex]:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
```

- [ ] **Step 5: Run tests to verify no regressions**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/styles/tokens.css
git commit -m "refactor(theme): replace flat color tokens with semantic surface hierarchy"
```

### Task 2: Update sidebar styling

**Files:**
- Modify: `apps/desktop/src/styles/tokens.css` (sidebar CSS rules)

- [ ] **Step 1: Find and replace all sidebar CSS classes to use new tokens**

In tokens.css, update `.app-sidebar` and `.settings-page__sidebar` to use `--sidebar-bg`, `--border-subtle`, `--interactive-hover`, `--interactive-selected`, `--interactive-pressed` tokens. Remove any `--color-accent` or blue references.

```css
.app-sidebar {
  background: var(--sidebar-bg);
  backdrop-filter: blur(24px) saturate(140%);
  -webkit-backdrop-filter: blur(24px) saturate(140%);
  border-right: 1px solid var(--border-subtle);
}
```

- [ ] **Step 2: Update sidebar items**

```css
.app-sidebar__item:hover {
  background: var(--interactive-hover);
}

.app-sidebar__item.is-active,
.app-sidebar__item[aria-current="page"] {
  background: var(--interactive-selected);
  color: var(--text-primary);
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/styles/tokens.css
git commit -m "refactor(theme): update sidebar to translucent glass surface with neutral interactions"
```

### Task 3: Update buttons (primary, secondary, icon)

**Files:**
- Modify: `apps/desktop/src/styles/tokens.css` (all `.btn`, `.button`, `.settings-page__*` button rules)

- [ ] **Step 1: Add global button reset and semantic button classes**

Find all button/`.btn` CSS rules and replace with neutral token-based styles. Remove any `--color-accent` / blue backgrounds.

- [ ] **Step 2: Run tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/styles/tokens.css
git commit -m "refactor(theme): update buttons to neutral semantic tokens, no blue"
```

### Task 4: Update inputs, textareas, selects

**Files:**
- Modify: `apps/desktop/src/styles/tokens.css`

- [ ] **Step 1: Replace all input/textarea/select CSS with token-based rules**

Replace browser-default and blue-focused styles with neutral tokens.

- [ ] **Step 2: Run tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/styles/tokens.css
git commit -m "refactor(theme): update inputs, textareas, selects to theme-aware neutral surfaces"
```

### Task 5: Update PDF viewer components

**Files:**
- Modify: `apps/desktop/src/styles/tokens.css` (reader CSS classes)
- Modify: `apps/desktop/src/features/reader/*.tsx` (any inline styles)

- [ ] **Step 1: Replace all reader/PDF CSS with token references**

Update `.pdf-viewer`, `.pdf-toolbar`, `.pdf-outline-sidebar`, `.pdf-page`, reader panels to use `--viewer-canvas-bg`, `--toolbar-bg`, `--panel-bg`, etc.

- [ ] **Step 2: Check for inline styles in reader components**

Search for `style={{` in reader components and replace with token references or CSS classes.

- [ ] **Step 3: Run tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/styles/tokens.css apps/desktop/src/features/reader/
git commit -m "refactor(theme): update PDF viewer with surface hierarchy, preserve white page"
```

### Task 6: Update panels, cards, modals, popovers

**Files:**
- Modify: `apps/desktop/src/styles/tokens.css`

- [ ] **Step 1: Replace surface/background tokens in all panel/card/modal CSS**

Update to `--panel-bg`, `--surface-1`, `--surface-2`, `--surface-3`, `--border-subtle`, `--border-strong`.

- [ ] **Step 2: Update card hover to use `--interactive-hover` instead of blue**

- [ ] **Step 3: Run tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/styles/tokens.css
git commit -m "refactor(theme): update panels, cards, modals, popovers to surface tokens"
```

### Task 7: Update settings page

**Files:**
- Modify: `apps/desktop/src/styles/tokens.css` (settings CSS)
- Modify: `apps/desktop/src/features/settings/SettingsPage.tsx` (any inline styles)

- [ ] **Step 1: Replace settings page CSS**

Update `.settings-page__*` classes to use new semantic tokens.

- [ ] **Step 2: Run tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/styles/tokens.css apps/desktop/src/features/settings/SettingsPage.tsx
git commit -m "refactor(theme): update settings page to semantic tokens"
```

### Task 8: Update Memora/Deck pages

**Files:**
- Modify: `apps/desktop/src/styles/tokens.css` (memora CSS)
- Modify: `apps/desktop/src/features/memora/*.tsx` (any inline styles)

- [ ] **Step 1: Update memora CSS classes**

- [ ] **Step 2: Run tests**

- [ ] **Step 3: Commit**

### Task 9: Update card browser, composer, side panel

**Files:**
- Modify: `apps/desktop/src/styles/tokens.css` (card browser CSS)
- Modify: `apps/desktop/src/features/cards/*.tsx` (inline styles)

- [ ] **Step 1: Update card CSS classes to use new tokens**

- [ ] **Step 2: Replace hardcoded inline colors in card components**

- [ ] **Step 3: Run tests**

- [ ] **Step 4: Commit**

### Task 10: Final review pass

- [ ] **Step 1: Search for remaining hardcoded color references**

Run: `rg --include '*.tsx' '#[0-9a-fA-F]' apps/desktop/src/ --glob '!node_modules'`
Check that remaining hardcoded colors are intentional (status badges, semantic colors).

- [ ] **Step 2: Search for remaining `--color-` variable references**

Run: `rg 'var\(--color-' apps/desktop/src/ --glob '!node_modules'` - should be few/none.

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit final cleanup**

```bash
git commit -m "refactor(theme): final cleanup of hardcoded colors and old tokens"
```
