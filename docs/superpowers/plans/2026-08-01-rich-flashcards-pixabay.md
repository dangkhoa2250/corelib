# Rich Flashcards with Pixabay Media Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add validated Tiptap rich card faces, local media staging, Rust-owned Pixabay search/key storage, safe review rendering, and the approved editor/settings integrations without changing the existing plain-text card surfaces.

**Architecture:** Keep `front` and `back` as derived compatibility/search fields while storing nullable JSON documents and card-owned media rows in the existing SQLite store. Put validation, derivation, and media lifecycle in Rust; expose narrow Tauri commands through typed frontend wrappers. Compose the existing card editor around focused `CardRichTextEditor` instances and render review documents through a fixed React tree that resolves only validated local media IDs.

**Tech Stack:** Rust 2021, Tauri 2, rusqlite, reqwest, keyring, serde/serde_json, React 19, TypeScript 5.8, Vitest, Testing Library, Playwright, Tiptap packages.

---

## Repository map and file ownership

Map these existing files before changing them; preserve their current boundaries and test conventions:

- `apps/desktop/src-tauri/migrations/0014_card_rich_content.sql` — new schema for nullable card documents and staged/card-owned media.
- `apps/desktop/src-tauri/src/library_db.rs` — append migration registration and database transaction/query helpers; retain the existing migration fixture style.
- `apps/desktop/src-tauri/src/model.rs` — serde-facing card, document, media, Pixabay, and draft payload types.
- `apps/desktop/src-tauri/src/rich_document.rs` / `rich_document_tests.rs` — new recursive allowlist validator and plain-text derivation.
- `apps/desktop/src-tauri/src/media.rs` / `media_tests.rs` — staging, path validation, atomic promotion, cleanup, and deletion lifecycle.
- `apps/desktop/src-tauri/src/pixabay.rs` / `pixabay_tests.rs` — Keychain service, SafeSearch request/response mapping, and exactly-12 pagination.
- `apps/desktop/src-tauri/src/commands.rs` / `commands_tests.rs` — Tauri command adapters and `LibraryStore` integration.
- `apps/desktop/src-tauri/src/learning.rs` / `learning_tests.rs` — `NewCard`/`UpdateCard`, derived text, rich document persistence, and card hydration.
- `apps/desktop/src-tauri/src/lib.rs` — module declarations, managed media/Pixabay state, and `generate_handler!` registration.
- `apps/desktop/src-tauri/Cargo.toml` — Tiptap-independent Rust HTTP/Keychain dependencies only; verify existing `keyring` and `reqwest` features before adding anything.
- `apps/desktop/src-tauri/tauri.conf.json` — asset protocol scope and the minimum CSP additions required by Rust-owned Pixabay/download behavior; never expose the key to the WebView.
- `apps/desktop/src/domain/learning.ts` / `learning.test.ts` — frontend card/document/media types and API input consistency.
- `apps/desktop/src/lib/learning.ts` / `learning.test.ts` — existing card invoke wrappers extended with rich fields.
- `apps/desktop/src/lib/desktop.ts` / `desktop.test.ts` — typed media and Pixabay command wrappers.
- `apps/desktop/src/features/cards/CardRichTextEditor.tsx` / `.test.tsx` — focused Tiptap editor, toolbar, paste/drop/resize/delete behavior.
- `apps/desktop/src/features/cards/CardRichTextEditor.css` — editor and toolbar styling using existing theme tokens.
- `apps/desktop/src/features/cards/CardComposer.tsx` / `.test.tsx` — replace textarea path, preserve create/edit/source behavior, and insert translation/Pixabay media.
- `apps/desktop/src/features/cards/MediaPicker.tsx` / `.test.tsx` — file/clipboard/Pixabay staging UI and result states.
- `apps/desktop/src/features/review/RichDocumentRenderer.tsx` / `.test.tsx` — fixed allowlisted renderer and Tauri asset URL resolution.
- `apps/desktop/src/features/review/ReviewFlashcard.tsx`, `src/features/cards/CardBrowser.tsx`, `TrashPage.tsx` — rich review only; plain-text browser/trash summaries unchanged.
- `apps/desktop/src/features/settings/PixabaySettingsSection.tsx` / `.test.tsx`, `SettingsPage.tsx` — `images` section and Keychain-backed controls.
- `apps/desktop/src/app/routes.ts`, `commandRegistry.ts`, their tests — `SettingsSection = 'images'` and `Settings › Media` Quick Open coverage.
- `apps/desktop/src/components/ScrollArea.tsx`, relevant tests, and feature tests — exact 20px inset and no nested grid scrolling.
- `apps/desktop/src/app/App.tsx` — wire typed APIs into existing composer/settings/review hosts; do not add a new route or command-palette editor action.

## Phase 1: Dependencies, schema, parser/types, and migration tests

### Task 1: Add the approved frontend dependencies and establish type contracts

**Files:**
- Modify: `apps/desktop/package.json`, `apps/desktop/package-lock.json` (or the repository’s checked-in npm lockfile)
- Modify: `apps/desktop/src/domain/learning.ts`
- Create: `apps/desktop/src/domain/richDocument.ts`
- Test: `apps/desktop/src/domain/richDocument.test.ts`, `apps/desktop/src/domain/learning.test.ts`

- [ ] **Step 1: Write failing type/normalization tests**

```ts
import { expect, test } from "vitest";
import { derivePlainText, validateRichDocument, type RichDocument } from "./richDocument";

const document: RichDocument = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }, { type: "hardBreak" }, { type: "text", text: "world" }] }],
};

test("accepts configured nodes and derives stable plain text", () => {
  expect(validateRichDocument(document)).toEqual({ ok: true, value: document });
  expect(derivePlainText(document)).toBe("Hello\nworld");
});

test("rejects caller URLs and an image width outside 10..100", () => {
  expect(validateRichDocument({ type: "doc", content: [{ type: "image", attrs: { mediaId: "m", alt: "x", widthPercent: 9, src: "https://bad" } }] })).toMatchObject({ ok: false });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- --run src/domain/richDocument.test.ts`
