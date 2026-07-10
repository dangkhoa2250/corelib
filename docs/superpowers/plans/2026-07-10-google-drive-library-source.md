# Google Drive Library Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the working local Library so users can browse Google Drive, add selected PDFs or folders, and download PDF files only when Reader opens them.

**Architecture:** Add a Drive source adapter behind the document service. Drive records store a stable Drive file ID and metadata in SQLite; the file itself enters a removable cache only on open. OAuth credentials stay in the operating-system credential store and Drive failures remain recoverable Library states.

**Tech Stack:** Existing Tauri/React/Rust stack, Google OAuth 2.0 installed-app flow, Google Drive REST API, Tauri secure credential plugin, SQLite.

---

## File structure

~~~text
apps/desktop/
  src/features/drive/DrivePicker.tsx       # browse and select PDF/files/folders
  src/features/drive/DrivePicker.test.tsx
  src/features/library/LibraryPage.tsx      # exposes Google Drive action
  src/features/reader/ReaderPage.tsx        # reacts to download state
  src/lib/desktop.ts                        # Drive command wrappers
  src-tauri/src/drive_auth.rs               # OAuth/token credential service
  src-tauri/src/drive_api.rs                # metadata/list/download adapter
  src-tauri/src/drive_cache.rs              # content-addressed removable cache
  src-tauri/src/commands.rs                 # Drive commands
  src-tauri/src/library_db.rs                # Drive source persistence
  src-tauri/src/drive_tests.rs               # adapter/cache tests
~~~

### Task 1: Register the desktop OAuth client and define Drive source persistence

**Files:**
- Create: `apps/desktop/.env.example`
- Create: `apps/desktop/src-tauri/src/drive_auth.rs`
- Modify: `apps/desktop/src-tauri/migrations/0001_library.sql`
- Modify: `apps/desktop/src-tauri/src/library_db.rs`
- Create: `apps/desktop/src-tauri/src/drive_tests.rs`

- [ ] **Step 1: Register the OAuth application manually in Google Cloud Console**

Create a Google Cloud project, enable Google Drive API, configure an OAuth consent screen for the intended test users, and register a Desktop app OAuth client. Add only this shape to `.env.example`:

~~~dotenv
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
~~~

Expected: local secrets are placed in untracked `.env`; they are never committed, placed in SQLite, or returned to the frontend.

- [ ] **Step 2: Write the failing Drive source test**

Create `drive_tests.rs`:

~~~rust
#[test]
fn a_drive_document_is_not_a_local_managed_file() {
  let record = crate::drive_api::new_drive_record("drive-file-1", "Probabilistic AI.pdf");
  assert_eq!(record.source, "google_drive");
  assert_eq!(record.managed_path, None);
  assert_eq!(record.status, "download_required");
}
~~~

- [ ] **Step 3: Run it and verify failure**

~~~bash
cargo test --manifest-path src-tauri/Cargo.toml drive_tests
~~~

Expected: FAIL because the Drive adapter does not exist.

- [ ] **Step 4: Implement source records and secure credentials**

Add a `DriveTokenStore` in `drive_auth.rs` with this interface:

~~~rust
pub trait DriveTokenStore {
  fn load(&self) -> Result<Option<String>, String>;
  fn save(&self, refresh_token: &str) -> Result<(), String>;
  fn clear(&self) -> Result<(), String>;
}
~~~

The macOS implementation uses Keychain through the secure credential plugin. Add `insert_drive(id, drive_file_id, title)` to `LibraryDb`. It creates a `google_drive` record with `source_ref=drive_file_id`, `managed_path=NULL`, `status='download_required'`, and `index_state='pending'`. The existing schema already permits this source; add a unique index on `(source, source_ref)` so selecting the same Drive file twice returns one record.

- [ ] **Step 5: Verify and commit**

~~~bash
cargo test --manifest-path src-tauri/Cargo.toml drive_tests
git add apps/desktop
git commit -m "feat: add Drive document source model"
~~~

Expected: a Drive record persists metadata but no PDF bytes.

### Task 2: Browse Drive and import user-selected PDFs/folders

**Files:**
- Create: `apps/desktop/src-tauri/src/drive_api.rs`
- Create: `apps/desktop/src/features/drive/DrivePicker.tsx`
- Create: `apps/desktop/src/features/drive/DrivePicker.test.tsx`
- Modify: `apps/desktop/src/lib/desktop.ts`
- Modify: `apps/desktop/src/features/library/LibraryPage.tsx`
- Modify: `apps/desktop/src-tauri/src/commands.rs`

- [ ] **Step 1: Write the failing picker test**

