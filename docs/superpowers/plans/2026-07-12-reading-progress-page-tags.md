# Reading Progress Bar + Page Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reading progress bar (%) under book thumbnails in the library grid, and page tag/bookmark functionality with quick navigation in the PDF reader header.

**Architecture:** Two independent features sharing the same DB migration pattern. Progress bar: add `num_pages` column, extract page count during indexing, render % bar in DocumentCard. Page tags: new `page_tags` table, toggle/list commands, tag icon + dropdown in ReaderPage header.

**Tech Stack:** Rust (Tauri v2, rusqlite, lopdf), React 19, TypeScript, Vitest, CSS

---

## Task 1: DB Migration 0008 — num_pages Column

**Files:**
- Create: `apps/desktop/src-tauri/migrations/0008_page_count.sql`
- Modify: `apps/desktop/src-tauri/src/library_db.rs`
- Modify: `apps/desktop/src-tauri/src/model.rs`
- Modify: `apps/desktop/src-tauri/src/library_db_tests.rs`

- [ ] **Step 1: Create migration SQL**

Create `apps/desktop/src-tauri/migrations/0008_page_count.sql`:

```sql
ALTER TABLE documents ADD COLUMN num_pages INTEGER;
```

- [ ] **Step 2: Register migration in library_db.rs**

In `apps/desktop/src-tauri/src/library_db.rs`, add to the `MIGRATIONS` array after the `0007` entry (line ~41):

```rust
    (
        "0008_page_count",
        include_str!("../migrations/0008_page_count.sql"),
    ),
```

Update `MIGRATIONS` array length from `[(&str, &str); 7]` to `[(&str, &str); 8]` on line 13.

- [ ] **Step 3: Update SUMMARY_COLUMNS**

In `apps/desktop/src-tauri/src/library_db.rs`, update the constant at line 43:

```rust
const SUMMARY_COLUMNS: &str =
    "id, title, author, source, cover_path, index_state, status, last_read_page, num_pages";
```

- [ ] **Step 4: Update summary_from_row**

In `apps/desktop/src-tauri/src/library_db.rs`, update `summary_from_row` (line 521):

```rust
fn summary_from_row(row: &Row<'_>) -> rusqlite::Result<DocumentSummary> {
    let index_state: String = row.get(5)?;
    Ok(DocumentSummary {
        id: row.get(0)?,
        title: row.get(1)?,
        author: row.get(2)?,
        source: row.get(3)?,
        cover_url: row.get(4)?,
        indexed: index_state == "ready",
        status: row.get(6)?,
        last_read_page: row.get(7)?,
        num_pages: row.get(8)?,
    })
}
```

- [ ] **Step 5: Add num_pages to DocumentSummary**

In `apps/desktop/src-tauri/src/model.rs`, add field to `DocumentSummary` struct (after `last_read_page`):

```rust
    #[serde(rename = "lastReadPage")]
    pub last_read_page: Option<i64>,
    #[serde(rename = "numPages")]
    pub num_pages: Option<i64>,
```

- [ ] **Step 6: Update set_index_ready signature**

In `apps/desktop/src-tauri/src/library_db.rs`, update `set_index_ready` (line 270):

```rust
    pub fn set_index_ready(
        &mut self,
        id: &str,
        text: &str,
        cover_path: Option<&str>,
        num_pages: i64,
    ) -> Result<()> {
        let transaction = self.connection.transaction()?;
        let updated = transaction.execute(
            "UPDATE documents
             SET status = 'ready', index_state = 'ready',
                 cover_path = COALESCE(?1, cover_path), num_pages = ?2,
                 index_claimed_at = NULL, updated_at = ?3
             WHERE id = ?4",
            params![cover_path, num_pages, portable_timestamp(), id],
        )?;
        if updated == 0 {
            return Err(LibraryDbError::DocumentNotFound);
        }
        transaction.execute(
            "DELETE FROM document_text WHERE document_id = ?1",
            params![id],
        )?;
        transaction.execute(
            "INSERT INTO document_text (document_id, body) VALUES (?1, ?2)",
            params![id, text],
        )?;
        transaction.commit()?;
        Ok(())
    }
```

- [ ] **Step 7: Update set_index_ready test call**

In `apps/desktop/src-tauri/src/library_db_tests.rs`, update the `set_index_ready` call at line ~86 to add `0` as the num_pages argument:

```rust
    database
        .set_index_ready(
            "searchable",
            "Fourier transforms reveal hidden frequencies",
            None,
            0,
        )
        .expect("store extracted text");
```

- [ ] **Step 8: Run cargo test to verify**

Run: `cargo test --lib 2>&1 | tail -5`
Expected: all tests pass (may have compiler errors from indexer — fix in Task 2)

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/src-tauri/migrations/0008_page_count.sql apps/desktop/src-tauri/src/library_db.rs apps/desktop/src-tauri/src/model.rs apps/desktop/src-tauri/src/library_db_tests.rs
git commit -m "feat: add num_pages column to documents table"
```

---

## Task 2: Indexer — Page Count Extraction

**Files:**
- Modify: `apps/desktop/src-tauri/src/indexer.rs`
- Modify: `apps/desktop/src-tauri/src/indexer_tests.rs`
- Modify: `apps/desktop/src-tauri/src/commands.rs` (save_cover path calls set_index_ready indirectly — check)

- [ ] **Step 1: Update worker output format**

In `apps/desktop/src-tauri/src/indexer.rs`, update `extract_pdf_text_in_worker` (line 162) to prepend page count:

```rust
fn extract_pdf_text_in_worker(path: &Path) -> Result<String, String> {
    validate_pdf_input_size(path)?;
    let document = Document::load(path).map_err(|_| "PDF text extraction failed".to_owned())?;
    if document.is_encrypted() {
        return Err("PDF text extraction failed".to_owned());
    }
    let pages = document.get_pages();
    if pages.len() > MAX_PDF_PAGE_COUNT {
        return Err("PDF text extraction failed".to_owned());
    }

    let page_count = pages.len();
    let mut extracted = String::new();
    for page in pages.into_keys() {
        let page_text = document
            .extract_text(&[page])
            .map_err(|_| "PDF text extraction failed".to_owned())?;
        if extracted
            .len()
            .checked_add(page_text.len())
            .is_none_or(|length| length > MAX_EXTRACTED_TEXT_BYTES)
        {
            return Err("PDF text extraction failed".to_owned());
        }
        extracted.push_str(&page_text);
    }
    Ok(format!("{}\n{}", page_count, extracted))
}
```

- [ ] **Step 2: Update extract_pdf_text_with_worker to return (String, usize)**

In `apps/desktop/src-tauri/src/indexer.rs`, update `extract_pdf_text_with_worker` — change the final return parsing (around line 123):

```rust
                let bytes = match output {
                    Some(bytes) => bytes,
                    None => match output_receiver.recv_timeout(Duration::from_secs(1)) {
                        Ok(Ok(bytes)) => bytes,
                        Ok(Err(())) | Err(_) => return Err(extraction_error()),
                    },
                };
                let full = String::from_utf8(bytes).map_err(|_| extraction_error())?;
                let newline = full.find('\n').ok_or_else(extraction_error)?;
                let page_count: usize = full[..newline]
                    .parse()
                    .map_err(|_| extraction_error())?;
                Ok((full[newline + 1..].to_owned(), page_count))
```

- [ ] **Step 3: Update extract_pdf_text return type**

In `apps/desktop/src-tauri/src/indexer.rs`, update `extract_pdf_text` (line 65) and the test branch:

```rust
pub(crate) fn extract_pdf_text(path: &Path) -> Result<(String, usize), String> {
    #[cfg(test)]
    {
        extract_pdf_text_in_worker(path)
    }

    #[cfg(not(test))]
    {
        let worker = env::current_exe().map_err(|_| extraction_error())?;
        extract_pdf_text_with_worker(path, &worker)
    }
}
```

- [ ] **Step 4: Update index_document_with closure bound + set_index_ready call**

In `apps/desktop/src-tauri/src/indexer.rs`, update `index_document_with` (line 42):

```rust
pub fn index_document_with<F>(
    database: &Arc<Mutex<LibraryDatabase>>,
    id: &str,
    path: &Path,
    extract: F,
) where
    F: FnOnce(&Path) -> Result<(String, usize), String>,
{
    let extracted = catch_unwind(AssertUnwindSafe(|| extract(path)))
        .unwrap_or_else(|_| Err("PDF text extraction failed".to_owned()));

    if let Ok(mut database) = database.lock() {
        match extracted {
            Ok((text, page_count)) => {
                let _ = database.set_index_ready(id, &text, None, page_count as i64);
            }
            Err(_) => {
                let _ = database.set_index_failed(id);
            }
        }
    }
}
```

- [ ] **Step 5: Update indexer test mocks**

In `apps/desktop/src-tauri/src/indexer_tests.rs`, update the two closure-based calls.

Line ~95 (failure test — no change needed, already returns Err):
```rust
    index_document_with(
        &database,
        "indexed",
        Path::new("/managed/indexed.pdf"),
        |_| Err("encrypted PDF".to_owned()),
    );