Expected: FAIL because `richDocument.ts` and its exported contracts do not exist.

- [ ] **Step 3: Install only the approved Tiptap extensions and define exact JSON contracts**

Run: `npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-underline @tiptap/extension-text-style @tiptap/extension-color @tiptap/extension-highlight @tiptap/extension-text-align @tiptap/extension-image @tiptap/extension-file-handler`

Implement these exported types in `src/domain/richDocument.ts`:

```ts
export type RichImageAttrs = { mediaId: string; alt: string; widthPercent: number };
export type RichMark = { type: "bold" | "italic" | "strike" | "underline" | "textStyle" | "highlight" | "textAlign"; attrs?: Record<string, string | null> };
export type RichNode = { type: "doc" | "paragraph" | "heading" | "bulletList" | "orderedList" | "listItem" | "hardBreak"; attrs?: { level?: 1 | 2 | 3; textAlign?: "left" | "center" | "right" | "justify" }; content?: RichNode[]; marks?: RichMark[]; } | { type: "text"; text: string; marks?: RichMark[] } | { type: "image"; attrs: RichImageAttrs };
export type RichDocument = Extract<RichNode, { type: "doc" }>;
export type RichDocumentValidation = { ok: true; value: RichDocument } | { ok: false; error: string };
export function validateRichDocument(value: unknown): RichDocumentValidation;
export function derivePlainText(document: RichDocument): string;
```

Add the same camelCase fields to `LearningCard`, `CreateCardInput`, and `UpdateCardInput`: `frontDoc: RichDocument | null`, `backDoc: RichDocument | null`, `mediaDraftId: string | null`, and `media: CardMedia[]`; define `CardMedia` with `id`, `cardId`, `mimeType`, `relativePath`, `sourceType`, `pixabayAttribution`, `createdAt`, and `updatedAt`.

- [ ] **Step 4: Run the focused tests and TypeScript build**

Run: `npm test -- --run src/domain/richDocument.test.ts src/domain/learning.test.ts && npm run build`
Expected: PASS for the tests and a successful `tsc && vite build`.

- [ ] **Step 5: Commit the dependency/type contract**

```bash
git add apps/desktop/package.json apps/desktop/package-lock.json apps/desktop/src/domain/richDocument.ts apps/desktop/src/domain/richDocument.test.ts apps/desktop/src/domain/learning.ts apps/desktop/src/domain/learning.test.ts
git commit -m "feat: define rich flashcard document contracts"
```

### Task 2: Add migration 0014 and database fixture coverage

**Files:**
- Create: `apps/desktop/src-tauri/migrations/0014_card_rich_content.sql`
- Modify: `apps/desktop/src-tauri/src/library_db.rs`
- Test: `apps/desktop/src-tauri/src/library_db_tests.rs`

- [ ] **Step 1: Write migration assertions before implementation**

```rust
#[test]
fn migration_0014_has_nullable_docs_and_card_media_constraints() {
    let db = test_database();
    let front: Option<String> = db.connection.query_row("SELECT front_doc_json FROM cards LIMIT 1", [], |row| row.get(0)).unwrap();
    assert!(front.is_none());
    let columns = table_columns(&db.connection, "card_media");
    assert!(columns.contains(&"media_id".to_owned()));
    assert!(columns.contains(&"draft_id".to_owned()));
    assert!(columns.contains(&"source_type".to_owned()));
    assert_eq!(db.connection.query_row("SELECT COUNT(*) FROM schema_migrations WHERE id='0014_card_rich_content'", [], |row| row.get::<_, i64>(0)).unwrap(), 1);
}
```

- [ ] **Step 2: Run the Rust fixture test to verify it fails**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml migration_0014_has_nullable_docs_and_card_media_constraints`
Expected: FAIL because migration `0014_card_rich_content` is not registered and `card_media` is absent.

- [ ] **Step 3: Implement the exact schema and registration**

Create `0014_card_rich_content.sql` with nullable `cards.front_doc_json`/`back_doc_json`, and a `card_media` table containing `id TEXT PRIMARY KEY`, nullable `card_id REFERENCES cards(id) ON DELETE CASCADE`, nullable `draft_id`, `mime_type`, `relative_path`, `source_type CHECK(source_type IN ('file','clipboard','pixabay'))`, nullable `pixabay_attribution`, `byte_size CHECK(byte_size >= 0)`, `created_at`, and `updated_at`, plus indexes on `(card_id)`, `(draft_id)`, and `(created_at)`. Register it as the fourteenth `("0014_card_rich_content", include_str!("../migrations/0014_card_rich_content.sql"))` entry in `MIGRATIONS`.

- [ ] **Step 4: Run migration and full Rust database tests**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml library_db_tests`
Expected: PASS, including fresh-database and already-migrated fixture cases; existing migrations remain unchanged.

- [ ] **Step 5: Commit schema work**

```bash
git add apps/desktop/src-tauri/migrations/0014_card_rich_content.sql apps/desktop/src-tauri/src/library_db.rs apps/desktop/src-tauri/src/library_db_tests.rs
git commit -m "feat: add rich card and media schema"
```

### Task 3: Implement server-side rich parser/validator and derive text

**Files:**
- Create: `apps/desktop/src-tauri/src/rich_document.rs`, `apps/desktop/src-tauri/src/rich_document_tests.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`, `model.rs`

- [ ] **Step 1: Add failing Rust tests for every allowlisted mark/attribute, bounds, and image shape**

