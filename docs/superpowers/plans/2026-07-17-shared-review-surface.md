# Shared Review Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Review Due and Practice All render active cards through the same constrained, scroll-safe surface without changing scheduling or timer behavior.

**Architecture:** Add a focused `ReviewSessionSurface` component that owns the active-card layout and rich card controls while accepting mode-specific header and footer slots. `StudyReviewPage` and `PracticeReviewPage` keep their existing state machines, timers, and rating handlers but delegate active-card rendering to this component.

**Tech Stack:** React 19, TypeScript, Testing Library, Vitest, Corelib `ScrollArea`, Tauri/WKWebView CSS.

---

### Task 1: Lock the shared surface contract with a failing integration test

**Files:**
- Modify: `apps/desktop/src/features/review/ReviewPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Add a helper that returns the active surface and a test that renders each mode independently:

```tsx
function activeSurface() {
  return screen.getByTestId("review-session-surface");
}

test("study and practice use the same active review surface", () => {
  const { unmount } = render(
    <ReviewPage
      mode="study"
      session={studySession}
      onRate={vi.fn()}
      onRefresh={vi.fn()}
    />,
  );

  expect(activeSurface()).toHaveClass("review-page__body");
  expect(activeSurface().closest(".review-page__split")).not.toBeNull();
  expect(screen.getAllByRole("button", { name: "Play pronunciation" })).toHaveLength(2);
  expect(screen.getAllByRole("button", { name: "Source unavailable" })).toHaveLength(2);

  unmount();
  render(<ReviewPage mode="practice" cards={[card]} />);

  expect(activeSurface()).toHaveClass("review-page__body");
  expect(activeSurface().closest(".review-page__split")).not.toBeNull();
  expect(screen.getAllByRole("button", { name: "Play pronunciation" })).toHaveLength(2);
  expect(screen.getAllByRole("button", { name: "Source unavailable" })).toHaveLength(2);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
cd apps/desktop
npm test -- src/features/review/ReviewPage.test.tsx
```

Expected: FAIL because Study has no `review-session-surface`, pronunciation buttons, or source buttons.

### Task 2: Extract the shared active-card surface

**Files:**
- Create: `apps/desktop/src/features/review/ReviewSessionSurface.tsx`
- Modify: `apps/desktop/src/features/review/ReviewPage.tsx`
- Test: `apps/desktop/src/features/review/ReviewPage.test.tsx`

- [ ] **Step 1: Create the component interface and shared layout**

Create `ReviewSessionSurface.tsx` with this public interface:

```tsx
interface ReviewSessionSurfaceProps {
  card: LearningCard;
  revealed: boolean;
  onReveal: () => void;
  header: ReactNode;
  footer: ReactNode;
  getDocumentFileUrl?: (id: string) => Promise<string>;
  onError: (message: string) => void;
}
```

The component must render the established hierarchy and keep the required scroll inset class:

```tsx
<main className="review-page" aria-labelledby="review-title">
  <div className={`review-page__split${sourceView ? " review-page__split--with-source" : ""}`}>
    <ScrollArea
      className={`review-page__body${showYouGlish && selectedWord ? " review-page__body--with-video" : ""}`}
      data-testid="review-session-surface"
    >
      {header}
      <ReviewFlashcard
        revealed={revealed}
        onReveal={onReveal}
        front={sharedFrontContent}
        backFront={sharedBackFrontContent}
        back={<div className="review-page__content">{card.back}</div>}
      />
      {languagePicker}
      {footer}
      {youGlishPanel}
    </ScrollArea>
    {sourceView && getDocumentFileUrl ? (
      <SourceViewer
        source={sourceView}
        getDocumentFileUrl={getDocumentFileUrl}
        onClose={() => setSourceView(null)}
      />
    ) : null}
  </div>
</main>
```

Move the existing Practice implementations of `SourceButton`, selected-word state, YouGlish state, source-view state, language update, language picker, pronunciation controls, and rich front/back content into this component. On language update failure call `onError("Failed to update card language.")`.

- [ ] **Step 2: Replace Study's direct layout**

Destructure `getDocumentFileUrl` in `StudyReviewPage` and replace its active-card `<main>` block with:

```tsx
<ReviewSessionSurface
  card={card}
  revealed={revealed}
  onReveal={() => setRevealed(true)}
  getDocumentFileUrl={getDocumentFileUrl}
  onError={setError}
  header={studyHeader}
  footer={studyFooter}
/>
```

Keep `handleRateCard`, interval-label rendering, `saving`, stale-grant handling, timer display, and `onRefresh` unchanged.

- [ ] **Step 3: Replace Practice's duplicated layout**

Replace Practice's active-card `<main>` block with the same component:

```tsx
<ReviewSessionSurface
  card={card}
  revealed={revealed}
  onReveal={() => setRevealed(true)}
  getDocumentFileUrl={getDocumentFileUrl}
  onError={setError}
  header={practiceHeader}
  footer={practiceFooter}
/>
```

Keep Practice progress/navigation, local rating counts, completion summary, per-card visible timer, and schedule-independent rating behavior unchanged.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```bash
cd apps/desktop
npm test -- src/features/review/ReviewPage.test.tsx src/features/review/ReviewFlashcard.test.tsx src/styles/tokens.test.ts
```

Expected: all focused tests PASS, including the new surface contract and existing timer/interval/source/scroll assertions.

- [ ] **Step 5: Commit the implementation**

```bash
git add apps/desktop/src/features/review/ReviewSessionSurface.tsx \
  apps/desktop/src/features/review/ReviewPage.tsx \
  apps/desktop/src/features/review/ReviewPage.test.tsx
git commit -m "fix: share active review surface"
```

### Task 3: Verify the regression and integration boundaries

**Files:**
- Verify: `apps/desktop/src/features/review/ReviewPage.tsx`
- Verify: `apps/desktop/src/features/review/ReviewSessionSurface.tsx`
- Verify: `apps/desktop/src/styles/tokens.css`

- [ ] **Step 1: Run the complete frontend suite**

```bash
cd apps/desktop
npm test
```

Expected: all frontend tests PASS with zero failures.

- [ ] **Step 2: Run the production frontend build**

```bash
cd apps/desktop
npm run build
```

Expected: TypeScript and Vite build complete with exit code 0.

- [ ] **Step 3: Check the final diff**

```bash
git diff --check
git status --short
```

Expected: no whitespace errors and only the planned review files are changed before commit, or a clean worktree after the implementation commit.

- [ ] **Step 4: Perform fresh desktop verification when available**

From the current checkout, stop any older `tauri dev` process, record `git rev-parse --short HEAD`, and run:

```bash
cd apps/desktop
ACCOUNT_API_BASE_URL=http://127.0.0.1:8090 npm run tauri dev
```

Verify Review Due and Practice All use the same card width, height, spacing, flip, pronunciation controls, YouGlish controls, source controls, and scrollbar inset. If a fresh runtime is not launched, report that limitation explicitly.
