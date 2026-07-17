# Memora Learning Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct reviewed scheduling/session defects and remove the approved unnecessary controls from Memora.

**Architecture:** Rust continues to own FSRS input, fixed-step policy, previews, and atomic ratings. React keeps the active study session in route state, refreshes an empty queue exactly when its next learning card becomes due, and renders a smaller study/practice/settings surface.

**Tech Stack:** Rust, fsrs-rs 6.6.0, SQLite/rusqlite, React 19, TypeScript, Vitest, Testing Library.

---

### Task 1: Make queue preview inputs match rating inputs

**Files:**
- Modify: `apps/desktop/src-tauri/src/study_queue.rs`
- Modify: `apps/desktop/src-tauri/src/study_queue_tests.rs`

- [ ] Add a failing overdue-review test asserting the granted preview equals apply with elapsed days derived from `last_review_at`.
- [ ] Run the focused Rust test and confirm it fails because the queue uses zero elapsed days.
- [ ] Share one schedule-input helper between grant/open preview construction and rating application.
- [ ] Run the focused test and scheduler/queue test modules.

### Task 2: Update FSRS memory on every learning rating

**Files:**
- Modify: `apps/desktop/src-tauri/src/scheduler.rs`
- Modify: `apps/desktop/src-tauri/src/scheduler_tests.rs`

- [ ] Add failing tests proving consecutive learning ratings change memory and relearning Hard differs from Again.
- [ ] Run the focused scheduler tests and confirm both fail for the reviewed reasons.
- [ ] Select the matching FSRS item state for fixed learning/relearning transitions, persist its memory, and keep the configured short-step due time.
- [ ] Run the scheduler test module.

### Task 3: Keep the replacement session active and refresh only empty queues

**Files:**
- Modify: `apps/desktop/src/app/App.tsx`
- Modify: `apps/desktop/src/app/App.test.tsx`
- Modify: `apps/desktop/src/features/review/ReviewPage.tsx`
- Modify: `apps/desktop/src/features/review/ReviewPage.test.tsx`

- [ ] Add failing tests that rate with a replacement session ID and that do not refresh/reset a non-empty queue.
- [ ] Confirm focused frontend tests fail.
- [ ] Lift successful session refresh/replacement into route state and pass the active session ID when rating.
- [ ] Arm the next-due timer only for an empty queue and remove stale-specific refresh behavior.
- [ ] Run focused App and ReviewPage tests.

### Task 4: Remove approved UI clutter

**Files:**
- Modify: `apps/desktop/src/features/review/ReviewPage.tsx`
- Modify: `apps/desktop/src/features/review/ReviewPage.test.tsx`
- Modify: `apps/desktop/src/features/settings/MemoraSettingsSection.tsx`
- Modify: `apps/desktop/src/features/settings/MemoraSettingsSection.test.tsx`
- Modify: `apps/desktop/src/styles/tokens.css`

- [ ] Update tests first to require no Refresh now, no practice disclaimer, a compact Practice heading, and no Restore defaults.
- [ ] Confirm focused tests fail against the existing UI.
- [ ] Remove the controls, copy, state, handlers, and now-unused styles.
- [ ] Run the focused frontend tests.

### Task 5: Full verification

**Files:**
- Verify all modified files.

- [ ] Run `cargo test` and `cargo clippy --all-targets -- -D warnings` in `apps/desktop/src-tauri`.
- [ ] Run `npm test -- --run` and `npm run build` in `apps/desktop`.
- [ ] Inspect `git diff --check` and `git status --short`.