```

Line ~117 (success test):
```rust
    index_document_with(
        &database,
        "indexed",
        Path::new("/managed/indexed.pdf"),
        |_| Ok(("Tensor calculus for physics".to_owned(), 5)),
    );
```

- [ ] **Step 6: Check for other set_index_ready callers**

Search for any other `.set_index_ready(` calls in the Rust codebase and add the `num_pages` argument (`0` if unknown):

Run: `rg "\.set_index_ready\(" apps/desktop/src-tauri/src/`

Update every call site to include the new `num_pages: i64` parameter.

- [ ] **Step 7: Run cargo test**

Run: `cargo test --lib 2>&1 | tail -5`
Expected: all 99+ tests pass

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src-tauri/src/indexer.rs apps/desktop/src-tauri/src/indexer_tests.rs
git commit -m "feat: extract and store page count during indexing"
```

---

## Task 3: Frontend — Progress Bar in DocumentCard

**Files:**
- Modify: `apps/desktop/src/domain/document.ts`
- Modify: `apps/desktop/src/features/library/DocumentCard.tsx`
- Modify: `apps/desktop/src/styles/tokens.css`
- Modify: `apps/desktop/src/features/library/DocumentCard.test.tsx`

- [ ] **Step 1: Add numPages to LibraryDocument**

In `apps/desktop/src/domain/document.ts`, add field:

```typescript
export interface LibraryDocument {
  id: string;
  title: string;
  author: string | null;
  source: DocumentSource;
  coverUrl: string | null;
  indexed: boolean;
  status: DocumentStatus;
  lastReadPage: number | null;
  numPages: number | null;
}
```

- [ ] **Step 2: Update test fixtures with numPages**

In `apps/desktop/src/features/library/DocumentCard.test.tsx` and `apps/desktop/src/features/reader/ReaderPage.test.tsx`, add `numPages: null` (or a number) to every `LibraryDocument` fixture.

Run: `rg "lastReadPage:" apps/desktop/src --include="*.tsx" --include="*.ts" -l`
Then add `numPages` to each fixture.

- [ ] **Step 3: Add progress bar to DocumentCard**

In `apps/desktop/src/features/library/DocumentCard.tsx`, after the title/author/status spans inside the `<button>` (around line 157-163), add a progress bar:

```tsx
        {document.lastReadPage && document.numPages && document.numPages > 0 ? (
          <span className="document-card__progress">
            <span className="document-card__progress-track">
              <span
                className="document-card__progress-fill"
                style={{ width: `${Math.round((document.lastReadPage / document.numPages) * 100)}%` }}
              />
            </span>
            <span className="document-card__progress-label">
              {Math.round((document.lastReadPage / document.numPages) * 100)}%
            </span>
          </span>
        ) : null}
```

Insert this right after the `{statusLabel ? ...` block, still inside the `<button>`.

- [ ] **Step 4: Add CSS for progress bar**

In `apps/desktop/src/styles/tokens.css`, after `.document-card__status` rule:

```css
.document-card__progress {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}

.document-card__progress-track {
  flex: 1;
  height: 3px;
  border-radius: 2px;
  background: var(--interactive-hover);
  overflow: hidden;
}

.document-card__progress-fill {
  display: block;
  height: 100%;
  border-radius: 2px;
  background: var(--accent, #007aff);
  transition: width 0.3s ease;
}

.document-card__progress-label {
  font-size: 11px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
```

- [ ] **Step 5: Run typecheck + tests**

Run: `npx tsc --noEmit && npx vitest run src/features/library/ 2>&1 | tail -5`
Expected: typecheck clean, tests pass

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/domain/document.ts apps/desktop/src/features/library/DocumentCard.tsx apps/desktop/src/styles/tokens.css apps/desktop/src/features/library/DocumentCard.test.tsx
git commit -m "feat: show reading progress bar under book thumbnails"
```

---

## Task 4: DB Migration 0009 — Page Tags Table + Methods

**Files:**
- Create: `apps/desktop/src-tauri/migrations/0009_page_tags.sql`
- Modify: `apps/desktop/src-tauri/src/library_db.rs`
- Modify: `apps/desktop/src-tauri/src/model.rs`
- Modify: `apps/desktop/src-tauri/src/library_db_tests.rs`

- [ ] **Step 1: Create migration SQL**

Create `apps/desktop/src-tauri/migrations/0009_page_tags.sql`:

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

- [ ] **Step 2: Register migration**

In `apps/desktop/src-tauri/src/library_db.rs`, add to `MIGRATIONS` array and bump array length to 9:

```rust
const MIGRATIONS: [(&str, &str); 9] = [
    // ... existing entries ...
    (
        "0009_page_tags",
        include_str!("../migrations/0009_page_tags.sql"),
    ),
];
```

- [ ] **Step 3: Add PageTagSummary to model.rs**

In `apps/desktop/src-tauri/src/model.rs`, add after `DocumentSummary`:

```rust
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PageTagSummary {
    pub id: String,
    #[serde(rename = "documentId")]
    pub document_id: String,
    pub page: i64,
}
```

- [ ] **Step 4: Add use imports to library_db.rs**

At the top of `apps/desktop/src-tauri/src/library_db.rs`, add:

```rust
use uuid::Uuid;
use crate::model::PageTagSummary;
```

Update the existing `use crate::model::DocumentSummary;` line to include both:

```rust
use crate::model::{DocumentSummary, PageTagSummary};
```

- [ ] **Step 5: Add DB methods to library_db.rs**

Add these methods to the `impl LibraryDatabase` block (e.g., after `update_read_page`):

```rust
    pub fn list_page_tags(&self, document_id: &str) -> Result<Vec<PageTagSummary>> {
        let mut statement = self.connection.prepare(
            "SELECT id, document_id, page FROM page_tags WHERE document_id = ?1 ORDER BY page ASC",
        )?;
        let tags = statement
            .query_map(params![document_id], |row| {
                Ok(PageTagSummary {
                    id: row.get(0)?,
                    document_id: row.get(1)?,
                    page: row.get(2)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(tags)
    }

    pub fn toggle_page_tag(&mut self, document_id: &str, page: i64) -> Result<Vec<PageTagSummary>> {
        if page <= 0 {
            return Err(LibraryDbError::InvalidPage);
        }
        let transaction = self.connection.transaction()?;
        let exists = transaction
            .query_row(
                "SELECT 1 FROM page_tags WHERE document_id = ?1 AND page = ?2",
                params![document_id, page],
                |_| Ok(()),
            )
            .optional()?
            .is_some();
        if exists {
            transaction.execute(
                "DELETE FROM page_tags WHERE document_id = ?1 AND page = ?2",
                params![document_id, page],
            )?;
        } else {
            transaction.execute(
                "INSERT INTO page_tags (id, document_id, page, created_at) VALUES (?1, ?2, ?3, ?4)",
                params![Uuid::new_v4().to_string(), document_id, page, portable_timestamp()],
            )?;
        }
        transaction.commit()?;
        self.list_page_tags(document_id)
    }
```

- [ ] **Step 6: Write DB tests**

In `apps/desktop/src-tauri/src/library_db_tests.rs`, add tests:

```rust
#[test]
fn toggle_page_tag_adds_then_removes_a_tag() {
    let directory = tempdir().expect("create temporary directory");
    let mut database = LibraryDatabase::open(directory.path()).expect("open database");
    database
        .insert_local(NewLocalDocument {
            id: "tagged-doc".into(),
            title: "Tagged Book".into(),
            content_hash: "tagged-hash".into(),
            managed_path: "/managed/tagged.pdf".into(),
        })
        .expect("insert document");

    let added = database.toggle_page_tag("tagged-doc", 5).expect("add tag");
    assert_eq!(added.len(), 1);
    assert_eq!(added[0].page, 5);

    let listed = database.list_page_tags("tagged-doc").expect("list tags");
    assert_eq!(listed.len(), 1);

    let removed = database.toggle_page_tag("tagged-doc", 5).expect("remove tag");
    assert!(removed.is_empty());
}

#[test]
fn toggle_page_tag_rejects_non_positive_pages() {
    let directory = tempdir().expect("create temporary directory");
    let mut database = LibraryDatabase::open(directory.path()).expect("open database");
    database
        .insert_local(NewLocalDocument {
            id: "doc-x".into(),
            title: "X".into(),
            content_hash: "hash-x".into(),
            managed_path: "/managed/x.pdf".into(),
        })
        .expect("insert document");

    assert!(database.toggle_page_tag("doc-x", 0).is_err());
}
```

- [ ] **Step 7: Run cargo test**

Run: `cargo test --lib page_tag 2>&1 | tail -10`
Expected: 2 new tests pass

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src-tauri/migrations/0009_page_tags.sql apps/desktop/src-tauri/src/library_db.rs apps/desktop/src-tauri/src/model.rs apps/desktop/src-tauri/src/library_db_tests.rs
git commit -m "feat: add page_tags table with toggle and list methods"
```

---

## Task 5: Rust Commands — list_page_tags, toggle_page_tag

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

- [ ] **Step 1: Add Tauri commands**

In `apps/desktop/src-tauri/src/commands.rs`, add after the `save_read_page` command (around line 312):

```rust
#[tauri::command]
pub fn list_page_tags(
    id: String,
    state: State<'_, LibraryStore>,
) -> Result<Vec<crate::model::PageTagSummary>, String> {
    state
        .database
        .lock()
        .map_err(|_| "library database is unavailable".to_owned())?
        .list_page_tags(&id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn toggle_page_tag(
    document_id: String,
    page: i64,
    state: State<'_, LibraryStore>,
) -> Result<Vec<crate::model::PageTagSummary>, String> {
    state
        .database
        .lock()
        .map_err(|_| "library database is unavailable".to_owned())?
        .toggle_page_tag(&document_id, page)
        .map_err(|error| error.to_string())
}
```

- [ ] **Step 2: Register commands in lib.rs**

In `apps/desktop/src-tauri/src/lib.rs`, add to the `invoke_handler` array:

```rust
            commands::list_page_tags,
            commands::toggle_page_tag,
```

- [ ] **Step 3: Run cargo test + check**

Run: `cargo test --lib 2>&1 | tail -5`
Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src-tauri/src/commands.rs apps/desktop/src-tauri/src/lib.rs
git commit -m "feat: add list_page_tags and toggle_page_tag Tauri commands"
```

---

## Task 6: Frontend — desktop.ts Wrappers + Types

**Files:**
- Modify: `apps/desktop/src/lib/desktop.ts`
- Modify: `apps/desktop/src/domain/document.ts`

- [ ] **Step 1: Add PageTag interface**

In `apps/desktop/src/domain/document.ts`, add:

```typescript
export interface PageTag {
  id: string;
  documentId: string;
  page: number;
}
```

- [ ] **Step 2: Add desktop.ts wrappers**

In `apps/desktop/src/lib/desktop.ts`, add after `saveReadPage`:

```typescript
export function listPageTags(
  id: string,
  call: Invoke = invoke as Invoke,
): Promise<PageTag[]> {
  return call<PageTag[]>("list_page_tags", { id });
}

export function togglePageTag(
  documentId: string,
  page: number,
  call: Invoke = invoke as Invoke,
): Promise<PageTag[]> {
  return call<PageTag[]>("toggle_page_tag", { documentId, page });
}
```

Add the import for `PageTag` at the top:

```typescript
import type { LibraryDocument, PageTag } from "../domain/document";
```

- [ ] **Step 3: Add to LibraryApi interface in App.tsx**

In `apps/desktop/src/app/App.tsx`, add to `LibraryApi` interface (around line 38):

```typescript
  listPageTags?: (id: string) => Promise<PageTag[]>;
  togglePageTag?: (documentId: string, page: number) => Promise<PageTag[]>;
```

Add imports:

```typescript
import { saveReadPage as nativeSaveReadPage, listPageTags as nativeListPageTags, togglePageTag as nativeTogglePageTag } from "../lib/desktop";
import type { LibraryDocument, PageTag } from "../domain/document";
```

Add to the default `libraryApi` defaults object:

```typescript
  listPageTags: nativeListPageTags,
  togglePageTag: nativeTogglePageTag,
```

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit 2>&1 | head -5`
Expected: clean (or only errors from not-yet-updated test fixtures missing numPages)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/lib/desktop.ts apps/desktop/src/domain/document.ts apps/desktop/src/app/App.tsx
git commit -m "feat: add frontend wrappers for page tag commands"
```

---

## Task 7: ReaderPage — Tag Icon + Dropdown UI

**Files:**
- Modify: `apps/desktop/src/features/reader/ReaderPage.tsx`
- Modify: `apps/desktop/src/styles/tokens.css`

- [ ] **Step 1: Add tag-related props to ReaderPageProps**

In `apps/desktop/src/features/reader/ReaderPage.tsx`, update `ReaderPageProps` (line 567):

```typescript
interface ReaderPageProps {
  document: LibraryDocument;
  onBack: () => void;
  getDocumentFileUrl: (id: string) => Promise<string>;
  onPageChange: (id: string, page: number) => Promise<void>;
  onCreateCard?: (draft: CardSource) => void;
  composerSource?: CardSource | null;
  composerDecks?: CardComposerDeck[];
  composerError?: string | null;
  onSaveCard?: (input: CardSaveInput) => Promise<void>;
  onTranslate?: (text: string) => Promise<string>;
  onCloseComposer?: () => void;
  sourceHighlight?: CardSource | null;
  listPageTags?: (docId: string) => Promise<PageTag[]>;
  togglePageTag?: (docId: string, page: number) => Promise<PageTag[]>;
}
```

Add import at top:

```typescript
import type { LibraryDocument, PageTag } from "../../domain/document";
```

- [ ] **Step 2: Destructure new props + add state**

In the `ReaderPage` function, add `listPageTags` and `togglePageTag` to the destructured params. Add state:

```typescript
  const [pageTags, setPageTags] = useState<PageTag[]>([]);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
```

- [ ] **Step 3: Load tags on mount + when document changes**

Add a `useEffect` after existing state declarations:

```typescript
  useEffect(() => {
    if (!listPageTags) return;
    listPageTags(document.id)
      .then(setPageTags)
      .catch(() => {});
  }, [document.id, listPageTags]);
```

- [ ] **Step 4: Add tag toggle handler**

```typescript
  const handleToggleTag = useCallback(async () => {
    if (!togglePageTag) return;
    try {
      const updated = await togglePageTag(document.id, currentPage);
      setPageTags(updated);
    } catch (_) {}
  }, [togglePageTag, document.id, currentPage]);

  const currentTagged = pageTags.some((t) => t.page === currentPage);
```

- [ ] **Step 5: Add outside-click handler for dropdown**

```typescript
  useEffect(() => {
    if (!tagMenuOpen) return;
    const handler = () => setTagMenuOpen(false);
    window.document.addEventListener("click", handler);
    return () => window.document.removeEventListener("click", handler);
  }, [tagMenuOpen]);
```

- [ ] **Step 6: Add tag icon + dropdown in header**

In the reader toolbar (after the next-page button, around line 1048), add:

```tsx
            {togglePageTag && (
              <div className="reader-tag-menu">
                <button
                  type="button"
                  className="reader-icon-button"
                  aria-label="Page tags"
                  title="Page tags"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTagMenuOpen(!tagMenuOpen);
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                    <line x1="7" y1="7" x2="7.01" y2="7" />
                  </svg>
                </button>
                {tagMenuOpen && (
                  <div className="reader-tag-dropdown" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="reader-tag-dropdown__toggle"
                      onClick={() => void handleToggleTag()}
                    >
                      {currentTagged ? `✓ Tagged Page ${currentPage}` : `+ Tag Page ${currentPage}`}
                    </button>
                    <div className="reader-tag-dropdown__list">
                      {pageTags.length === 0 ? (
                        <p className="reader-tag-dropdown__empty">No tagged pages yet</p>
                      ) : (
                        pageTags.map((tag) => (
                          <button
                            key={tag.id}
                            type="button"
                            className={`reader-tag-dropdown__item ${tag.page === currentPage ? "is-active" : ""}`}
                            onClick={() => {
                              handlePageSelect(tag.page);
                              setTagMenuOpen(false);
                            }}
                          >
                            Page {tag.page}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
```

- [ ] **Step 7: Add tag indicator on thumbnail sidebar**

In the `ThumbnailPage` usage (around line 977-984), pass tagged state:

```tsx
                <ThumbnailPage
                  key={pageNumber}
                  pdfDoc={pdfDoc!}
                  pageNumber={pageNumber}
                  active={currentPage === pageNumber}
                  tagged={pageTags.some((t) => t.page === pageNumber)}
                  onClick={() => handlePageSelect(pageNumber)}
                />
```

Update `ThumbnailPageProps` interface (line 63) and component to accept `tagged?: boolean`:

```typescript
interface ThumbnailPageProps {
  pdfDoc: pdfjs.PDFDocumentProxy;
  pageNumber: number;
  onClick: () => void;
  active: boolean;
  tagged?: boolean;
}
```

In the ThumbnailPage render, add a tag dot when `tagged`:

```tsx
      {tagged && <span className="reader-thumbnail__tag-dot" />}
```

Place this inside the thumbnail button element, after the label.

- [ ] **Step 8: Add CSS for tag dropdown + thumbnail indicator**

In `apps/desktop/src/styles/tokens.css`:

```css
.reader-tag-menu {
  position: relative;
}

.reader-tag-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 6px;
  min-width: 200px;
  padding: 6px;
  border-radius: 10px;
  border: 1px solid var(--border-subtle);
  background: var(--surface-1);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
  z-index: 100;
}

.reader-tag-dropdown__toggle {
  display: block;
  width: 100%;
  padding: 8px 12px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
}

.reader-tag-dropdown__toggle:hover {
  background: var(--interactive-hover);
}

.reader-tag-dropdown__list {
  margin-top: 4px;
  border-top: 1px solid var(--border-subtle);
  padding-top: 4px;
  max-height: 240px;
  overflow-y: auto;
}

.reader-tag-dropdown__item {
  display: block;
  width: 100%;
  padding: 6px 12px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.reader-tag-dropdown__item:hover {
  background: var(--interactive-hover);
}

.reader-tag-dropdown__item.is-active {
  font-weight: 600;
}

.reader-tag-dropdown__empty {
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text-secondary);
}

.reader-thumbnail__tag-dot {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent, #007aff);
  z-index: 2;
}
```

- [ ] **Step 9: Run typecheck + tests**

Run: `npx tsc --noEmit 2>&1 | head -10 && npx vitest run src/features/reader/ 2>&1 | tail -8`
Expected: typecheck clean, tests pass

- [ ] **Step 10: Commit**

```bash
git add apps/desktop/src/features/reader/ReaderPage.tsx apps/desktop/src/styles/tokens.css
git commit -m "feat: add page tag icon with dropdown and thumbnail indicators in reader"
```

---

## Task 8: Wire Up in App.tsx + Final Verification

**Files:**
- Modify: `apps/desktop/src/app/App.tsx`

- [ ] **Step 1: Pass tag props to ReaderPage**

In `apps/desktop/src/app/App.tsx`, find the `<ReaderPage` render (around line 587) and add:

```tsx
          listPageTags={libraryApi.listPageTags ?? nativeListPageTags}
          togglePageTag={libraryApi.togglePageTag ?? nativeTogglePageTag}
```

Add the native imports at the top (if not already done in Task 6):

```typescript
import {
  // ... existing imports ...
  listPageTags as nativeListPageTags,
  togglePageTag as nativeTogglePageTag,
} from "../lib/desktop";
```

- [ ] **Step 2: Update test mocks**

In `apps/desktop/src/app/App.test.tsx`, add `listPageTags` and `togglePageTag` to any `libraryApi` mock that renders the reader route. Most library mocks just need stub functions:

```typescript
  listPageTags: vi.fn().mockResolvedValue([]),
  togglePageTag: vi.fn().mockResolvedValue([]),
```

Add `numPages: null` (or a number) to all `LibraryDocument` fixtures in test files.

- [ ] **Step 3: Run full typecheck**

Run: `npx tsc --noEmit 2>&1 | head -10`
Expected: clean

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run 2>&1 | tail -10`
Expected: all tests pass (excluding pre-existing failures unrelated to this work)

- [ ] **Step 5: Run cargo test**

Run: `cargo test --lib 2>&1 | tail -5`
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/app/App.tsx apps/desktop/src/app/App.test.tsx
git commit -m "feat: wire page tag callbacks and finalize reading progress feature"
```