~~~tsx
import {render,screen} from '@testing-library/react';
import {DrivePicker} from './DrivePicker';
it('lets a user add a selected PDF',async()=>{
 render(<DrivePicker entries={[{id:'f1',name:'PGM.pdf',kind:'pdf'}]} onAdd={async()=>{}} />);
 expect(screen.getByRole('button',{name:'Add PGM.pdf'})).toBeInTheDocument();
});
~~~

- [ ] **Step 2: Run it and verify failure**

~~~bash
npx vitest run src/features/drive/DrivePicker.test.tsx
~~~

Expected: FAIL because `DrivePicker` is missing.

- [ ] **Step 3: Implement adapter and picker**

Create a `DriveEntry` contract:

~~~ts
export type DriveEntry={id:string;name:string;kind:'pdf'|'folder';parentId:string|null};
~~~

The Rust adapter exposes:
- `drive_connect()`: runs OAuth and saves the refresh token only after success.
- `drive_list(folder_id: Option<String>)`: lists only folders and `application/pdf` files for a selected parent.
- `drive_import(ids: Vec<String>)`: expands selected folders once, persists each current PDF with `insert_drive`, and never creates a watch subscription.

Create `DrivePicker` with back navigation, a list of folder/PDF entries, multi-select checkboxes, and explicit `Add selected`. Each individual PDF has `Add <name>`. It calls typed wrappers `connectDrive`, `listDrive`, and `importDrive`. Add a second Library header action labelled `Google Drive`; it opens the picker without changing the flat Library grid.

- [ ] **Step 4: Verify and commit**

~~~bash
npx vitest run src/features/drive/DrivePicker.test.tsx
cargo test --manifest-path src-tauri/Cargo.toml
git add apps/desktop
git commit -m "feat: import selected Google Drive documents"
~~~

Expected: selecting a folder adds its current PDFs only; later Drive folder changes do not mutate Library.

### Task 3: Download on demand, cache safely, and preserve offline reading

**Files:**
- Create: `apps/desktop/src-tauri/src/drive_cache.rs`
- Modify: `apps/desktop/src-tauri/src/drive_api.rs`
- Modify: `apps/desktop/src-tauri/src/commands.rs`
- Modify: `apps/desktop/src/lib/desktop.ts`
- Modify: `apps/desktop/src/features/reader/ReaderPage.tsx`
- Modify: `apps/desktop/src-tauri/src/drive_tests.rs`

- [ ] **Step 1: Write the failing cache test**

~~~rust
#[test]
fn cache_clear_removes_download_not_library_record() {
  let cache = crate::drive_cache::Cache::for_test().unwrap();
  cache.put("drive-file-1", b"%PDF").unwrap();
  cache.clear().unwrap();
  assert!(!cache.path_for("drive-file-1").exists());
}
~~~

- [ ] **Step 2: Run it and verify failure**

~~~bash
cargo test --manifest-path src-tauri/Cargo.toml drive_tests
~~~

Expected: FAIL because `drive_cache` is missing.

- [ ] **Step 3: Implement on-demand cache and command states**

Create a cache at `<app-data>/drive-cache/<SHA-256(file-id)>.pdf`. Its public methods are:

~~~rust
pub fn path_for(&self, file_id:&str)->std::path::PathBuf;
pub fn put(&self, file_id:&str, bytes:&[u8])->Result<std::path::PathBuf,String>;
pub fn clear(&self)->Result<(),String>;
~~~

Add `get_document_file_url(id)` behavior:
1. A local managed document returns its managed path.
2. A cached Drive document returns its cache path.
3. An uncached Drive document sets `status='processing'`, downloads bytes, atomically writes cache, sets `status='ready'`, queues cover/text indexing, and returns cache path.
4. Network error sets `status='download_required'` and returns a user-facing retry error.
5. revoked credentials set `status='error'` and return a reconnect-required error.

Reader displays a download progress state before it asks PDF.js to render. Add a Settings action `Clear downloaded Drive files` that invokes `clear_drive_cache` and changes cached Drive records back to `download_required` without deleting metadata, search records, or reading positions.

- [ ] **Step 4: Verify acceptance and commit**

~~~bash
cargo test --manifest-path src-tauri/Cargo.toml
npm test
npx playwright test
npm run tauri build
git add apps/desktop
git commit -m "feat: cache Drive PDFs on demand"
~~~

Expected: an opened Drive PDF remains readable offline; clearing cache preserves its Library card and reading page.

## Acceptance check

- User explicitly browses and chooses PDFs/folders; no Drive folder is watched.
- Drive records do not include a PDF until Reader requests it.
- OAuth tokens are in the OS credential store, not the app database.
- Caching is removable and offline behavior is explicit.
- Expired auth, deleted files, and network failures are recoverable UI states.