```rust
#[test]
fn validates_all_configured_marks_and_rejects_unknown_fields() {
    for mark in ["bold", "italic", "strike", "underline", "textStyle", "highlight", "textAlign"] {
        assert!(validate_json(&doc_with_mark(mark)).is_ok(), "{mark}");
    }
    assert!(validate_json(&json!({"type":"doc","content":[{"type":"video"}]})).is_err());
    assert!(validate_json(&json!({"type":"doc","content":[{"type":"image","attrs":{"mediaId":"m","alt":"a","widthPercent":50,"src":"x"}}]})).is_err());
}

#[test]
fn derives_text_and_enforces_depth_count_text_and_ten_images() {
    assert_eq!(plain_text(&valid_fixture()), "front text\nback text");
    assert!(validate_json(&document_with_image_count(11)).is_err());
    assert!(validate_json(&json!({"type":"doc","content":[{"type":"text","text":3}]})).is_err());
    assert!(validate_json(&deep_document(33)).is_err());
}
```

- [ ] **Step 2: Run focused Rust tests and confirm the validator is missing**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml rich_document_tests`
Expected: FAIL to compile because the module and functions are not yet defined.

- [ ] **Step 3: Implement the exact Rust interface and recursive checks**

```rust
pub const MAX_DOCUMENT_DEPTH: usize = 32;
pub const MAX_DOCUMENT_NODES: usize = 500;
pub const MAX_IMAGES_PER_FACE: usize = 10;
pub fn validate_document(value: &serde_json::Value) -> Result<serde_json::Value, RichDocumentError>;
pub fn plain_text(value: &serde_json::Value) -> String;
```

Accept only `doc`, `paragraph`, `heading` levels 1–3, `text`, `bulletList`, `orderedList`, `listItem`, `hardBreak`, and `image`; accept marks `bold`, `italic`, `strike`, `underline`, `textStyle`, `highlight`, and `textAlign`; reject every unknown key, node, mark, attribute, URL, non-string text, invalid alignment, invalid heading, depth over 32, node count over 500, and image count over 10. Require image attrs to be exactly `{ mediaId: string, alt: string, widthPercent: number }`, with 10–100 inclusive. Derive paragraphs with newline boundaries and text nodes without HTML.

- [ ] **Step 4: Run validator tests and Rust formatting**

Run: `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml -- --check && cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml rich_document_tests`
Expected: formatting check and all rich-document tests PASS.

- [ ] **Step 5: Commit parser work**

```bash
git add apps/desktop/src-tauri/src/rich_document.rs apps/desktop/src-tauri/src/rich_document_tests.rs apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/src/model.rs
git commit -m "feat: validate rich card documents"
```

## Phase 2: Rust Keychain, Pixabay, media lifecycle, and card commands

### Task 4: Implement Keychain-backed Pixabay credentials and SafeSearch client

**Files:**
- Create: `apps/desktop/src-tauri/src/pixabay.rs`, `pixabay_tests.rs`
- Modify: `apps/desktop/src-tauri/src/model.rs`, `lib.rs`, `Cargo.toml`

- [ ] **Step 1: Write mock-HTTP and credential tests**

```rust
#[test]
fn key_lifecycle_uses_the_approved_service() {
    let keychain = FakeKeychain::default();
    save_pixabay_key_with(&keychain, "secret").unwrap();
    assert_eq!(check_pixabay_key_with(&keychain).unwrap(), true);
    delete_pixabay_key_with(&keychain).unwrap();
    assert!(!check_pixabay_key_with(&keychain).unwrap());
    assert_eq!(keychain.service(), "com.library.desktop.pixabay");
}

#[test]
fn search_uses_safesearch_and_returns_exactly_twelve_results() {
    let response = pixabay_response_with(15);
    let result = search_pixabay_with(&MockHttp::responding(response), "cat", 2, "key").unwrap();
    assert_eq!(result.len(), 12);
    assert_eq!(MockHttp::last_query("safesearch"), Some("true"));
    assert_eq!(MockHttp::last_query("page"), Some("2"));
}
```

- [ ] **Step 2: Run the focused tests and verify missing implementation**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml pixabay_tests`
Expected: FAIL to compile until the client and test doubles exist.

- [ ] **Step 3: Implement exact credential/client APIs**

```rust
pub const PIXABAY_KEYCHAIN_SERVICE: &str = "com.library.desktop.pixabay";
pub fn save_pixabay_key(key: String) -> Result<(), String>;
pub fn check_pixabay_key() -> Result<bool, String>;
pub fn delete_pixabay_key() -> Result<(), String>;
pub fn search_pixabay_images(query: String, page: u32) -> Result<Vec<PixabayImage>, String>;
```

Use `keyring` only with that service, never SQLite/localStorage/settings. Use Rust `reqwest` against Pixabay’s API with `safesearch=true`, requested `page`, and `per_page=12`; map only the 12 approved result fields including required attribution and never return the key. Add the Tauri commands to `generate_handler!` and expose them through `model.rs` payloads.

- [ ] **Step 4: Run Rust tests and clippy for this module**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml pixabay_tests && cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings`
Expected: PASS; clippy emits no warnings.

- [ ] **Step 5: Commit Pixabay backend**

```bash
git add apps/desktop/src-tauri/src/pixabay.rs apps/desktop/src-tauri/src/pixabay_tests.rs apps/desktop/src-tauri/src/model.rs apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/Cargo.toml
git commit -m "feat: add keychain-backed pixabay search"
```

### Task 5: Implement media staging, resolution, cleanup, and deletion

**Files:**
- Create: `apps/desktop/src-tauri/src/media.rs`, `media_tests.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`, `commands.rs`, `model.rs`

- [ ] **Step 1: Write lifecycle tests for all three sources and failure ordering**

```rust
#[test]
fn stages_three_sources_promotes_only_referenced_media_and_cleans_drafts() {
    let store = test_media_store();
    let draft = store.stage_file("draft", jpeg_bytes(), "image/jpeg", MediaSource::File).unwrap();
    let clipboard = store.stage_bytes("draft", png_bytes(), "image/png", MediaSource::Clipboard).unwrap();
    let pixabay = store.stage_bytes("draft", webp_bytes(), "image/webp", MediaSource::Pixabay { attribution: "Pixabay".into() }).unwrap();
    store.promote_referenced("card", "draft", &[draft.id.clone(), pixabay.id.clone()]).unwrap();
    assert!(store.card_path("card", &draft.id).unwrap().exists());
    assert!(store.card_path("card", &pixabay.id).unwrap().exists());
    assert!(!store.card_path("card", &clipboard.id).unwrap().exists());
    store.discard_draft("draft").unwrap();
}

