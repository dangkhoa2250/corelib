# Rich Flashcards with Pixabay Media Design

**Date:** 2026-08-01

**Status:** Approved design, pending written-spec review

**Scope:** `apps/desktop` React/Tauri flashcard editing, review rendering, and media storage

## Summary

Flashcard fronts and backs are currently plain text stored in the `cards.front` and `cards.back` columns, rendered verbatim in the editor, the Card Browser, and the Review flashcard. This design adds optional rich text to card fronts and backs using a strictly allowlisted Tiptap JSON document, plus server-side Pixabay image search and download so learners can attach media to a card without ever exposing the Pixabay API key or loading a full-size remote image into the WebView.

Rich content is a superset of the existing plain-text model. The `front` and `back` columns remain the source of truth for scheduling, full-text search (`card_text`), YouGlish word tokenization, language detection, and legacy consumers. When rich JSON is present, the server derives those plain-text columns from it, so no existing consumer changes semantics.

## Goals

- Let users compose a card front and back as rich text (paragraphs, headings, lists, inline marks) with an explicit allowlist of Tiptap nodes and marks.
- Let users search Pixabay from inside the card editor and attach the selected image to the card.
- Store rich JSON per card face in the database (`front_rich_json`, `back_rich_json`) while keeping `front` and `back` as derived plain text.
- Track downloaded media in a `card_media` table with an explicit stage/commit/cancel/purge lifecycle so an unsaved draft never leaks files.
- Perform all Pixabay API calls and downloads in Rust; the WebView loads only small Pixabay CDN preview thumbnails during search, and the full-size image it renders is always a local `asset:` URL. The API key never reaches the WebView, and the CSP gains only the Pixabay CDN in `img-src`.
- Render rich content safely in Review, the Card Side Panel, and the Card Browser via a renderer that maps allowlisted nodes to fixed React elements and never injects arbitrary HTML.
- Keep the existing plain-text flashcard behavior unchanged when a card has no rich JSON.

## Non-goals

- Storing arbitrary HTML or non-allowlisted Markdown; rich content is stored only as validated Tiptap JSON.
- A generic image library or gallery beyond the Pixabay search/attach flow.
- Client-side Pixabay API calls, OAuth flows, or storing the Pixabay API key in the database, `localStorage`, or a settings file.
- Replacing the existing plain-text card model or the `card_text` FTS index, the YouGlish player, language detection, translation engines, or the scheduler.
- Changing the `CardSource`/source-PDF provenance model or the source-quote matching behavior.
- Adding a new public route, page, or navigation destination; editing surfaces stay inside the existing card editor flows.
- Offline image caching, image edits, or media export.
- Rendering images inside the YouGlish word-flow or the source viewer.

## Allowlisted Tiptap JSON

### Document shape

Rich content is a single Tiptap JSON document: an object with `"type": "doc"` and a non-empty `"content"` array of child nodes. Every node is validated recursively by a Rust validator before any write; there is no client-trusted HTML path.

### Allowed nodes

| Node | Allowed attributes |
| --- | --- |
| `doc` | `content` (children) |
| `paragraph` | none |
| `text` | `text` (string), `marks` (array of allowed marks only) |
| `heading` | `level` (integer 1–3) |
| `bulletList` | none |
| `orderedList` | none |
| `listItem` | `content` (children) |
| `hardBreak` | none |
| `image` | `src` (local `asset:` URL referencing a known `card_media` row), `alt` (string), `width` (optional integer) |

### Allowed marks

Only `bold`, `italic`, `underline`, and `strike` may appear inside a `text` node's `marks` array. Any other mark is rejected.

### Validation limits

- Document depth is limited to 8 nested levels.
- A single document may contain at most 2,000 nodes.
- `image.src` must parse as an `asset:` URL referencing a `card_media.media_key` row that is either already `committed` to the card being saved, or `staged` and listed in the save input's `stagedMediaIds`. The referenced staged rows are committed by the same save after validation (see lifecycle); validation never depends on rows the save itself is about to commit.
- Text nodes must be non-empty after trimming; empty `text` nodes are removed rather than stored.

Validation failures return a structured error naming the offending node path (for example `doc.content[2].content[0]`), not a generic "invalid document".

## Plain-text derivation

A single pure Rust function `derive_plain_text(doc) -> String` walks the allowlisted document and produces the plain text that fills `cards.front` or `cards.back`:

