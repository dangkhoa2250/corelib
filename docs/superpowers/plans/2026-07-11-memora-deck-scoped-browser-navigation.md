# Memora Deck-Scoped Browser Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep only Library, Memora, and Trash in the application sidebar and make Card Browser accessible exclusively by opening a deck from Memora.

**Architecture:** App owns the selected deck ID in its route. Card Browser requires that ID and queries only that deck; Trash remains a generic top-level destination while its current content remains card-specific.

**Tech Stack:** React, TypeScript, Vitest/Testing Library, Playwright.

---

### Task 1: Lock sidebar and route behavior with tests

**Files:**
- Modify: `apps/desktop/src/app/App.test.tsx`
- Modify: `apps/desktop/src/features/cards/CardBrowser.test.tsx`

- [ ] Add a failing App test asserting sidebar contains Library, Memora, Trash and no Card Browser.
- [ ] Assert opening a Memora deck queries Card Browser with that deck ID and Back returns to Memora.
- [ ] Add a failing Card Browser test asserting there is no All Decks option and no deck selector.
- [ ] Run `npm test -- --run src/app/App.test.tsx src/features/cards/CardBrowser.test.tsx` and confirm the new assertions fail for the removed navigation/filter behavior.

### Task 2: Remove global Card Browser navigation

**Files:**
- Modify: `apps/desktop/src/app/AppSidebar.tsx`
- Modify: `apps/desktop/src/app/icons.tsx`
- Modify: `apps/desktop/src/app/App.tsx`
- Modify: `apps/desktop/src/features/cards/CardBrowser.tsx`

- [ ] Remove `cardBrowser` from `AppSection`, `NAV_ITEMS`, and sidebar icons/imports.
- [ ] Make `AppRoute.cardBrowser.deckId` required and remove the sidebar branch that creates a global Browser route.
- [ ] Make `CardBrowser.initialDeckId` required, initialize from it, and remove `all`/empty-deck handling.
- [ ] Remove the deck filter select and Clear behavior that changes deck scope.
- [ ] Keep dirty guards for row changes, panel close, Back, and sidebar navigation.
- [ ] Run the focused tests until green.

### Task 3: Update lifecycle E2E and verify

**Files:**
- Modify: `apps/desktop/tests/e2e/learning.spec.ts`

- [ ] Update the E2E restore flow to reopen Memora and select Biology instead of using a Card Browser sidebar button.
- [ ] Run `npm test -- --run`, `npm run build`, and `npm run test:e2e`.
- [ ] Run `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`, `cargo test --all-targets --manifest-path src-tauri/Cargo.toml`, and `cargo clippy --all-targets --all-features --manifest-path src-tauri/Cargo.toml -- -D warnings`.
- [ ] Run `git diff --check` and commit the navigation patch.
