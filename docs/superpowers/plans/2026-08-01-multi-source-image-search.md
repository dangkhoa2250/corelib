# Multi-Source Image Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Pixabay with keyless Wikimedia Commons, DuckDuckGo, and Openverse image search, returning five results per provider on each page.

**Architecture:** Tauri owns all provider requests and remote-image downloads so the renderer never needs arbitrary network CSP access. A shared result contract carries provider identity and license attribution; selected images are staged as durable local `web` media before they are inserted into a rich card document.

**Tech Stack:** Rust/Tauri 2, reqwest blocking client in `spawn_blocking`, SQLite migrations, React 19, TypeScript, Vitest.

---

### Task 1: Register and test the multi-provider search command

**Files:**
- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/src/multi_image_search.rs`

- [ ] Write Rust tests for blank queries, five-result provider limits, page-two offsets, source interleaving, and one-provider failure isolation.
- [ ] Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml multi_image_search`
- [ ] Make `search_multi_source_images` an async Tauri command that runs blocking requests off the runtime, returns results plus provider warnings, and registers it in `generate_handler!`.
- [ ] Re-run the focused test command.

### Task 2: Make remote image preview and staging backend-owned

**Files:**
- Create: `apps/desktop/src-tauri/src/remote_image.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/src/commands.rs`
- Modify: `apps/desktop/src-tauri/src/commands_tests.rs`
- Modify: `apps/desktop/src-tauri/src/media.rs`
- Modify: `apps/desktop/src-tauri/src/media_tests.rs`

- [ ] Write failing tests for rejecting non-HTTP URLs, non-images, oversized streams, and staging a validated remote image as `web` media with attribution.
- [ ] Run the focused Rust tests and confirm the new expectations fail.
- [ ] Add bounded, redirect-safe Rust downloading for previews and selected source images; add `fetch_remote_image_preview` and remote staging commands.
- [ ] Re-run focused tests.

### Task 3: Migrate media attribution from Pixabay to generic web media

**Files:**
- Create: `apps/desktop/src-tauri/migrations/0015_generic_web_media.sql`
- Modify: `apps/desktop/src-tauri/src/model.rs`
- Modify: `apps/desktop/src-tauri/src/learning.rs`
- Modify: `apps/desktop/src-tauri/src/study_queue.rs`
- Modify: `apps/desktop/src/domain/media.ts`
- Modify: `apps/desktop/src/domain/learning.ts`

- [ ] Write migration and model tests that preserve pre-existing Pixabay rows by converting them to `web` and retaining their attribution.
- [ ] Run focused Rust and Vitest domain tests; verify failure first.
- [ ] Rename the persisted attribution field to generic `attribution`, permit only `file`, `clipboard`, and `web`, and update all query projections/types.
- [ ] Re-run focused tests.

### Task 4: Replace picker UI and composer bridges

**Files:**
- Create: `apps/desktop/src/features/cards/RemoteImagePreview.tsx`
- Create: `apps/desktop/src/features/cards/RemoteImagePreview.test.tsx`
- Modify: `apps/desktop/src/features/cards/MediaPicker.tsx`
- Modify: `apps/desktop/src/features/cards/MediaPicker.test.tsx`
- Modify: `apps/desktop/src/lib/media.ts`
- Modify: `apps/desktop/src/lib/media.test.ts`
- Modify: `apps/desktop/src/features/cards/CardComposer.tsx`
- Modify: `apps/desktop/src/features/cards/CardComposer.test.tsx`
- Modify: `apps/desktop/src/features/cards/CardSidePanel.tsx`

- [ ] Write failing component tests for auto-search, source badge/attribution, appending the second 15-result page without duplicates, partial-provider warning, local preview blob cleanup, and staging an image as `web`.
- [ ] Run focused Vitest files and confirm failures.
- [ ] Implement the typed Tauri bridges, keyless picker, local preview component, load-more behavior, and composer/side-panel insertion bridge.
- [ ] Preserve the picker as content of its parent scroll surface; do not introduce a nested `overflow` surface. Re-run focused tests.

### Task 5: Remove Pixabay and its Settings destination

**Files:**
- Delete: `apps/desktop/src-tauri/src/pixabay.rs`
- Delete: `apps/desktop/src-tauri/src/pixabay_tests.rs`
- Delete: `apps/desktop/src/features/settings/PixabaySettingsSection.tsx`
- Delete: `apps/desktop/src/features/settings/PixabaySettingsSection.test.tsx`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/tauri.conf.json`
- Modify: `apps/desktop/src/features/settings/SettingsPage.tsx`
- Modify: `apps/desktop/src/app/routes.ts`
- Modify: `apps/desktop/src/app/commandRegistry.ts`
- Modify: `apps/desktop/src/app/commandRegistry.test.ts`

- [ ] Write/update registry tests that assert the deleted Media destination is absent and no dead `images` settings section is reachable.
- [ ] Run focused tests and confirm expected failure before removal.
- [ ] Remove Pixabay modules, commands, API-key UI, CSP origins, route type, and registry entry; keep image insertion contextual rather than adding a Command Palette command.
- [ ] Re-run registry tests and search the desktop sources for production Pixabay references.

### Task 6: Full verification and fresh desktop runtime check

**Files:** No source changes expected.

- [ ] Run `npm test` and `npm run build` from `apps/desktop`.
- [ ] Run `cargo test --all-targets --manifest-path src-tauri/Cargo.toml` and `cargo clippy --all-targets --all-features --manifest-path src-tauri/Cargo.toml -- -D warnings` from `apps/desktop`.
- [ ] Record `git rev-parse --short HEAD`, `git status --short`, and running Tauri/Vite processes; stop stale processes and launch a fresh `npm run tauri dev` from this worktree.
- [ ] Manually check all three source badges, Load more, a staged image in review, and a long result list in light/dark modes for the WKWebView scrollbar constraints.