- `text` contributes its `text` value (marks are ignored for derivation).
- `paragraph` and `heading` contribute their children followed by `\n`.
- `bulletList` and `orderedList` contribute each `listItem` on its own line, prefixed with `• ` (bullet) or `N. ` (ordered).
- `hardBreak` contributes `\n`.
- `image` contributes its `alt` text when present, otherwise the string `[image]`, on its own line.
- All other nodes contribute only their children.
- Consecutive blank lines collapse to a single `\n`, and the result is trimmed.

The frontend mirrors this derivation in TypeScript (`derivePlainText(doc)` in the domain layer) with a parity test against the Rust implementation for a fixed corpus. The derived text is what continues to feed `card_text`, YouGlish tokenization, language detection, translation, and the scheduler's non-empty checks.

## Migration and data model

### Migration `0014_card_media.sql`

Add two nullable columns to `cards`:

```sql
ALTER TABLE cards ADD COLUMN front_rich_json TEXT;
ALTER TABLE cards ADD COLUMN back_rich_json TEXT;
```

`NULL` means the card predates rich editing and falls back to the existing plain-text path. Non-`NULL` values are always allowlist-validated Tiptap JSON.

Create `card_media`:

```sql
CREATE TABLE card_media (
  id TEXT PRIMARY KEY NOT NULL,
  card_id TEXT REFERENCES cards(id) ON DELETE SET NULL,
  media_key TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('pixabay')),
  provider_id TEXT,
  original_url TEXT NOT NULL,
  local_path TEXT NOT NULL,
  mime_type TEXT,
  width INTEGER,
  height INTEGER,
  size_bytes INTEGER,
  status TEXT NOT NULL CHECK (status IN ('staged', 'committed', 'cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX card_media_media_key ON card_media (media_key);
CREATE INDEX card_media_card_id_status ON card_media (card_id, status);
CREATE INDEX card_media_status_created ON card_media (status, created_at);
```

Semantics:

- `media_key` is the SHA-256 hex of the downloaded bytes; it is globally unique and names the file on disk. One media row exists per unique downloaded file; multiple cards can reference the same row from their rich JSON, and `card_id` simply records the owning card that staged/committed it.
- `card_id` is `NULL` while a media row is `staged` (owned by an unsaved editor draft) and is set on commit. When a save references a media row already `committed` to another card, that row is left in place rather than duplicated or re-owned.
- `local_path` is relative to the media root (`app_data_dir/media/`), mirroring the existing `drive-cache` layout. The full path is `media_root.join(local_path)`.
- `provider_id` is the Pixabay photo id; `original_url` records the remote URL for provenance and re-download.
- Deleting a card sets its committed rows' `card_id` to `NULL`; a separate purge step removes rows and files only once no card's rich JSON references their `media_key`.

### Media root

Media files live at `app_data_dir/media/<media_key>` where the extension is derived from `mime_type` (`.jpg`, `.png`, `.webp`). This directory is already inside the asset protocol scope (`$APPDATA/**/*` in `tauri.conf.json`), so committed images are served through the existing `asset:` scheme with no CSP or scope change.

## API and domain payloads

### Rust commands

All media commands live behind a new `apps/desktop/src-tauri/src/media.rs` module registered in the Tauri command list. No existing command changes its signature.

- `search_pixabay(query: String, per_page: Option<u32>) -> Vec<PixabayHit>` — server-side GET to the Pixabay API using the Keychain key; returns id, page URL, preview URL, image URL, width, height, and tags. The preview URL is shown as a thumbnail by the picker; the full image URL is metadata for provenance and is never loaded by the WebView.
- `stage_pixabay_media(provider_id: String) -> CardMedia` — downloads the full image to the media root, inserts a `staged` row (reusing a matching row when one exists), and returns the row so the editor can reference the eventual `asset:` URL.
- `create_card_rich(input: NewCardRich) -> LearningCardSummary` — mirrors the existing `create_card` but accepts `front_rich_json`/`back_rich_json`; validates them, derives plain text, creates the card, then commits the referenced staged media to the new card id.
- `update_card_rich(input: UpdateCardRich) -> LearningCardSummary` — validates `front_rich_json`/`back_rich_json`, derives plain text, updates `front`/`back`/`front_rich_json`/`back_rich_json`, commits staged media referenced by the saved JSON, and cancels staged media created by that draft that are no longer referenced.
- `cancel_staged_media(media_ids: Vec<String>) -> ()` — marks rows `cancelled` and deletes their files; used when the editor closes without saving.
- `purge_stale_media() -> ()` — deletes `staged` rows older than 24 hours and all `cancelled` rows, then removes unreferenced files; called once at app startup.

### Domain payloads (TypeScript)

