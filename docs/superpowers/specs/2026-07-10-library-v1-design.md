# Library v1 design

## Purpose and scope

Library v1 is the first module of a personal learning and research desktop app. It is a macOS-first application, designed so that the same codebase can later ship on Windows and Linux. The release is deliberately focused: collect PDF documents, find them quickly, and read them inside the app.

Included in v1:

- A flat, Apple Books-inspired grid of large PDF covers.
- Local PDF import and Google Drive selection as two document sources.
- A built-in PDF reader with page thumbnails, zoom, in-document search, and reading-position memory.
- A global-in-app `Cmd+K` command palette that searches library metadata and indexed PDF text.
- Local storage, background thumbnail/text indexing, download-on-demand for Drive files, and offline reading of cached Drive files.

Deferred from v1:

- Notes, highlights, vocabulary cards, Anki export, AI/RAG, user accounts, cross-device synchronization, collections/folders, automatic Drive-folder watching, and full document sharing.

## Product experience

The app opens directly to Library. It has no sidebar or folder hierarchy in v1. Documents appear as a responsive grid of large cover cards made from the first PDF page. A card shows its title and author when available, and shows a compact progress/error indicator while the cover or index is pending.

The top bar contains Library identity, an add-document action, and background work status. The add flow exposes two explicit choices:

1. **Import from Mac** — select or drag-and-drop one or more PDFs. The app copies each accepted PDF into its managed library.
2. **Google Drive** — authenticate, then browse and explicitly select individual PDFs or folders. Selecting a folder imports its current eligible PDFs; it does not create a watched folder.

Both sources produce one unified Library grid. Source provenance is retained but stays out of the way in normal browsing.

`Cmd+K` opens a keyboard-first command palette from any in-app view. In v1 it searches title, author, and indexed text and opens the chosen document on Enter. The command palette is intentionally named and structured as the future Search Everything surface for notes, vocabulary, AI actions, and plug-in commands.

Opening a card transitions within the same app window to Reader. Reader contains a back action, document name, page navigation/thumbnails, zoom, and in-document search. It restores the last read page for each document.

## Technology direction

Use Tauri with React and TypeScript for the desktop shell and UI, backed by Rust commands for file access, background jobs, and secure platform integration. Use PDF.js for rendering and text extraction so the reader behaves consistently on macOS, Windows, and Linux. Use SQLite for local structured data and full-text search.

The visual design is macOS-oriented: SF Pro where available, generous spacing, restrained chrome, and Apple Books-like cover presentation. The app must not depend on macOS-only data or PDF APIs.

## Architecture

```text
React UI
  - Library grid, Cmd+K palette, Reader
          |
Tauri command boundary
  - File picker, managed storage, cache, job scheduling, secure credentials
          |
Local data layer
  - SQLite metadata/search index
  - Managed local PDFs
  - Download cache for Drive PDFs
          |
Google Drive adapter
  - OAuth, browse/select, metadata lookup, on-demand download
```

The UI talks to application services, never directly to SQLite, local paths, or Google Drive. Services expose document, search, reader-state, and source-adapter operations. This boundary keeps platform-specific work and future sync implementations isolated.

## Document model and storage

Each document owns a stable `document_id` and has one source type:

- `local_managed`: an imported PDF copied into app-managed storage.
- `google_drive`: a Drive file ID, source metadata, and optional local cached PDF.

SQLite stores document metadata, source references, page/read state, thumbnail/index job state, and the searchable extracted text. It does not store raw PDF bytes. Local-imported PDFs live in managed storage. Drive PDFs are downloaded only when opened and placed in a removable cache.

The import pipeline assigns content hashes. Identical local PDF contents are detected as duplicates before another managed copy is created. Files with the same name but different content remain distinct documents. A Drive source is identified by Drive file ID rather than its filename.

Metadata and mutable records use stable IDs and modification timestamps from the start. This makes a future sync layer possible without changing reader, library, or command-palette interfaces. Future sync must be provider-neutral, not based on iCloud/CloudKit, because Windows and Linux are in scope.

## Background work and data flow

1. A user selects local PDFs or Drive PDFs/folders.
2. The document service creates a Library record immediately, so the card can appear without waiting.
3. For local imports, the file is copied into managed storage. For Drive imports, metadata and file ID are saved without downloading the PDF.
4. A background job generates a first-page cover and extracts/indexes PDF text once a local copy is available.
5. Opening a Drive document downloads it to cache when necessary, then starts/retries thumbnail and index jobs.
6. Search returns metadata matches immediately and full-text matches once indexing succeeds. Reader state saves the latest page asynchronously.

## Reliability and privacy

- Google Drive access is read-only and limited to the user-authorized account/file selection flow.
- OAuth tokens belong in the operating-system credential store (macOS Keychain in v1), never in SQLite, app logs, or UI state.
- The app does not upload PDFs. A Drive PDF is fetched only when needed; local imported PDFs stay local.
- Cached Drive files remain readable offline. Uncached Drive files show an offline/retry state instead of failing silently.
- Deleted Drive files, revoked/expired credentials, invalid PDFs, interrupted downloads, and indexing failures retain the Library record and display a recoverable status. Indexing failure never prevents PDF reading.
- The user can clear Drive cache without deleting Library records, metadata, or reading state.

## Performance expectations

- Importing 10–20 PDFs must keep Library interaction responsive.
- Cards appear promptly, with placeholder/loading state while covers are generated.
- After relevant indexing completes, `Cmd+K` returns its first result set within 100 ms for a Library of up to 1,000 documents on the supported macOS development machine.
- PDF rendering and text extraction must not block the UI thread.

## Testing strategy

- Unit tests for document creation, source persistence, duplicate hash behavior, cache policy, and reading-position persistence.
- Integration tests for local import, Drive metadata selection, expired credentials, interrupted download retry, cached/offline reader behavior, and database migrations.
- UI tests for Library grid states, `Cmd+K` keyboard navigation and result opening, Reader navigation/zoom/search, and recoverable error messages.
- Fixture PDFs cover valid, encrypted/unsupported, malformed, same-name/different-content, and large-document cases.

## Later extension points

The following are intentionally outside v1 but must attach through the service and document-ID boundaries above:

- Notes and highlights anchored to document/page/text ranges.
- Vocabulary cards and spaced-repetition learning flows.
- AI/RAG retrieval over document text and personal notes.
- Cross-platform account sync for metadata, notes, reading state, and optionally cached/downloaded document availability.
- A plugin/app framework exposed through the future Search Everything command palette.