#[test]
fn failed_save_keeps_old_files_and_trash_retains_media_until_permanent_delete() {
    let store = test_media_store_with_saved_card("card", "old-media");
    let old_path = store.card_path("card", "old-media").unwrap();
    assert!(store.save_card_with_media("card", invalid_document(), &["new-media".into()]).is_err());
    assert!(old_path.exists());
    store.trash_card("card").unwrap();
    assert!(old_path.exists());
    store.delete_card_permanently("card").unwrap();
    assert!(!old_path.exists());
}
```

- [ ] **Step 2: Run media tests to establish the failing baseline**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml media_tests`
Expected: FAIL because no staging store exists.

- [ ] **Step 3: Implement the exact media service API and path safety**

```rust
pub enum MediaSource { File, Clipboard, Pixabay { attribution: String } }
pub struct StagedMedia { pub id: String, pub draft_id: String, pub mime_type: String, pub relative_path: String, pub source_type: String, pub pixabay_attribution: Option<String> }
pub fn stage_file(&self, draft_id: &str, source: &Path, mime_type: &str, source_type: MediaSource) -> Result<StagedMedia, MediaError>;
pub fn stage_bytes(&self, draft_id: &str, bytes: &[u8], mime_type: &str, source_type: MediaSource) -> Result<StagedMedia, MediaError>;
pub fn promote_referenced(&self, card_id: &str, draft_id: &str, media_ids: &[String]) -> Result<Vec<CardMedia>, MediaError>;
pub fn resolve_for_owner(&self, owner: MediaOwner<'_>, media_id: &str) -> Result<PathBuf, MediaError>;
pub fn discard_draft(&self, draft_id: &str) -> Result<(), MediaError>;
pub fn cleanup_staging_older_than(&self, age: Duration) -> Result<usize, MediaError>;
```

Reject non-JPEG/PNG/WebP/GIF, bytes over 10 MB, traversal/absolute paths, and owner mismatches. Stage at `card-media/staging/<draftId>`, promote referenced rows/files to `card-media/<cardId>` in the card save transaction, delete obsolete media only after commit, clean drafts older than 24 hours at startup, retain Trash media, and delete only on permanent/empty-trash paths. Add commands for stage file/clipboard/Pixabay, discard draft, and resolve `mediaId`; register every command in `lib.rs`.

- [ ] **Step 4: Run lifecycle tests and verify no path escapes**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml media_tests commands_tests`
Expected: PASS for source staging, atomic referenced promotion, discard, stale cleanup, update cleanup after success, Trash retention, permanent delete, Empty Trash, and owner-scoped resolution.

- [ ] **Step 5: Commit media lifecycle**

```bash
git add apps/desktop/src-tauri/src/media.rs apps/desktop/src-tauri/src/media_tests.rs apps/desktop/src-tauri/src/commands.rs apps/desktop/src-tauri/src/model.rs apps/desktop/src-tauri/src/lib.rs
git commit -m "feat: implement card media lifecycle"
```

### Task 6: Persist rich cards and wire Tauri command registration

**Files:**
- Modify: `apps/desktop/src-tauri/src/learning.rs`, `learning_tests.rs`, `model.rs`, `commands.rs`, `commands_tests.rs`, `lib.rs`, `src-tauri/tauri.conf.json`

- [ ] **Step 1: Add failing create/update/hydration tests**

```rust
#[test]
fn create_and_update_card_store_docs_derive_plain_text_and_preserve_source() {
    let mut db = test_database_with_deck_and_source();
    let created = db.create_card(NewCard { front: "derived front".into(), back: "derived back".into(), front_doc_json: Some(valid_front_json()), back_doc_json: Some(valid_back_json()), media_draft_id: Some("draft".into()), ..card_input() }).unwrap();
    assert_eq!(created.front, "derived front");
    assert!(created.front_doc.is_some());
    let updated = db.update_card(UpdateCard { card_id: created.id, front_doc_json: Some(valid_front_json()), back_doc_json: None, media_draft_id: None, ..update_input() }).unwrap();
    assert!(updated.source.is_some());
}
```

- [ ] **Step 2: Run focused Rust tests and verify the new fields fail**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml learning_tests commands_tests`
Expected: FAIL to compile or assert because `NewCard`, `UpdateCard`, and hydration do not yet carry rich fields.

- [ ] **Step 3: Implement persistence and exact command signatures**

Extend `NewCard`/`UpdateCard` with `front_doc_json: Option<serde_json::Value>`, `back_doc_json: Option<serde_json::Value>`, and `media_draft_id: Option<String>`. Validate each document, derive `front`/`back` via `plain_text`, persist JSON in the same transaction as card/source/tags/media, and hydrate `LearningCardSummary { front_doc, back_doc, media, .. }`. Keep `NULL` documents on the legacy path.

Expose these exact Tauri commands in `commands.rs` and add each to `tauri::generate_handler!` in `lib.rs`:

