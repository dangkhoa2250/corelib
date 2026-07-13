# PDF.js Reader Render Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a rapid 300% → 50% → 300% zoom settle on a sharp final PDF raster without concurrent full-page render pressure.

**Architecture:** A small reader-local queue serializes PDF.js page raster jobs. `PdfPage` creates its temporary canvas only when its queued job starts; cleanup cancels a running PDF.js task or removes an obsolete queued job. The visible canvas changes only when the current job succeeds.

**Tech Stack:** React 19, TypeScript, PDF.js, Vitest, Testing Library.

---

### Task 1: Add and verify the render queue

**Files:**
- Create: `apps/desktop/src/features/reader/pageRenderQueue.ts`
- Create: `apps/desktop/src/features/reader/pageRenderQueue.test.ts`

- [x] **Step 1: Write the failing tests**

```ts
const queue = createPageRenderQueue({ concurrency: 1 });
const first = queue.run(() => new Promise<void>((resolve) => firstRelease = resolve), { priority: 0 });
const second = queue.run(() => Promise.resolve(secondRan = true), { priority: 0 });
await flush();
expect(secondRan).toBe(false);
queue.supersede(second.id);
await expect(second.promise).rejects.toMatchObject({ code: "SUPERSEDED" });
```

Also test that a priority `10` job runs before a priority `0` job when both are waiting.

- [x] **Step 2: Verify the test fails**

Run: `npm test -- pageRenderQueue.test.ts`

Expected: FAIL because `pageRenderQueue.ts` does not exist.

- [x] **Step 3: Implement the minimal queue**

```ts
export function createPageRenderQueue({ concurrency }: { concurrency: number }) {
  // Queue { id, priority, run, resolve, reject }, drain up to `concurrency`.
  // `supersede(id)` removes a pending job and rejects it with code SUPERSEDED.
}
```

- [x] **Step 4: Verify the queue tests pass**

Run: `npm test -- pageRenderQueue.test.ts`

Expected: PASS.

### Task 2: Route PDF.js page raster jobs through the queue

**Files:**
- Modify: `apps/desktop/src/features/reader/ReaderPage.tsx:290-429`
- Modify: `apps/desktop/src/features/reader/ReaderPage.test.tsx`

- [x] **Step 1: Write the failing reader regression test**

Mock deferred `page.render()` tasks, render the reader, then perform rapid zoom input through 300% → 50% → 300%. Assert that no more than one raster task is started at a time and that the final visible canvas has the 300% intrinsic width.

- [x] **Step 2: Verify the reader regression fails**

Run: `npm test -- ReaderPage.test.tsx`

Expected: FAIL because current `PdfPage` starts each visible PDF.js raster immediately.

- [x] **Step 3: Implement queue integration**

```ts
const token = pageRenderQueue.run(async () => {
  const offscreen = document.createElement("canvas");
  // allocate and render here, then return the offscreen canvas
}, { priority: 10 });

// cleanup: renderTask?.cancel(); pageRenderQueue.supersede(token.id)
// commit only if the component generation is still current
```

Release the temporary canvas on both success and cancellation. Log unexpected errors in development; ignore PDF.js cancellation errors.

- [x] **Step 4: Verify reader tests pass**

Run: `npm test -- ReaderPage.test.tsx`

Expected: PASS.

### Task 3: Verify the complete worktree

**Files:**
- Verify only.

- [x] **Step 1: Run the complete frontend suite**

Run: `npm test`

Expected: all test files pass.

- [x] **Step 2: Build the production frontend**

Run: `npm run build`

Expected: TypeScript and Vite build pass; only the existing chunk-size advisory may remain.

- [x] **Step 3: Inspect the diff**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only queue, reader, regression test, and plan/spec changes.