`apps/desktop/src/domain/learning.ts` gains:

```ts
export type RichTextMark = "bold" | "italic" | "underline" | "strike";

export interface RichTextNode {
  type: string;
  text?: string;
  level?: number;
  marks?: { type: RichTextMark }[];
  content?: RichTextNode[];
  src?: string;   // asset: URL
  alt?: string;
  width?: number;
}

export interface RichTextDoc {
  type: "doc";
  content: RichTextNode[];
}

export interface CardMedia {
  id: string;
  mediaKey: string;
  provider: "pixabay";
  providerId: string | null;
  originalUrl: string;
  localPath: string;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
  status: "staged" | "committed" | "cancelled";
}

export interface PixabayHit {
  id: string;
  pageUrl: string;
  previewUrl: string;
  imageUrl: string;
  width: number;
  height: number;
  tags: string[];
}
```

`LearningCard` gains `frontRichJson: RichTextDoc | null` and `backRichJson: RichTextDoc | null`. `CardSaveInput` and `UpdateCard` gain the two optional rich fields plus `stagedMediaIds: string[]`.

## Validation and legacy fallback

### Validation flow

1. The editor produces only allowlisted JSON by construction (the Tiptap editor is configured with the same allowlist and its `onUpdate` sanitizes through `derivePlainText`-aware schema validation).
2. The server re-validates on every `create_card_rich`/`update_card_rich` call. Unknown nodes, marks, attributes, image URLs, depth, or node count are rejected.
3. The server derives plain text from the validated JSON and writes it to `front`/`back`, so FTS, scheduling, language detection, and YouGlish keep working unchanged.

### Legacy fallback

- Cards whose `front_rich_json`/`back_rich_json` are `NULL` render exactly as today: plain text in the editor textarea path, plain text in `CardRichContent`, and the existing Review flashcard faces.
- Opening a legacy card in the rich editor loads its plain text as a single `paragraph` node; saving through the editor upgrades the card to rich JSON.
- `update_card_rich` with `null` rich fields is rejected; legacy cards must use the existing plain-text update path until they are edited through the rich editor.

## Media lifecycle: stage, commit, cancel, stale, purge

The lifecycle guarantees an unsaved draft never leaks files and a saved card never loses a referenced image.

1. **Search** — The editor's Pixabay picker calls `search_pixabay` and shows result cards with the CDN preview thumbnail plus id, dimensions, and tags. Only the small preview thumbnail loads from the CDN; the full-size image is never loaded remotely.
2. **Stage** — When the user picks a result, the picker calls `stage_pixabay_media`, which downloads the file and inserts a `staged` row with `card_id NULL`. The returned `CardMedia` is rendered in the editor through the `asset:` URL from its `media_key`. Multiple staged rows may coexist for one draft. Staging is idempotent per `provider_id`: if the same Pixabay photo is picked again, the existing `staged` row for that photo is reused, and re-staging a photo whose row was previously cancelled reuses that row (setting it back to `staged` and re-downloading the file) instead of inserting a duplicate, so the unique `media_key` index is never violated.
3. **Commit** — `update_card_rich` validates the document, then sets `card_id` and `status = 'committed'` on every staged row whose `media_key` appears in the saved JSON. A media row already `committed` to another card and merely referenced again is left unchanged. The image is now owned by the card (or shared with it).
4. **Cancel** — Closing the editor without saving calls `cancel_staged_media` with the draft's staged ids; rows become `cancelled` and files are deleted. Staged media that were inserted by a draft but are absent from a later save are cancelled by the same save.
5. **Stale** — `staged` rows older than 24 hours (whose editor session never completed) are purged at app startup by `purge_stale_media`.
6. **Purge** — Deleting a card sets its committed rows' `card_id` to `NULL`. `purge_stale_media` then deletes rows whose `card_id` is `NULL` and whose `media_key` is not referenced by any card's `front_rich_json`/`back_rich_json`, and removes the corresponding files. A committed media row referenced by any card is never deleted.

## Keychain, server-side search/download, and CSP

### Pixabay API key

The key is stored in the macOS Keychain through the existing `keyring` crate, following the `KeychainTokenStore` pattern in `drive_auth.rs`:

- New `PixabayKeyStore` with service `com.library.desktop.pixabay`, username `api_key`, exposing `load()`, `save()`, `clear()`.
- A `MemoryPixabayKeyStore` test double mirrors `MemoryTokenStore`.
- The key is never persisted to the database, `localStorage`, or any settings file, and never serialized to the WebView.
- Settings exposes a "Pixabay API key" field (under the existing Memora settings section) that calls `save`/`clear` through the store; missing keys produce a clear setup message in the media picker.