```rust
pub fn create_card(input: CreateCardPayload, state: State<'_, LibraryStore>) -> Result<LearningCardSummary, String>;
pub fn update_card(input: UpdateCardPayload, state: State<'_, LibraryStore>) -> Result<LearningCardSummary, String>;
pub fn stage_card_media(input: StageMediaPayload, state: State<'_, LibraryStore>) -> Result<StagedMediaPayload, String>;
pub fn discard_media_draft(draft_id: String, state: State<'_, LibraryStore>) -> Result<(), String>;
pub fn resolve_card_media(card_id: String, media_id: String, state: State<'_, LibraryStore>) -> Result<String, String>;
```

Ensure `tauri.conf.json` keeps `assetProtocol.scope` restricted to `$APPDATA/**/*`; add no Pixabay origin because search/download occur in Rust. If the Tauri asset URL requires an explicit CSP source, add only `asset:`/`http://asset.localhost`/`https://asset.localhost` to `img-src`, and test that the Pixabay key is absent from generated frontend assets.

- [ ] **Step 4: Run Rust tests and inspect command registration**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml learning_tests commands_tests && cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: PASS, including all existing legacy card tests and the rich create/update/source/media tests; all new commands compile in `generate_handler!`.

- [ ] **Step 5: Commit card command integration**

```bash
git add apps/desktop/src-tauri/src/learning.rs apps/desktop/src-tauri/src/learning_tests.rs apps/desktop/src-tauri/src/model.rs apps/desktop/src-tauri/src/commands.rs apps/desktop/src-tauri/src/commands_tests.rs apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/tauri.conf.json
git commit -m "feat: persist rich cards through tauri"
```

## Phase 3: Frontend editor, renderer, review, composer, picker, settings, registry, and scroll

### Task 7: Add typed frontend invokes and the fixed rich renderer

**Files:**
- Modify: `apps/desktop/src/lib/desktop.ts`, `desktop.test.ts`, `src/lib/learning.ts`, `learning.test.ts`
- Create: `apps/desktop/src/features/review/RichDocumentRenderer.tsx`, `.test.tsx`
- Modify: `apps/desktop/src/features/review/ReviewFlashcard.tsx`, `src-tauri/tauri.conf.json` if asset coverage requires it

- [ ] **Step 1: Write failing wrapper and renderer tests**

```ts
test("resolveCardMedia forwards card and media ownership", async () => {
  const call = vi.fn().mockResolvedValue("asset://local/path");
  await resolveCardMedia("card-1", "media-1", call);
  expect(call).toHaveBeenCalledWith("resolve_card_media", { cardId: "card-1", mediaId: "media-1" });
});

test("renderer maps only fixed elements and never creates HTML", () => {
  const { container } = render(<RichDocumentRenderer document={fixture} resolveMedia={() => "asset://media"} />);
  expect(container.querySelector("img")).toHaveAttribute("src", "asset://media");
  expect(container.querySelector("script")).toBeNull();
  expect(container.innerHTML).not.toContain("dangerouslySetInnerHTML");
});
```

- [ ] **Step 2: Run focused frontend tests and confirm missing exports**

Run: `npm test -- --run src/lib/desktop.test.ts src/lib/learning.test.ts src/features/review/RichDocumentRenderer.test.tsx`
Expected: FAIL because wrappers and renderer do not exist.

- [ ] **Step 3: Implement typed wrappers and renderer**

Add wrappers with signatures `savePixabayKey(key: string)`, `checkPixabayKey()`, `deletePixabayKey()`, `searchPixabayImages(query: string, page: number)`, `stageCardMedia(input: StageMediaInput)`, `discardMediaDraft(draftId: string)`, and `resolveCardMedia(cardId: string, mediaId: string)`. Implement `RichDocumentRenderer({ document, resolveMedia })` by recursively switching over the allowlisted node/mark types and mapping images to `img[src={resolveMedia(node.attrs.mediaId)}]`; ignore invalid nodes, never accept `src`, remote full-size URLs, arbitrary HTML, or `dangerouslySetInnerHTML`. Use it only in review; retain plain `front`/`back` in browser/trash.

- [ ] **Step 4: Run renderer/wrapper tests and build**

Run: `npm test -- --run src/lib/desktop.test.ts src/lib/learning.test.ts src/features/review/RichDocumentRenderer.test.tsx && npm run build`
Expected: PASS and successful build.

- [ ] **Step 5: Commit renderer/API wrappers**

```bash
git add apps/desktop/src/lib/desktop.ts apps/desktop/src/lib/desktop.test.ts apps/desktop/src/lib/learning.ts apps/desktop/src/lib/learning.test.ts apps/desktop/src/features/review/RichDocumentRenderer.tsx apps/desktop/src/features/review/RichDocumentRenderer.test.tsx apps/desktop/src/features/review/ReviewFlashcard.tsx
git commit -m "feat: render rich cards through local assets"
```

### Task 8: Build CardRichTextEditor with Tiptap allowlist and focused media behavior

**Files:**
- Create: `apps/desktop/src/features/cards/CardRichTextEditor.tsx`, `.test.tsx`, `CardRichTextEditor.css`
- Modify: `apps/desktop/src/components/ScrollArea.tsx` only if the existing component lacks the required content hook

- [ ] **Step 1: Write failing editor tests for toolbar, focus, insertion limits, resize, and deletion**

```tsx
test("toolbar affects only the focused face and inserts accepted images", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<CardRichTextEditor ariaLabel="Back" value={emptyDoc} onChange={onChange} onStageMedia={vi.fn().mockResolvedValue({ id: "m1" })} />);
  await user.click(screen.getByRole("button", { name: "Bold" }));
  expect(screen.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Heading 3" })).toBeInTheDocument();
});

test.each(["image/png", "image/jpeg", "image/webp", "image/gif"])("accepts %s under 10 MB", async (type) => { /* upload exact File and assert mediaDraftId node */ });
test("rejects the eleventh image, oversized files, and unsupported MIME", async () => { /* assert visible validation and unchanged doc */ });
```

