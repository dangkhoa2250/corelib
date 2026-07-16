# Shared Review Flashcard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Review Due and Practice All use one controlled two-face flashcard component so their flip animation cannot drift.

**Architecture:** A new `ReviewFlashcard` owns the accessible card shell, permanently mounted front/back faces, reveal interaction, and flipped class. `ReviewPage` keeps mode-specific content, state, ratings, navigation, and scheduling, passing renderable content into the shared component.

**Tech Stack:** React 19, TypeScript, Testing Library, Vitest, CSS 3D transforms.

---

### Task 1: Build the shared controlled flashcard

**Files:**
- Create: `apps/desktop/src/features/review/ReviewFlashcard.tsx`
- Create: `apps/desktop/src/features/review/ReviewFlashcard.test.tsx`

- [ ] **Step 1: Write the failing component tests**

Test a stateful harness that supplies front, back-front, and back content. Assert both faces exist before reveal, click adds `review-page__card--flipped`, repeated click does not retrigger reveal, and Enter/Space reveal the card.

```tsx
function Harness() {
  const [revealed, setRevealed] = useState(false);
  return (
    <ReviewFlashcard
      revealed={revealed}
      onReveal={() => setRevealed(true)}
      front={<span>Front content</span>}
      backFront={<span>Back-side front content</span>}
      back={<span>Back content</span>}
    />
  );
}
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd apps/desktop
npm test -- --run src/features/review/ReviewFlashcard.test.tsx
```

Expected: FAIL because `./ReviewFlashcard` does not exist.

- [ ] **Step 3: Implement the minimal controlled component**

Create a component with this public contract:

```tsx
interface ReviewFlashcardProps {
  revealed: boolean;
  onReveal: () => void;
  front: ReactNode;
  backFront: ReactNode;
  back: ReactNode;
}
```

Render one `section.review-page__card`, one inner container, and both face elements on every render. Call `onReveal` only when unrevealed and activated by click, Enter, or Space. Keep the existing class names so no CSS timing or transform changes are required.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the command from Step 2. Expected: all `ReviewFlashcard` tests pass.

- [ ] **Step 5: Commit the shared component**

```bash
git add apps/desktop/src/features/review/ReviewFlashcard.tsx apps/desktop/src/features/review/ReviewFlashcard.test.tsx
git commit -m "feat: share review flashcard animation"
```

### Task 2: Migrate Review Due and Practice All

**Files:**
- Modify: `apps/desktop/src/features/review/ReviewPage.tsx`
- Modify: `apps/desktop/src/features/review/ReviewPage.test.tsx`

- [ ] **Step 1: Write the failing integration test**

Add one test that renders each mode and asserts each Flashcard contains exactly one front face and one back face before click. It must also assert clicking Review Due applies the flipped class and reveals rating controls.

```tsx
expect(studyCard.querySelectorAll(".review-page__card-face--front")).toHaveLength(1);
expect(studyCard.querySelectorAll(".review-page__card-face--back")).toHaveLength(1);
```

- [ ] **Step 2: Run ReviewPage tests and verify RED**

Run:

```bash
cd apps/desktop
npm test -- --run src/features/review/ReviewPage.test.tsx
```

Expected: FAIL because Review Due currently mounts only its front face before reveal.

- [ ] **Step 3: Replace both duplicated card shells**

Import `ReviewFlashcard` and replace both mode-specific `section` trees:

```tsx
<ReviewFlashcard
  revealed={revealed}
  onReveal={() => setRevealed(true)}
  front={<div className="review-page__content">{card.front}</div>}
  backFront={(
    <div className="review-page__content review-page__content--small">
      {card.front}
    </div>
  )}
  back={<div className="review-page__content">{card.back}</div>}
/>
```

Use the same component in Practice All, passing its existing flex wrapper containing `ClickableFrontText` and `PronunciationButton` as `front` and `backFront`, and its existing `.review-page__content` back node as `back`. Do not change rating, navigation, language, YouGlish, queue, or scheduler code.

- [ ] **Step 4: Run focused component and ReviewPage tests**

Run:

```bash
cd apps/desktop
npm test -- --run src/features/review/ReviewFlashcard.test.tsx src/features/review/ReviewPage.test.tsx
```

Expected: both test files pass.

- [ ] **Step 5: Commit the migration**

```bash
git add apps/desktop/src/features/review/ReviewPage.tsx apps/desktop/src/features/review/ReviewPage.test.tsx
git commit -m "refactor: unify review card flip behavior"
```

### Task 3: Full verification

**Files:**
- Verify all files modified by Tasks 1–2.

- [ ] **Step 1: Run the complete frontend suite**

```bash
cd apps/desktop
npm test -- --run
```

Expected: all test files pass with zero failures.

- [ ] **Step 2: Run the production build**

```bash
cd apps/desktop
npm run build
```

Expected: TypeScript and Vite finish with exit code 0.

- [ ] **Step 3: Inspect the final diff**

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only the shared component, review integration, tests, and approved documentation are changed.