### Server-side search and download

`search_pixabay` and `stage_pixabay_media` run in Rust using the existing `reqwest` dependency (already enabled with `json` features). The WebView never contacts the Pixabay API and never receives the API key. The only remote request the WebView makes is loading the CDN preview thumbnail returned by `search_pixabay`; the full-size image a user ever sees is the locally staged file.

### CSP

The production and development CSP gain exactly one addition: the Pixabay CDN in `img-src` (`https://pixabay.com https://cdn.pixabay.com`) so the picker can render search-result preview thumbnails. No other directive changes. `img-src` already permits `asset:` and `blob:`, and `connect-src` already permits `asset:`, which cover locally staged/committed media and locally generated cover thumbnails; `script-src` and `frame-src` are untouched because no Pixabay script or frame is loaded. The API key never reaches the WebView. A future feature that loads full-size remote images must revisit this decision in a new spec.

## Editor, safe renderer, and source/translation interaction

### `CardRichTextEditor`

A new `apps/desktop/src/features/cards/CardRichTextEditor.tsx` Tiptap-based editor, configured with the approved allowlist and used in place of the plain textareas in `CardComposer` and `CardSidePanel`. It owns:

- The Tiptap instance, toolbar (marks, headings 1–3, bullet/ordered lists, undo/redo, image insert), and the Pixabay media picker.
- Staged media state for the open draft, calling `stage_pixabay_media`, `cancel_staged_media`, and `search_pixabay`.
- Emitting validated Tiptap JSON via `onChange`; `onSave` passes `frontRichJson`, `backRichJson`, and the draft's staged media ids to the host.
- `onTranslate`, which receives the derived plain text (not rich JSON) and inserts the returned translated plain text as a single paragraph, replacing the existing front/back text. Formatting is not preserved across translation.

### Safe review renderer `CardRichContent`

A new `apps/desktop/src/features/cards/CardRichContent.tsx` renders allowlisted Tiptap JSON to fixed React elements:

- A hard-coded node-to-element map (`paragraph` → `<p>`, `heading` → `<h1/h2/h3>` by level, lists → `<ul>/<ol>/<li>`, `image` → `<img src={assetUrl} alt loading="lazy">`, `hardBreak` → `<br>`, marks → `<strong>/<em>/<u>/<s>`).
- `image.src` is resolved through the asset protocol only; the renderer never uses `dangerouslySetInnerHTML`.
- When `frontRichJson` is `NULL`, it renders the existing plain-text path unchanged.
- It is used in Review (`ReviewSessionSurface`/`ReviewFlashcard` faces), the Card Side Panel preview, and the Card Browser preview column.

### Review, source, and translation

- `ReviewSessionSurface` renders `CardRichContent` for the front and back faces when rich JSON exists; `ClickableFrontText` continues to receive the derived plain text so YouGlish word tokenization, highlighting, and the pronunciation modal work identically.
- `card.back` inside `ReviewFlashcard` becomes `CardRichContent` when `backRichJson` exists; otherwise it stays plain text.
- The `CardSource` quote and source-PDF highlight flow is unchanged and continues to operate on plain text.
- Language detection (`detectLanguage`) and the YouGlish `front_language` validation continue to read the derived plain text.

## Settings registry and command registration

- The Pixabay API key field is added to the existing Memora settings section (`MemoraSettingsSection`). No new top-level `SettingsSection` value, route, or navigation destination is introduced.
- Per `checking-command-registration`: this change adds no new public page, route, feature entry point, navigation destination, or user-invokable action. The existing `route.settings.memora` destination and its aliases cover the new field; the media picker and rich editor are internal editing surfaces reached only from the existing card editor. If a maintainer later promotes the Pixabay field to a standalone settings section, that section must be registered in `routes.ts` (`SettingsSection`), `SettingsPage.tsx` (`SETTINGS_NAV_KEYWORDS`), and `commandRegistry.ts` (`settingsDestination`) with focused registry tests before the feature is complete.

## Scroll-surface requirements

The rich editor body and the Pixabay media picker results list are new scrollable desktop surfaces. Before implementation modifies them, the implementation must load and follow `checking-scroll-surfaces`. Automated coverage must include the native WKWebView scrollbar-track reset and the custom-thumb content-inset checks required by that skill. The editor content region and the picker list must use the reusable `ScrollArea` with at least 20px thumb-side content padding; no new `overflow: auto` or `overflow-y: auto` surface and no new scrollbar pseudo-element overrides may be introduced. Review card faces already use `ScrollArea`; `CardRichContent` must not add its own scroll container. A browser-only CSS assertion is not sufficient evidence of real WKWebView behavior.