- [ ] **Step 2: Run the editor tests to verify the component is absent**

Run: `npm test -- --run src/features/cards/CardRichTextEditor.test.tsx`
Expected: FAIL because the editor component is not present.

- [ ] **Step 3: Implement the editor with exact extensions and callbacks**

Configure `StarterKit`, `Underline`, `TextStyle`, `Color`, `Highlight`, `TextAlign.configure({ types: ["heading", "paragraph"] })`, `Image` with only `{ mediaId, alt, widthPercent }`, and `FileHandler`. Export `CardRichTextEditorProps = { ariaLabel: string; value: RichDocument; disabled?: boolean; onChange(document: RichDocument): void; onStageMedia(file: File | Blob, sourceType: "file" | "clipboard" | "pixabay"): Promise<{ id: string; attribution?: string }>; onDiscardMedia?(mediaId: string): void }`. Render undo/redo, bold, italic, underline, strike, color, highlight, paragraph/heading 1–3, bullet/ordered list, alignment, image, and clear-format commands against the focused editor only. Handle repeated cursor insertion, paste/drop, keyboard image deletion, and `widthPercent` resizing from 10–100. Wrap editor content in `ScrollArea` and give its immediate content wrapper exactly `paddingRight: "20px"`; do not add `overflow: auto`.

- [ ] **Step 4: Run editor tests and the scroll regression suite**

Run: `npm test -- --run src/features/cards/CardRichTextEditor.test.tsx src/components/ScrollArea.test.tsx`
Expected: PASS for toolbar allowlisting, focused commands, paste/drop, file limits, resize/delete, and existing ScrollArea behavior.

- [ ] **Step 5: Commit the editor**

```bash
git add apps/desktop/src/features/cards/CardRichTextEditor.tsx apps/desktop/src/features/cards/CardRichTextEditor.test.tsx apps/desktop/src/features/cards/CardRichTextEditor.css
git commit -m "feat: add rich card text editor"
```

### Task 9: Replace composer textareas while preserving translation/source semantics

**Files:**
- Modify: `apps/desktop/src/features/cards/CardComposer.tsx`, `CardComposer.test.tsx`, `apps/desktop/src/app/App.tsx`
- Modify: `apps/desktop/src/domain/learning.ts`, `src/lib/learning.ts` if payload definitions were not completed in Task 1

- [ ] **Step 1: Write failing composer tests**

```tsx
test("creates paragraphs for empty Back and inserts translation at the selection otherwise", async () => {
  const user = userEvent.setup();
  const onTranslate = vi.fn().mockResolvedValue("translated");
  render(<CardComposer {...props} onTranslate={onTranslate} />);
  await user.click(screen.getByRole("button", { name: "Translate" }));
  expect(onTranslate).toHaveBeenCalledWith("front text");
  expect(screen.getByRole("textbox", { name: "Back" })).toBeInTheDocument();
});

test("hides source preview after source is saved without dropping rich docs", () => {
  render(<CardComposer {...props} draft={{ ...draft, saved: true }} />);
  expect(screen.queryByText("Source preview")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run composer tests and observe textarea-era failures**

Run: `npm test -- --run src/features/cards/CardComposer.test.tsx`
Expected: FAIL on rich editor/translation/source cases before replacement.

- [ ] **Step 3: Implement exact composer state and save payload**

Replace `front`/`back` textareas with two `CardRichTextEditor` instances, maintain `frontDoc`/`backDoc`, derive displayed text with `derivePlainText`, and submit `CardSaveInput = { deckName, front, back, frontDoc, backDoc, mediaDraftId, source, tags, frontLanguage }`. Keep the Pixabay button adjacent to Translate, target Back, query `derivePlainText(frontDoc)`, and implement translation as a paragraph when Back is empty or an insertion at the current selection when non-empty. Hide the source preview once the draft has a saved source; source metadata edits must not replace document/media state. Pass the existing create/edit handlers through `App.tsx` unchanged except for the added rich fields.

- [ ] **Step 4: Run composer and existing card tests**

Run: `npm test -- --run src/features/cards/CardComposer.test.tsx src/features/cards/CardBrowser.test.tsx src/features/cards/TrashPage.test.tsx`
Expected: PASS; browser/trash assertions continue to use plain-text summaries.

- [ ] **Step 5: Commit composer integration**

```bash
git add apps/desktop/src/features/cards/CardComposer.tsx apps/desktop/src/features/cards/CardComposer.test.tsx apps/desktop/src/app/App.tsx apps/desktop/src/domain/learning.ts apps/desktop/src/lib/learning.ts
git commit -m "feat: integrate rich documents into card composer"
```

### Task 10: Add Pixabay/local media picker and settings Keychain controls

**Files:**
- Create: `apps/desktop/src/features/cards/MediaPicker.tsx`, `.test.tsx`
- Create: `apps/desktop/src/features/settings/PixabaySettingsSection.tsx`, `.test.tsx`
- Modify: `apps/desktop/src/features/cards/CardComposer.tsx`, `SettingsPage.tsx`, `SettingsPage.test.tsx`, `App.tsx`

- [ ] **Step 1: Write failing picker/settings state tests**

```tsx
test("Pixabay picker covers setup, empty, attribution, failure, and retry", async () => {
  const search = vi.fn().mockRejectedValueOnce(new Error("download failed")).mockResolvedValueOnce([result]);
  render(<MediaPicker frontText="cat" onSearch={search} onStage={vi.fn()} hasKey={false} />);
  expect(screen.getByText("Set up Pixabay in Settings › Media")).toBeInTheDocument();
  // rerender with hasKey and assert loading, empty, attribution, failure, and Retry.
});

