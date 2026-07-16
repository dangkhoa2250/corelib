# Review Timers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore a per-card timer to Review Due and reset the visible Practice All timer for every card without persisting practice timing.

**Architecture:** A focused `useElapsedTime(startedAt)` hook owns the ticking display clock. Review Due keeps its existing per-card start time for backend `elapsedMs`; Practice All uses a separate per-card start time for display and a session start time for its completion summary.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library fake timers.

---

### Task 1: Shared per-card review timers

**Files:**
- Create: `apps/desktop/src/features/review/useElapsedTime.ts`
- Modify: `apps/desktop/src/features/review/ReviewPage.tsx`
- Modify: `apps/desktop/src/features/review/ReviewPage.test.tsx`

- [ ] **Step 1: Write failing ReviewPage timer tests**

Use `vi.useFakeTimers()` with a fixed system time. Assert Review Due initially renders `0s`, advances to `2s`, and resets to `0s` when its session changes. Render two Practice cards, advance to `2s`, rate the first card locally, and assert the second card displays `0s`.

```tsx
vi.useFakeTimers();
vi.setSystemTime(new Date("2026-07-17T00:00:00.000Z"));
const { rerender } = render(
  <ReviewPage mode="study" session={studySession} onRate={vi.fn()} onRefresh={vi.fn()} />,
);
expect(screen.getByText("0s")).toHaveClass("review-page__elapsed");
act(() => vi.advanceTimersByTime(2_000));
expect(screen.getByText("2s")).toBeInTheDocument();
rerender(
  <ReviewPage
    mode="study"
    session={{ ...studySession, sessionId: "session-2" }}
    onRate={vi.fn()}
    onRefresh={vi.fn()}
  />,
);
expect(screen.getByText("0s")).toBeInTheDocument();
```

- [ ] **Step 2: Run the focused test and verify RED**

```bash
cd apps/desktop
npm test -- --run src/features/review/ReviewPage.test.tsx
```

Expected: FAIL because Review Due has no elapsed element and Practice keeps its session-wide visible timer.

- [ ] **Step 3: Implement the shared hook**

Create:

```ts
export function useElapsedTime(startedAt: number): number {
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  return Math.max(0, now - startedAt);
}
```

- [ ] **Step 4: Wire both modes**

In Review Due, call `useElapsedTime(startedAt)` and render the existing elapsed paragraph above ratings:

```tsx
<p className="review-page__elapsed" aria-live="polite">
  {formatTime(Math.floor(elapsed / 1000))}
</p>
```

In Practice All, replace the single timer start with `practiceStartedAt` plus `cardStartedAt`. Reset `cardStartedAt` when `card?.id` changes, use it with the hook for the visible timer, and compute completion summary duration as `Date.now() - practiceStartedAt`.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the command from Step 2. Expected: all ReviewPage tests pass.

- [ ] **Step 6: Run full verification**

```bash
cd apps/desktop
npm test -- --run
npm run build
cd ../..
git diff --check
```

Expected: all tests and the build pass; no whitespace errors.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/features/review/useElapsedTime.ts apps/desktop/src/features/review/ReviewPage.tsx apps/desktop/src/features/review/ReviewPage.test.tsx
git commit -m "fix: restore per-card review timers"
```
