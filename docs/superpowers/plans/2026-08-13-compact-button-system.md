# Compact Button System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Standardize common text-action buttons around the existing shared `Button` primitive with a compact native desktop treatment, while preserving icon controls, toolbar controls, and review rating controls.

**Architecture:** Extend `apps/desktop/src/components/Button.tsx` with the semantic `destructive` variant and centralize compact dimensions/states in the existing `ui-button` rules in `tokens.css`. Migrate scoped text actions to the primitive while leaving component-specific classes only for layout and specialized interactions.

**Tech Stack:** React, TypeScript, Vitest, existing CSS tokens, Tauri desktop app.

---

### Task 1: Lock the shared button contract

**Files:**
- Modify: `apps/desktop/src/components/Button.tsx`
- Create: `apps/desktop/src/components/Button.test.tsx`
- Modify: `apps/desktop/src/styles/tokens.css`

- [x] Add a failing test that renders `Button` with each semantic variant and verifies the generated classes, default `type="button"`, and disabled semantics.
- [x] Run `npm test -- --run apps/desktop/src/components/Button.test.tsx` and confirm it fails because `destructive` is not yet part of the type.
- [x] Extend `ButtonVariant` to `primary | secondary | quiet | destructive`, then add compact tokens and centralized state rules: 30px minimum height, 13px semibold text, 7px radius, 11px horizontal padding, focus ring, hover, pressed, disabled, and loading-compatible cursor behavior.
- [x] Keep `Button` forwarding native button props and user class names, with user class names last so layout overrides remain possible.
- [x] Run the focused Button test and TypeScript compilation.

### Task 2: Migrate Library and deck management actions

**Files:**
- Modify: `apps/desktop/src/features/library/ImportMenu.tsx`
- Modify: `apps/desktop/src/features/memora/MemoraPage.tsx`
- Modify: `apps/desktop/src/features/memora/DeckLearningSettingsDialog.tsx`
- Modify: `apps/desktop/src/styles/tokens.css`
- Test: existing Library/Memora tests

- [x] Replace the Library header `Import` trigger with `Button variant="primary"`; preserve its menu ARIA attributes and existing menu-item buttons.
- [x] Replace deck creation, rename, delete-confirm, study, review, and modal save/cancel text actions with semantic `Button` variants; keep compact menu items and card-open controls on their existing specialized styles.
- [x] Keep any deck review/rating interaction sizes unchanged and remove only conflicting page-level padding/background rules for migrated text actions.
- [x] Run focused Library and Memora tests and inspect the diff for accidental changes to menu or icon controls.

### Task 3: Migrate Provider and settings form actions

**Files:**
- Modify: `apps/desktop/src/features/settings/SettingsPage.tsx`
- Modify: `apps/desktop/src/features/settings/MemoraSettingsSection.tsx`
- Modify: `apps/desktop/src/styles/tokens.css`
- Test: existing Settings and Memora settings tests

- [x] Replace Add provider, Manage, Connect, Save Credentials, Clear Credentials, Remove key, and settings form actions with shared semantic variants.
- [x] Use `destructive` only for irreversible removal actions; keep password visibility, close, combobox, model-result, and disclosure controls specialized.
- [x] Preserve provider row layout and modal behavior while removing duplicate button presentation declarations that override compact sizing.
- [x] Run focused settings tests and verify accessible names remain unchanged.

### Task 4: Align existing form actions without touching special controls

**Files:**
- Modify: `apps/desktop/src/features/cards/CardComposer.tsx`
- Modify: `apps/desktop/src/features/cards/CardSidePanel.tsx`
- Modify: `apps/desktop/src/features/library/DocumentCard.tsx`
- Modify: `apps/desktop/src/features/memora/DeckLearningSettingsDialog.tsx`
- Modify: `apps/desktop/src/styles/tokens.css`

- [x] Convert ordinary Save/Cancel actions in the scoped forms to shared variants so Create Flashcard remains the visual reference.
- [x] Leave rich-text toolbar buttons, Image/Translate controls, icon-only controls, document-card menu items, and review rating buttons on their specialized styles.
- [x] Remove only conflicting pill-shaped text-button declarations from migrated controls; retain layout selectors for alignment and spacing.
- [x] Run all affected feature tests and confirm review rating selectors and behavior are unchanged.

### Task 5: Verify the system from the feature worktree

**Files:**
- Verify only; no new source files.

- [x] Run the full desktop Vitest suite and `tsc --noEmit`.
- [x] Run `git diff --check` and inspect `git diff --stat` plus the exact touched-file list to ensure unrelated existing worktree changes were not modified.
- [x] Record `git rev-parse --short HEAD` and `git status --short` before any fresh runtime check.
- [x] Identify existing desktop processes; no fresh `tauri dev` was started, so runtime behavior is reported as unverified.
