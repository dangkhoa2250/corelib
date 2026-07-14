# Memora Deck Browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Memora deck rows and the deck Card Browser with compact, deck-scoped study actions that work in light and dark themes.

**Architecture:** Create shared token-driven `Button` and `ActionMenu` primitives. Compose them in Memora and CardBrowser, keeping existing deck/card APIs and moving deck actions into CardBrowser header slots.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, CSS custom properties.

---

### Task 1: Shared themed action controls

**Files:**
- Create: `apps/desktop/src/components/Button.tsx`
- Create: `apps/desktop/src/components/Button.test.tsx`
- Create: `apps/desktop/src/components/ActionMenu.tsx`
- Create: `apps/desktop/src/components/ActionMenu.test.tsx`
- Modify: `apps/desktop/src/styles/tokens.css`

- [ ] **Step 1: Write the failing tests.**

```tsx
it("renders a semantic secondary button", () => {
  render(<Button variant="secondary">Practice All</Button>);
  expect(screen.getByRole("button", { name: "Practice All" })).toHaveClass("ui-button--secondary");
});
it("runs an action then closes its menu", async () => {
  const onSelect = vi.fn();
  render(<ActionMenu label="Study" items={[{ label: "Review Due", onSelect }]} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Study" }));
  await user.click(screen.getByRole("menuitem", { name: "Review Due" }));
  expect(onSelect).toHaveBeenCalledOnce();
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Confirm red.** Run `npm test -- src/components/Button.test.tsx src/components/ActionMenu.test.tsx`; expect module-resolution failures for the two new components.

- [ ] **Step 3: Implement minimal, reusable controls.**

```tsx
export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return <button {...props} className={["ui-button", `ui-button--${variant}`, className].filter(Boolean).join(" ")} />;
}
export function ActionMenu({ label, items, disabled = false }: ActionMenuProps) {
  // controlled open state; trigger has aria-haspopup/menu + aria-expanded
  // each role="menuitem" calls onSelect then closes the menu
}
```

The menu trigger stops click propagation for use inside clickable deck rows. Menu items support disabled state and use `role="menuitem"`.

- [ ] **Step 4: Add token-only styles.**

```css
.ui-button--primary { color: var(--button-primary-text); background: var(--button-primary-bg); }
.ui-button--secondary { color: var(--button-secondary-text); background: var(--button-secondary-bg); border-color: var(--border-subtle); }
.action-menu__popover { background: var(--panel-bg); border-color: var(--border-strong); box-shadow: var(--shadow-md); }
```

No light-only literal colors; any new variable must be defined for both `:root` and `[data-theme="dark"]`.

- [ ] **Step 5: Confirm green.** Run `npm test -- src/components/Button.test.tsx src/components/ActionMenu.test.tsx`; expect PASS.

- [ ] **Step 6: Commit.** Run `git add apps/desktop/src/components/Button* apps/desktop/src/components/ActionMenu* apps/desktop/src/styles/tokens.css && git commit -m "feat: add reusable themed action controls"`.

### Task 2: Compact Memora deck rows

**Files:**
- Modify: `apps/desktop/src/features/memora/MemoraPage.tsx`
- Create: `apps/desktop/src/features/memora/MemoraPage.test.tsx`
- Modify: `apps/desktop/src/app/App.tsx`
- Modify: `apps/desktop/src/styles/tokens.css`

- [ ] **Step 1: Write failing behavior tests.**

```tsx
it("opens a deck only when its row is clicked", async () => {
  renderMemora();
  await userEvent.setup().click(await screen.findByRole("button", { name: "English" }));
  expect(onOpenDeck).toHaveBeenCalledWith(expect.objectContaining({ id: "english" }));
});
it("keeps Study actions scoped to its deck", async () => {
  renderMemora();
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Study English" }));
  await user.click(screen.getByRole("menuitem", { name: "Review Due" }));
  expect(onStudyDeck).toHaveBeenCalledWith("english");
  expect(onOpenDeck).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Confirm red.** Run `npm test -- src/features/memora/MemoraPage.test.tsx`; expect missing Study action/callback failure.

- [ ] **Step 3: Add callbacks and compose the shared controls.** Extend `MemoraPageProps` with `onStudyDeck` and `onPracticeAll`; pass `handleStudyDeck` and `handlePracticeAll` in `App.tsx`. Each row renders name/description, New/Learning/Due cells, `ActionMenu` with Review Due and Practice All, and existing rename/delete overflow. The page header retains `New Deck` and uses `Review ${dueCount} Due` calling the existing global `onReviewToday`.

```tsx
<ActionMenu label={`Study ${deck.name}`} triggerLabel="Study" items={[
  { label: "Review Due", disabled: !stats?.dueCards, onSelect: () => onStudyDeck(deck.id) },
  { label: "Practice All", disabled: !stats?.totalCards, onSelect: () => onPracticeAll(deck.id) },
]} />
```

- [ ] **Step 4: Implement compact responsive styles.**

```css
.memora-deck-list__item { min-height: 76px; border: 1px solid var(--border-subtle); border-radius: 14px; background: var(--surface-1); }
.memora-deck-list__statistics { display: grid; grid-template-columns: repeat(3, minmax(54px, 1fr)); }
.memora-deck-list__stat--new { color: var(--color-new-text); }
@media (max-width: 760px) { .memora-deck-list__statistics { display: none; } }
```

- [ ] **Step 5: Confirm green.** Run `npm test -- src/features/memora/MemoraPage.test.tsx src/app/App.test.tsx`; expect PASS.

- [ ] **Step 6: Commit.** Run `git add apps/desktop/src/features/memora/MemoraPage.tsx apps/desktop/src/features/memora/MemoraPage.test.tsx apps/desktop/src/app/App.tsx apps/desktop/src/styles/tokens.css && git commit -m "feat: redesign Memora deck rows"`.

### Task 3: Deck Card Browser header

**Files:**
- Modify: `apps/desktop/src/features/cards/CardBrowser.tsx`
- Modify: `apps/desktop/src/features/cards/CardBrowser.test.tsx`
- Modify: `apps/desktop/src/features/memora/DeckDetailPage.tsx`
- Create: `apps/desktop/src/features/memora/DeckDetailPage.test.tsx`
- Modify: `apps/desktop/src/styles/tokens.css`

- [ ] **Step 1: Write failing header tests.**

```tsx
it("renders deck title and injected actions", () => {
  render(<CardBrowser headerTitle="English Card Browser" headerActions={<button>Review Due</button>} {...props} />);
  expect(screen.getByRole("heading", { name: "English Card Browser" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Review Due" })).toBeInTheDocument();
});
it("does not render duplicate deck statistics", () => {
  renderDeckDetail();
  expect(screen.queryByText(/New:/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Learning:/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Due:/)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Confirm red.** Run `npm test -- src/features/cards/CardBrowser.test.tsx src/features/memora/DeckDetailPage.test.tsx`; expect unsupported header properties and duplicate statistic test failure.

- [ ] **Step 3: Add composable header slots.** Add optional `headerTitle?: string` and `headerActions?: ReactNode` to `CardBrowserProps`; default title remains `Card Browser`. Place actions before the shared Add Card control in `card-browser__header-actions`.

- [ ] **Step 4: Replace DeckDetailPage summary UI.** Keep its statistic request only for button disabled states; remove the stats badges. Pass `headerTitle={`${deck.name} Card Browser`}` and actions with tokenized shared buttons:

```tsx
<Button variant="secondary" disabled={!stats?.dueCards} onClick={() => onStudyDeck(deck.id)}>Review Due</Button>
<Button variant="secondary" disabled={!stats?.totalCards} onClick={() => onPracticeAll(deck.id)}>Practice All</Button>
```

- [ ] **Step 5: Add header styles and remove unused summary styles.** `card-browser__header-actions` is a flex group using token borders/surfaces. Delete `.deck-detail-page__stats*`, `.deck-detail-page__study-btn`, and `.deck-detail-page__practice-btn` CSS after confirming no references remain.

- [ ] **Step 6: Confirm green.** Run `npm test -- src/features/cards/CardBrowser.test.tsx src/features/memora/DeckDetailPage.test.tsx src/app/App.test.tsx`; expect PASS.

- [ ] **Step 7: Commit.** Run `git add apps/desktop/src/features/cards/CardBrowser.tsx apps/desktop/src/features/cards/CardBrowser.test.tsx apps/desktop/src/features/memora/DeckDetailPage.tsx apps/desktop/src/features/memora/DeckDetailPage.test.tsx apps/desktop/src/styles/tokens.css && git commit -m "feat: add deck actions to card browser"`.

### Task 4: Full verification and theme audit

**Files:** Modify only files from Tasks 1–3 if a check exposes a defect.

- [ ] **Step 1: Run all frontend tests.** Run `npm test`; expect zero failures.
- [ ] **Step 2: Run the production build.** Run `npm run build`; expect exit code 0.
- [ ] **Step 3: Audit for non-token colors.** Run `rg -n "(#[0-9a-fA-F]{3,8}|rgb\\()" src/features/memora src/features/cards/CardBrowser.tsx src/components/Button.tsx src/components/ActionMenu.tsx`; expect no new literal colors in these component files.
- [ ] **Step 4: Commit only corrections found by verification.** Run `git add apps/desktop/src && git commit -m "fix: align Memora controls across themes"` if and only if the audit required changes.
