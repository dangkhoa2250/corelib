# Corelib project memory

Last updated: 2026-07-10

## What this project is

Corelib is becoming a macOS-first personal learning/research library. The first release is a desktop PDF library with fast search, an integrated reader, and Google Drive as an optional document source. Windows and Linux remain future targets, so the data/service boundaries must stay platform-neutral.

## Current state

The first Library v1 slice is implemented and merged into `master`:

- Tauri 2 + React + TypeScript desktop app under `apps/desktop`.
- Apple Books-like flat cover grid.
- Local PDF import into app-managed storage.
- SHA-256 deduplication, safe PDF validation, atomic copy, rollback, and symlink/reparse-point protection.
- SQLite metadata plus FTS5 full-text index.
- Background PDF text extraction with `lopdf`, bounded workers, restart recovery, and resource limits.
- `Cmd+K` command palette with metadata/full-text search and keyboard navigation.
- PDF.js reader with page thumbnails, outline, in-document search, zoom, reading-position persistence, and lazy rendering.
- Zoom fix: cursor-anchored Ctrl-wheel/pinch, center-anchored toolbar zoom, and scroll layout that follows the zoom scale.
- Google Drive: browse/select PDFs or folders, read-only OAuth flow, download-on-demand cache, lazy covers, cache clearing, and offline cached reading.

## Important commits

- `78605f4` — complete Google Drive library integration; current `master` HEAD.
- `3259c4e` — Drive navigation/download/lazy-cover hardening.
- `2c2e32e` — PDF zoom anchored while scrolling.
- `c5de93c` — bounded indexing queue and extraction limits.
- `a68011f` — background indexing and `Cmd+K` search.
- `8667048` — Library grid and local PDF import.
- `ec30019` — atomic managed PDF copy.
- `867a33e` — native Anki learning design and data model.
- `1590d97`, `a7a77ba` — learning schema, upgrade-safe source deletion, and FTS cleanup.
- `65ed0ee`, `1b28540` — FSRS 6.6 scheduler with millisecond ISO due timestamps.
- `66da077`, `ab1251b`, `ecf187e`, `c615664` — atomic learning repository, validation hardening, and timestamp consistency.
- `22bc7f4`, `9685eae` — typed Tauri learning commands and frontend bridge.
- `229016a`, `b79e0e2`, `2145949` — PDF selection → editable Front/Back composer, cross-page guards, and async deck hydration.
- `ca60c0a`, `617c5f3`, `b5005b6`, `44881ef`, `829c8f7`, `2e1cc1c` — Review today, Search Everything card results, timer/source error handling, and source resolver integration.

## How to run

```bash
cd /Users/jason/project/corelib/apps/desktop
npm install
npm run tauri dev
```

Checks:

```bash
npm test
npm run build
cargo test --all-targets --manifest-path src-tauri/Cargo.toml
cargo clippy --all-targets --all-features --manifest-path src-tauri/Cargo.toml -- -D warnings
```

The current verified Anki baseline is 74 frontend tests, 73 Rust unit tests, and 1 PDF extraction isolation test passing; production TypeScript/Vite build, Playwright learning smoke test, Rust fmt, and clippy with `-D warnings` are green.

## Architecture notes

- React components call typed wrappers in `apps/desktop/src/lib/desktop.ts`.
- Rust commands and SQLite live under `apps/desktop/src-tauri/src`.
- Raw PDF bytes are never stored in SQLite.
- Local PDFs live in managed storage; Drive PDFs live in a removable cache and are fetched on demand.
- `document_id` is stable and should anchor future notes, highlights, vocabulary cards, AI/RAG citations, and cross-device sync.
- Learning cards live in `decks`, `cards`, `card_sources`, `review_logs`, `tags`, `card_tags`, and FTS5 `card_text`. Source document deletion preserves the card and quote while setting `documentId` to null.
- Card creation is manual: PDF selection pre-fills Front, Back remains user-editable, and both fields are required. Review uses native FSRS 6.6 at 90% desired retention with Again/Hard/Good/Easy.
- `Cmd/Ctrl+K` now searches documents and cards. Card results open Review today; Show source resolves the source document/page and keeps review usable when a source is unavailable.
- OAuth tokens belong in the OS credential store; do not put secrets in SQLite or logs.

## Not implemented yet

These are intentionally deferred and should be built as separate slices:

1. Notes, highlights, annotations, and backlinks.
2. AI-assisted English vocabulary extraction and richer Anki features (cloze, media, optimizer).
3. AI/RAG chat grounded in the local library and notes.
4. Accounts and cross-device sync for Windows/Linux.
5. Plugin/app framework behind Search Everything.

## Next recommended session

1. Run the app with the real PDFs in the `math/` folder and manually verify Library → Reader → zoom/pinch → search → back navigation.
2. Capture any remaining reader interaction issues on macOS before adding more features.
3. Manually exercise Library → select PDF text → Create flashcard → edit Back → save → Review today → Show source on macOS.
4. Add note/highlight data model around stable document/page/text anchors, then layer AI/RAG citations and cross-device sync.

## Working-tree note

At the time this memory was written, `.gitignore` has an intentional uncommitted `math` entry from the existing workspace. Preserve it unless the user asks to change it.