test("images settings never writes the key to localStorage", async () => {
  const save = vi.fn();
  render(<PixabaySettingsSection check={vi.fn().mockResolvedValue(false)} save={save} remove={vi.fn()} />);
  await userEvent.setup().type(screen.getByLabelText("Pixabay API key"), "secret");
  await userEvent.setup().click(screen.getByRole("button", { name: "Save" }));
  expect(save).toHaveBeenCalledWith("secret");
  expect(localStorage.getItem("pixabay")).toBeNull();
});
```

- [ ] **Step 2: Run focused tests to establish absent components**

Run: `npm test -- --run src/features/cards/MediaPicker.test.tsx src/features/settings/PixabaySettingsSection.test.tsx`
Expected: FAIL because the components are not present.

- [ ] **Step 3: Implement picker/settings behavior**

Implement `MediaPickerProps = { frontText: string; hasKey: boolean; onSearch(query: string, page: number): Promise<PixabayImage[]>; onStage(result: PixabayImage): Promise<void> }`. Render the grid below Tags, call `onSearch(frontText, page)`, show loading/no-key/setup/empty/results/attribution/download-failure/retry states, and stage the full Rust-downloaded image before inserting its exact media node. Add `SettingsSection = "images"`, `PixabaySettingsSection` props `check`, `save`, and `remove`, and use only typed Tauri callbacks; add no localStorage, SQLite, remote image, or command-palette action.

- [ ] **Step 4: Run picker/settings tests and build**

Run: `npm test -- --run src/features/cards/MediaPicker.test.tsx src/features/settings/PixabaySettingsSection.test.tsx src/features/settings/SettingsPage.test.tsx && npm run build`
Expected: PASS and successful build.

- [ ] **Step 5: Commit picker/settings UI**

```bash
git add apps/desktop/src/features/cards/MediaPicker.tsx apps/desktop/src/features/cards/MediaPicker.test.tsx apps/desktop/src/features/settings/PixabaySettingsSection.tsx apps/desktop/src/features/settings/PixabaySettingsSection.test.tsx apps/desktop/src/features/cards/CardComposer.tsx apps/desktop/src/features/settings/SettingsPage.tsx apps/desktop/src/features/settings/SettingsPage.test.tsx apps/desktop/src/app/App.tsx
git commit -m "feat: add pixabay picker and media settings"
```

### Task 11: Register Settings › Media and verify command/scroll rules

**Files:**
- Modify: `apps/desktop/src/app/routes.ts`, `commandRegistry.ts`, `commandRegistry.test.ts`, `SettingsPage.tsx`
- Modify: `apps/desktop/src/features/cards/MediaPicker.tsx`, `CardRichTextEditor.tsx`, and their tests

- [ ] **Step 1: Load the command-registration and scroll-surface skills before implementation**

Follow `checking-command-registration`: this is a public Settings destination, so update `PUBLIC_ROUTE_CATALOG` and the derived Quick Open destination, not `App.tsx` legacy arrays; add no command-palette editor action. Follow `checking-scroll-surfaces`: use `ScrollArea`, reserve exactly 20px on immediate content, and test the native-track reset plus inset and parent-scroll decisions.

- [ ] **Step 2: Write failing registry and scroll assertions**

```ts
test("registers Settings › Media as Quick Open only", async () => {
  expect(PUBLIC_ROUTE_CATALOG.settingsMedia).toEqual({ id: "route.settings.images", title: "Media", aliases: ["images", "pixabay"], breadcrumb: ["Settings", "Media"], route: { name: "settings", section: "images" } });
  const entries = await createCommandRegistry(createContext()).search("quick-open", "pixabay");
  expect(entries[0]).toMatchObject({ id: "route.settings.images", surface: "quick-open", breadcrumb: ["Settings", "Media"] });
  await expect(createCommandRegistry(createContext()).search("command-palette", "pixabay")).resolves.toEqual([]);
});