## Errors

Every media and validation failure surfaces as a structured, user-facing message and remains retryable:

| Failure | User message | Retry behavior |
| --- | --- | --- |
| Pixabay key missing | "Add a Pixabay API key in Settings › Memora to search images." | Opens Settings section; field re-check on save |
| Pixabay key invalid / 401 | "Pixabay rejected the API key. Update it in Settings › Memora." | Field re-check on save |
| Pixabay rate limit / network | "Pixabay search failed. Try again." | Manual retry of search |
| Image download failed | "Could not download that image. Try again." | Manual retry of stage |
| Rich JSON validation | Error names the node path, e.g. "Unsupported mark in doc.content[2]." | Editor corrects before re-save |
| Image already cancelled/stale | "This image is no longer available; pick it again." | Re-stage |
| Disk write failure | "Could not save the image on this device." | Manual retry; no partial row kept |

Errors never dismiss an in-progress editor session, and no staged file is left behind after a failed stage.

## Testing

### Rust tests

- Migration `0014_card_media.sql`: schema creation, idempotency, column defaults, and the `card_media` constraints; upgrade from the `0013` snapshot keeps existing cards with `NULL` rich columns.
- Validator: accepts the full allowlist corpus, rejects each unknown node/mark/attribute, enforces depth and node-count limits, rejects non-`asset:` image sources and unreferenced media keys.
- `derive_plain_text`: parity corpus covering paragraphs, headings, lists, hard breaks, images (alt and `[image]`), and whitespace collapse.
- Lifecycle: stage → commit → cancel → stale → purge transitions, including re-stage idempotency, cancel-on-save of unreferenced drafts, card-delete unlinking, and "referenced media is never purged".
- Keychain store: `MemoryPixabayKeyStore` round-trip and clear semantics (real Keychain is exercised only in fresh desktop verification).
- Server-side search/download: mocked HTTP responses for search parsing and download-to-media-root with content hashing.

### Frontend tests

- `CardRichTextEditor`: toolbar produces only allowlisted JSON; image insert calls `stage_pixabay_media` and emits the `asset:` URL; close without save calls `cancel_staged_media`.
- `CardRichContent`: every allowlisted node maps to its fixed element; image src is resolved via asset; no `dangerouslySetInnerHTML`; legacy `NULL` fallback renders plain text.
- `derivePlainText` TS implementation matches the Rust corpus.
- Review: rich front/back render through `CardRichContent`; YouGlish word triggers and the pronunciation modal still work from derived plain text; `NULL` rich JSON renders the existing plain path.
- Media picker: search renders the CDN preview thumbnail with metadata, missing-key and API error messages, and staging error recovery; no full-size remote image is ever requested.
- Scroll-surface checks: editor body and picker list use `ScrollArea` with the 20px thumb-side inset; no `overflow: auto` assertion passes.
- Settings: Memora section renders the Pixabay key field; existing `route.settings.memora` command-registry coverage still passes.

### Desktop verification

Unit tests and a Vite build do not prove WKWebView image loading, scrollbar, or Keychain behavior. Before reporting the UI verified, record the source revision and dirty state, restart `tauri dev` from the current checkout or build a fresh release artifact, and report the exact launch mode and artifact tested as required by the repository instructions. The manual pass must cover: creating a rich card with a Pixabay image, saving, reopening the editor, reviewing the card in Study and Practice with the image and YouGlish words intact, deleting the card and confirming its files are purged on next launch, and the scrollbar-track/thumb checks on the editor and picker in both light and dark themes.

## Acceptance criteria

1. A card front/back can be saved as allowlisted Tiptap JSON; the server derives and stores matching plain text in `front`/`back`.
2. Legacy cards without rich JSON render and review exactly as today; opening them in the rich editor upgrades them on save.
3. Users can search Pixabay and attach an image; the image is downloaded server-side, staged, committed on save, and rendered from a local `asset:` URL.
4. The Pixabay API key is stored in the Keychain, never reaches the WebView, and the CSP gains only the Pixabay CDN in `img-src`.
5. Cancelling or abandoning an edit leaves no staged files; stale and unreferenced media are purged; referenced committed media are never deleted.
6. Review renders rich fronts/backs safely with YouGlish and source behavior intact.
7. Required automated tests, scroll-surface checks, and fresh desktop-runtime verification are completed before the implementation is reported as finished.
