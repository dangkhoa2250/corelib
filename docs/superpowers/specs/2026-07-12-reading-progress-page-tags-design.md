# Reading Progress Bar + Page Tags

## Overview

Two features for the PDF reader:
1. **Reading progress bar** — show % read under each book thumbnail in the library grid (like Amazon Kindle).
2. **Page tags** — bookmark specific pages for quick navigation, via a tag icon in the reader header.

Opening at the last-read page already works (`document.lastReadPage` → `ReaderPage` initial page). No changes needed there.

---

## Part 1: Reading Progress

### Problem

`LibraryDocument` has `lastReadPage` but no `numPages`. Without total pages we can't show a percentage.

### Database Changes

**Migration `0008_page_count.sql`:**
```sql
ALTER TABLE documents ADD COLUMN num_pages INTEGER;
```

**`library_db.rs`:**
- `SUMMARY_COLUMNS` → append `, num_pages`
- `summary_from_row` → read column 8 as `num_pages: Option<i64>`
- `set_index_ready` signature → add `num_pages: i64` parameter, store via `UPDATE documents SET ... num_pages = ?`

**`model.rs`:**
- `DocumentSummary` → add `#[serde(rename = "numPages")] pub num_pages: Option<i64>`

### Indexer Changes

**Goal:** Extract page count during indexing without a second PDF load.

**Worker protocol change:** Worker output format changes from raw text to `{page_count}\n{text}`.

- `extract_pdf_text_in_worker` → `format!("{}\n{}", pages.len(), extracted)`
- `extract_pdf_text_with_worker` → parse first line as page count, return `(String, usize)`
- `extract_pdf_text` → return type `Result<(String, usize), String>`
- `index_document_with` closure bound → `F: FnOnce(&Path) -> Result<(String, usize), String>`
- On success, pass page count to `set_index_ready(id, &text, None, page_count)`

**Test updates:**
- `indexer_tests.rs` mock closures: `|_| Ok(("text".to_owned(), 3))` instead of `|_| Ok("text".to_owned())`

### Frontend Changes

**`domain/document.ts`:**
- `LibraryDocument` → add `numPages: number | null`

**`DocumentCard.tsx`:**
- Under `.document-card__title`, if `lastReadPage && numPages`, render:
  - Thin progress bar (3px): `.document-card__progress-track` + `.document-card__progress-fill`
  - Fill width = `(lastReadPage / numPages) * 100%`

---

## Part 2: Page Tags

### Database Changes

**Migration `0009_page_tags.sql`:**
```sql
CREATE TABLE IF NOT EXISTS page_tags (
  id TEXT PRIMARY KEY NOT NULL,
  document_id TEXT NOT NULL,
  page INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  UNIQUE (document_id, page)
);
CREATE INDEX IF NOT EXISTS page_tags_document_id ON page_tags (document_id);
```

### Rust Backend

**`model.rs`:**
```rust
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PageTagSummary {
    pub id: String,
    #[serde(rename = "documentId")]
    pub document_id: String,
    pub page: i64,
}
```

**`library_db.rs`:**
- `list_page_tags(doc_id: &str) -> Result<Vec<PageTagSummary>>`
- `toggle_page_tag(doc_id: &str, page: i64) -> Result<Vec<PageTagSummary>>` — INSERT or DELETE based on existence, then return full list for that document
- `delete_page_tag(tag_id: &str) -> Result<()>`

**`commands.rs`:**
- `#[tauri::command] list_page_tags(id: String, state) -> Result<Vec<PageTagSummary>, String>`
- `#[tauri::command] toggle_page_tag(document_id: String, page: i64, state) -> Result<Vec<PageTagSummary>, String>`
- Register both in `lib.rs` `invoke_handler`

### Frontend Changes

**`lib/desktop.ts`:**
- `listPageTags(id, call)` → invoke `"list_page_tags"`
- `togglePageTag(documentId, page, call)` → invoke `"toggle_page_tag"`

**`domain/document.ts`:**
- `PageTag` interface: `{ id, documentId, page }`

**`ReaderPage.tsx`:**
- New props: `listPageTags: (docId: string) => Promise<PageTag[]>`, `togglePageTag: (docId: string, page: number) => Promise<PageTag[]>`
- State: `pageTags: PageTag[]`, `tagMenuOpen: boolean`
- `useEffect` on mount → load tags for current document
- Header: tag icon button next to page indicator (between "Page X of Y" and next-page button)
- Dropdown panel when `tagMenuOpen`:
  - First row: "Tag Page X" / "Untag Page X" (toggles current page)
  - List of tagged pages: "Page 5", "Page 12", etc. → click → `handlePageSelect(page)` + close panel
  - Empty state: "No tagged pages yet"
- Thumbnail sidebar: small dot/ribbon indicator on tagged pages

**`App.tsx`:**
- Wire `listPageTags` and `togglePageTag` to `libraryApi` or native functions
- Pass to `ReaderPage`

---

## File Change Summary

| File | Change |
|---|---|
| `migrations/0008_page_count.sql` | New — add `num_pages` column |
| `migrations/0009_page_tags.sql` | New — create `page_tags` table |
| `library_db.rs` | `SUMMARY_COLUMNS`, `summary_from_row`, `set_index_ready`, page tag methods |
| `model.rs` | `DocumentSummary.num_pages`, `PageTagSummary` |
| `indexer.rs` | Worker protocol + closure return type |
| `commands.rs` | `list_page_tags`, `toggle_page_tag` commands |
| `lib.rs` | Register new commands |
| `desktop.ts` | `listPageTags`, `togglePageTag` wrappers |
| `domain/document.ts` | `LibraryDocument.numPages`, `PageTag` interface |
| `DocumentCard.tsx` | Progress bar under title |
| `ReaderPage.tsx` | Tag icon, dropdown, thumbnail indicators |
| `App.tsx` | Wire tag callbacks to ReaderPage |
| `tokens.css` | Progress bar + tag dropdown styles |
| Tests | Update indexer mocks, add page tag DB tests |

## Risks

- **Worker protocol change**: Existing un-indexed documents will be re-indexed with the new protocol. The old format (raw text) would fail to parse the first line as a number, triggering a re-index. This is acceptable — failed indexing already sets status to "failed" and documents remain readable.
- **num_pages may be null**: For documents indexed before this change, `num_pages` will be NULL until re-indexed. The progress bar simply won't show for those.