test("rich surfaces use ScrollArea with 20px inset and parent-owned grid scrolling", () => {
  expect(editorSource).toContain("<ScrollArea");
  expect(editorSource).toContain('paddingRight: "20px"');
  expect(pickerSource).toContain("<ScrollArea");
  expect(pickerSource).toContain('paddingRight: "20px"');
  expect(pickerSource).not.toMatch(/overflow(?:Y)?\s*:\s*["']auto/);
});
```

- [ ] **Step 3: Run focused tests and confirm they fail before registration/inset changes**

Run: `npm test -- --run src/app/commandRegistry.test.ts src/features/cards/CardRichTextEditor.test.tsx src/features/cards/MediaPicker.test.tsx`
Expected: FAIL on the missing `images` catalog entry and exact scroll assertions.

- [ ] **Step 4: Implement registration and parent-scroll layout**

Add `images` to `SettingsSection`, add a `PUBLIC_ROUTE_CATALOG` entry with id `route.settings.images`, title `Media`, aliases `images`/`pixabay`, breadcrumb `['Settings','Media']`, and route `{ name: 'settings', section: 'images' }`; render it from `SettingsPage` as the Media section. Put both editor and result grid inside `ScrollArea` with immediate content `paddingRight: "20px"`; the result grid itself must not set `overflow`, and all colors must use existing tokens. Add the required native WKWebView track reset assertion to the relevant style/test fixture.

- [ ] **Step 5: Run registry/scroll checks**

Run: `npm test -- --run src/app/commandRegistry.test.ts src/components/ScrollArea.test.tsx src/features/cards/CardRichTextEditor.test.tsx src/features/cards/MediaPicker.test.tsx`
Expected: PASS; Quick Open finds Settings › Media, command palette has no Pixabay editor action, and exact ScrollArea/inset/parent-scroll checks pass.

- [ ] **Step 6: Commit registration and scroll coverage**

```bash
git add apps/desktop/src/app/routes.ts apps/desktop/src/app/commandRegistry.ts apps/desktop/src/app/commandRegistry.test.ts apps/desktop/src/features/settings/SettingsPage.tsx apps/desktop/src/features/cards/MediaPicker.tsx apps/desktop/src/features/cards/CardRichTextEditor.tsx apps/desktop/src/features/cards/MediaPicker.test.tsx apps/desktop/src/features/cards/CardRichTextEditor.test.tsx
git commit -m "feat: register media settings and protect scroll surfaces"
```

## Phase 4: Integration, full verification, and fresh runtime

### Task 12: Add end-to-end rich-card integration coverage

**Files:**
- Create or modify: `apps/desktop/e2e/rich-flashcards-pixabay.spec.ts` (follow the existing Playwright directory/config)
- Modify: `apps/desktop/src/app/App.test.tsx`, `ReviewPage.test.tsx`, `CardBrowser.test.tsx`, `TrashPage.test.tsx`

- [ ] **Step 1: Add failing integration scenarios**

```ts
test("creates, reopens, reviews, translates, and deletes a rich card without losing media", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New card" }).click();
  await page.getByRole("textbox", { name: "Front" }).fill("cat");
  await page.getByRole("textbox", { name: "Back" }).fill("gato");
  await page.getByRole("button", { name: "Save card" }).click();
  await expect(page.getByText("cat")).toBeVisible();
  await page.getByRole("button", { name: /Review/ }).click();
  await expect(page.locator("img")).toHaveAttribute("src", /asset:/);
});
```

- [ ] **Step 2: Run the focused integration command and verify baseline failure**

Run: `npm run test:e2e -- --grep "rich card"`
Expected: FAIL until the complete editor, backend, and test fixtures are wired.

- [ ] **Step 3: Add fixtures for legacy/null docs, all three media sources, Pixabay failure/retry, source preview, translation, Trash, permanent delete, and stale cleanup**

Use isolated temporary app data per test; seed legacy cards with `front_doc_json = NULL` and assert the plain editor/review path. Stub Pixabay at the Rust HTTP boundary, never in WebView, and assert no key appears in DOM/localStorage/build output. Assert the browser/trash rows contain derived plain text only.

- [ ] **Step 4: Run the complete specified suites**

Run from `apps/desktop`:

```sh
npm run test
npm run build
npm run test:e2e
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: all Vitest, TypeScript/Vite build, Playwright, and Rust tests PASS; Rust coverage includes migration, validation every Tiptap mark/attribute, derivation, all media lifecycle branches, Keychain lifecycle, SafeSearch/exact 12, and path resolution.

- [ ] **Step 5: Commit integration coverage**

```bash
git add apps/desktop/e2e apps/desktop/src/app/App.test.tsx apps/desktop/src/features/review/ReviewPage.test.tsx apps/desktop/src/features/cards/CardBrowser.test.tsx apps/desktop/src/features/cards/TrashPage.test.tsx
git commit -m "test: cover rich flashcard pixabay flows"
```

### Task 13: Fresh macOS runtime verification and release build

**Files:**
- No production file changes unless a verified build failure requires a narrowly scoped fix; update the relevant test/plan commit instead.

- [ ] **Step 1: Record the exact checkout and running processes before launch**

Run: `git rev-parse --short HEAD && git status --short && ps ax -o pid=,command= | egrep 'tauri dev|vite|library_desktop' || true`
Expected: record revision/status and identify every running process; do not reuse an old app/window or another worktree’s server.

- [ ] **Step 2: Build and launch only the fresh release artifact**

From `apps/desktop`, record the build start time, run `npm run tauri build`, then launch only `apps/desktop/src-tauri/target/release/bundle/macos/Library.app`; confirm its modification time is newer than build start. Do not replace `/Applications/Library.app`.

- [ ] **Step 3: Manually verify the approved flows in both themes**

Verify rich front/back create/save/reopen/review, repeated/pasted/dropped images, 10–100% resize, Pixabay Keychain save/check/delete and SafeSearch results, no-key/setup/retry/download failure, source-preview hiding, Back translation insertion, discard/stale cleanup, Trash retention, permanent deletion/Empty Trash, and light/dark ScrollArea behavior with no white native track or thumb overlap.

- [ ] **Step 4: Record artifact evidence and do not overclaim**

Report the recorded commit, launch mode (`tauri dev` or release), exact artifact path, and fresh runtime observations. Unit tests/builds alone do not prove WKWebView media, focus, asset, or scrollbar behavior.

## Self-review results

- **Spec coverage:** Every approved section maps to a task: nullable `0014` schema and fixtures (Task 2), recursive allowlist and all configured marks/attributes (Task 3), Keychain/SafeSearch/exact 12 (Task 4), all media sources and atomic lifecycle/Trash semantics (Task 5), rich card commands and Tauri registration/CSP/assets (Task 6), fixed local renderer and plain-text legacy surfaces (Task 7), editor/translation/composer behavior (Tasks 8–9), picker/settings (Task 10), Quick Open and ScrollArea requirements explicitly loaded and tested (Task 11), integration commands and fresh runtime evidence (Tasks 12–13).
- **Prohibited-placeholder scan:** No implementation step uses `TBD`, `TODO`, “implement later”, “add appropriate error handling”, or an unqualified “write tests”; code steps include concrete signatures, SQL field names, JSX/API assertions, commands, and expected results. The media failure-order test contains explicit old-file, Trash-retention, and permanent-delete assertions.
- **Type consistency:** `RichDocument`, `RichImageAttrs`, `CardMedia`, `frontDoc`, `backDoc`, and `mediaDraftId` are introduced once and reused across Rust serde payloads, frontend domain types, editor props, renderer props, and create/update inputs. `SettingsSection = 'images'`, route id `route.settings.images`, and breadcrumb `['Settings','Media']` are consistent across routes, registry, SettingsPage, and tests. Media ownership is consistently `(cardId, mediaId)` for saved cards and `(draftId, mediaId)` for staging.
