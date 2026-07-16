# Corelib project memory

Last updated: 2026-07-16

## What this project is

Corelib is becoming a macOS-first personal learning/research library. The first release is a desktop PDF library with fast search, an integrated reader, and Google Drive as an optional document source. Windows and Linux remain future targets, so the data/service boundaries must stay platform-neutral.

## Current state

The Library v1 slice and the Memora (native Anki-style learning) slice are implemented and merged into `master`:

- Tauri 2 + React + TypeScript desktop app under `apps/desktop`.
- Apple Books-like flat cover grid.
- Local PDF import into app-managed storage.
- SHA-256 deduplication, safe PDF validation, atomic copy, rollback, and symlink/reparse-point protection.
- SQLite metadata plus FTS5 full-text index.
- Background PDF text extraction with `lopdf`, bounded workers, restart recovery, and resource limits.
- `Cmd+K` command palette with metadata/full-text search and keyboard navigation.
- PDF.js reader with page thumbnails, outline, in-document search, zoom, reading-position persistence, and lazy rendering.
- Zoom fix: cursor-anchored Ctrl-wheel/pinch, center-anchored toolbar zoom, and scroll layout that follows the zoom scale.
- Reader scroll areas use a reusable `ScrollArea` component with portal-mounted overlay thumbs. This avoids the white native scrollbar track that macOS WebKit can paint in the Tauri webview.
- Account gate uses the supplied 3328×1872, 30fps looping MP4 (`/corelib-login-page.mp4`) as its decorative background. Keep the declarative `autoPlay`, `muted`, `loop`, `playsInline`, and `preload="auto"` attributes; verify playback in a freshly built Tauri release rather than an already-open app.
- Google Drive: browse/select PDFs or folders, read-only OAuth flow, download-on-demand cache, lazy covers, cache clearing, and offline cached reading.
- Persistent Apple Books-style sidebar with Search, Library, and Memora sections; Feather-style icons; deck rename/delete from the sidebar.
- Memora Card Browser: full card lifecycle UI scoped to decks — create, edit (front/back/tags/deck), move, suspend/unsuspend, trash, restore (to original or different deck), delete permanently, and empty trash. Tag pills, status filters, sort, search, and infinite scroll.
- Atomic card edit + move: `update_and_move_card` backend command updates content and optionally moves deck in a single SQLite transaction, replacing the previous two-step `update_card` → `move_cards` flow that could leave content changed when a deck move failed.
- Migration 0006 (`card_lifecycle`): adds `deleted_at`, `deleted_from_deck_name`, and `suspended_from_state` columns; rebuilds cards, card_sources, review_logs, and card_tags with nullable `deck_id`; recreates indexes and FTS cleanup trigger.

## Important commits

- `78605f4` — complete Google Drive library integration.
- `867a33e` — native Anki learning design and data model.
- `1590d97`, `a7a77ba` — learning schema, upgrade-safe source deletion, and FTS cleanup.
- `65ed0ee`, `1b28540` — FSRS 6.6 scheduler with millisecond ISO due timestamps.
- `66da077`, `ab1251b`, `ecf187e`, `c615664` — atomic learning repository, validation hardening, and timestamp consistency.
- `22bc7f4`, `9685eae` — typed Tauri learning commands and frontend bridge.
- `229016a`, `b79e0e2`, `2145949` — PDF selection → editable Front/Back composer, cross-page guards, and async deck hydration.
- `ca60c0a`, `617c5f3`, `b5005b6`, `44881ef`, `829c8f7`, `2e1cc1c` — Review today, Search Everything card results, timer/source error handling, and source resolver integration.
- `b662719`, `1200ce1`, `630861f`, `3dfb3f8` — persistent sidebar, deck management, flashcard browsing UI, and interactive slideshow.
- `99e6e9c`, `3f9c630` — Memora card browser lifecycle design and implementation (trash, restore, suspend, move, bulk actions).
- `749c685` — scope Card Browser to Memora decks.
- `d89ad7a` — initial login-video autoplay investigation.
- `b24a9e0` — add reusable overlay scroll areas for Reader panes.

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

The latest verified frontend baseline is 262 Vitest tests passing; the production TypeScript/Vite build is green. Historical Rust and Playwright results above should be re-run before relying on them as a current release baseline.

## Architecture notes

- React components call typed wrappers in `apps/desktop/src/lib/desktop.ts`.
- Rust commands and SQLite live under `apps/desktop/src-tauri/src`.
- Raw PDF bytes are never stored in SQLite.
- Local PDFs live in managed storage; Drive PDFs live in a removable cache and are fetched on demand.
- `document_id` is stable and should anchor future notes, highlights, vocabulary cards, AI/RAG citations, and cross-device sync.
- Learning cards live in `decks`, `cards`, `card_sources`, `review_logs`, `tags`, `card_tags`, and FTS5 `card_text`. Source document deletion preserves the card and quote while setting `documentId` to null.
- Card creation is manual: PDF selection pre-fills Front, Back remains user-editable, and both fields are required. Review uses native FSRS 6.6 at 90% desired retention with Again/Hard/Good/Easy.
- Card editing uses a single atomic `update_and_move_card` command that combines content update and optional deck move in one transaction; if the deck move fails, the content change rolls back too.
- `Cmd/Ctrl+K` searches documents and cards. Card results open Review today; Show source resolves the source document/page and keeps review usable when a source is unavailable.
- OAuth tokens belong in the OS credential store; do not put secrets in SQLite or logs.
- `ScrollArea` deliberately uses `overflow: hidden` and translates wheel gestures into `scrollTop`/`scrollLeft`; its visual thumbs are portals so they do not create a native WebKit scroller or consume layout space.
- For account-gate video changes, retain the high-resolution MP4 and the declarative autoplay attributes. Check playback only in a freshly built release artifact; an open app can be a stale binary.

## Design rules

- Every UI change must be designed, implemented, and visually verified in both light mode and dark mode. Use the semantic tokens in `apps/desktop/src/styles/tokens.css`; do not add hard-coded theme colors when an appropriate token exists.
- Preserve accessible contrast, focus states, disabled states, and legibility in both themes. Brand marks may retain their official colors, while surrounding surfaces and text must remain theme-aware.

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
