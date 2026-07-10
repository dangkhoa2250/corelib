# Library Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the macOS desktop Library: managed local PDF import, a flat Books-like cover grid, integrated reader, and `Cmd+K` document search.

**Architecture:** Create a Tauri 2 desktop app at `apps/desktop`. React owns UI; Rust owns managed file storage, SQLite/FTS5, and background jobs through typed commands. PDF.js renders PDFs in the system webview.

**Tech Stack:** Tauri 2, React, TypeScript, Rust, SQLite/FTS5, PDF.js, Vitest, Testing Library, Playwright.

---

## File structure

~~~text
apps/desktop/
  src/app/App.tsx
  src/domain/document.ts
  src/lib/desktop.ts
  src/features/library/{LibraryPage,DocumentGrid,DocumentCard}.tsx
  src/features/search/CommandPalette.tsx
  src/features/reader/ReaderPage.tsx
  src/styles/tokens.css
  src-tauri/migrations/0001_library.sql
  src-tauri/src/{main,model,library_store,library_db,indexer,commands}.rs
  tests/e2e/library.spec.ts
~~~

### Task 1: Scaffold the app and baseline test

**Files:**
- Create: `apps/desktop` (Tauri React TypeScript template)
- Create: `apps/desktop/src/app/App.tsx`
- Create: `apps/desktop/src/app/App.test.tsx`
- Create: `apps/desktop/src/styles/tokens.css`
- Modify: `apps/desktop/package.json`

- [ ] **Step 1: Initialize version control and record the approved documents**

~~~bash
cd /Users/jason/project/corelib
git init
git add docs/superpowers
git commit -m "docs: add library design and plans"
~~~

Expected: the directory is a Git repository and `git status --short` has no output.

- [ ] **Step 2: Create the Tauri application and install test tooling**

~~~bash
npm create tauri-app@latest apps/desktop -- --template react-ts --manager npm
cd apps/desktop
npm install
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event playwright
npx playwright install chromium
~~~

Expected: `npm run tauri dev` opens the template window.

- [ ] **Step 3: Write the failing shell test**

Create `src/app/App.test.tsx`:

~~~tsx
import { render, screen } from '@testing-library/react';
import { App } from './App';

it('starts at Library', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'Library' })).toBeInTheDocument();
});
~~~

- [ ] **Step 4: Run it and verify failure**

~~~bash
npx vitest run src/app/App.test.tsx
~~~

Expected: FAIL because `App` does not exist.

- [ ] **Step 5: Implement the smallest shell**

Create `src/app/App.tsx`:

~~~tsx
export function App() {
  return <main><h1>Library</h1></main>;
}
~~~

Replace `src/main.tsx`:

~~~tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import './styles/tokens.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
~~~

Create `src/styles/tokens.css`:

~~~css
:root { font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display",sans-serif; color:#1d1d1f; background:#f5f5f7; }
* { box-sizing:border-box; } body { margin:0; min-width:320px; min-height:100vh; } button,input { font:inherit; }
~~~

Add these `package.json` scripts:

~~~json
"test": "vitest run",
"test:watch": "vitest",
"test:e2e": "playwright test"
~~~

- [ ] **Step 6: Verify and commit**

~~~bash
npm test
git add apps/desktop
git commit -m "chore: scaffold desktop library app"
~~~

Expected: PASS.

### Task 2: Establish document contracts, storage schema, and duplicate protection

**Files:**
- Create: `src/domain/document.ts`
- Create: `src/domain/document.test.ts`
- Create: `src-tauri/migrations/0001_library.sql`
- Create: `src-tauri/src/model.rs`
- Create: `src-tauri/src/library_store.rs`
- Create: `src-tauri/src/library_store_tests.rs`
- Modify: `src-tauri/src/main.rs` and `src-tauri/Cargo.toml`

- [ ] **Step 1: Write failing contract and duplicate tests**

Create `src/domain/document.test.ts`:

~~~ts
import { expect, it } from 'vitest';
import { documentStatusLabel, type LibraryDocument } from './document';

it('labels a pending document', () => {
  const d: LibraryDocument = { id:'d1', title:'Matrix Calculus', author:null, source:'local_managed', coverUrl:null, indexed:false, status:'processing', lastReadPage:null };
  expect(documentStatusLabel(d)).toBe('Preparing');
});
~~~

Create `src-tauri/src/library_store_tests.rs`:

~~~rust
#[cfg(test)] mod tests {
  use super::super::library_store::{content_hash, import_pdf};
  use std::fs;
  #[test] fn identical_files_share_one_managed_copy() {
    let root = tempfile::tempdir().unwrap();
    let source = root.path().join("book.pdf");
    fs::write(&source, b"%PDF-1.4 fixture").unwrap();
    let hash = content_hash(&source).unwrap();
    assert_eq!(import_pdf(root.path(), &source, &hash).unwrap(), import_pdf(root.path(), &source, &hash).unwrap());
  }
}
~~~

- [ ] **Step 2: Run them and verify failure**

~~~bash
npx vitest run src/domain/document.test.ts
cargo test --manifest-path src-tauri/Cargo.toml library_store_tests
~~~

Expected: both fail because their modules are missing.

- [ ] **Step 3: Implement the data types and SQL**

Create `src/domain/document.ts`:

~~~ts
export type DocumentSource = 'local_managed' | 'google_drive';
export type DocumentStatus = 'ready' | 'processing' | 'download_required' | 'error';
export type LibraryDocument = { id:string; title:string; author:string|null; source:DocumentSource; coverUrl:string|null; indexed:boolean; status:DocumentStatus; lastReadPage:number|null };
export const documentStatusLabel = (d:LibraryDocument) => ({ready:'',processing:'Preparing',download_required:'Download to read',error:'Needs attention'}[d.status]);
~~~

Create `src-tauri/src/model.rs`:

~~~rust
use serde::Serialize;
#[derive(Clone, Serialize)]
pub struct DocumentSummary {
  pub id:String, pub title:String, pub author:Option<String>, pub source:String,
  #[serde(rename="coverUrl")] pub cover_url:Option<String>, pub indexed:bool,
  pub status:String, #[serde(rename="lastReadPage")] pub last_read_page:Option<i64>,
}
~~~

Create `src-tauri/migrations/0001_library.sql`:

~~~sql
CREATE TABLE documents (
 id TEXT PRIMARY KEY, source TEXT NOT NULL CHECK(source IN ('local_managed','google_drive')),
 source_ref TEXT, content_hash TEXT, title TEXT NOT NULL, author TEXT, managed_path TEXT, cover_path TEXT,
 status TEXT NOT NULL CHECK(status IN ('ready','processing','download_required','error')),
 index_state TEXT NOT NULL CHECK(index_state IN ('pending','ready','failed')),
 last_read_page INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX local_content_hash_unique ON documents(content_hash) WHERE source='local_managed';
CREATE VIRTUAL TABLE document_text USING fts5(document_id UNINDEXED, body, tokenize='unicode61');
~~~

- [ ] **Step 4: Implement managed copying**

Create `src-tauri/src/library_store.rs`:

~~~rust
use sha2::{Digest,Sha256};
use std::{fs,io::{self,Read},path::{Path,PathBuf}};
pub fn content_hash(path:&Path)->io::Result<String> {
 let mut file=fs::File::open(path)?; let mut h=Sha256::new(); let mut b=[0;8192];
 loop { let n=file.read(&mut b)?; if n==0 { break; } h.update(&b[..n]); }
 Ok(format!("{:x}",h.finalize()))
}
pub fn import_pdf(root:&Path,source:&Path,hash:&str)->io::Result<String> {
 let dir=root.join("documents"); fs::create_dir_all(&dir)?;
 let target:PathBuf=dir.join(format!("{hash}.pdf")); if !target.exists() { fs::copy(source,&target)?; }
 Ok(target.to_string_lossy().into_owned())
}
~~~

Add dependencies to `Cargo.toml`:

~~~toml
rusqlite = { version = "0.32", features = ["bundled"] }
sha2 = "0.10"
uuid = { version = "1", features = ["v4"] }
serde = { version = "1", features = ["derive"] }

[dev-dependencies]
tempfile = "3"
~~~

Register both Rust modules in `main.rs`.

- [ ] **Step 5: Verify and commit**

~~~bash
npx vitest run src/domain/document.test.ts
cargo test --manifest-path src-tauri/Cargo.toml library_store_tests
git add src src-tauri
git commit -m "feat: define managed library storage"
~~~

Expected: both tests pass.

### Task 3: Persist the Library through typed Tauri commands

**Files:**
- Create: `src-tauri/src/library_db.rs`
- Create: `src-tauri/src/commands.rs`
- Create: `src/lib/desktop.ts`
- Create: `src/lib/desktop.test.ts`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Write the failing frontend-bridge test**

~~~ts
import { expect,it,vi } from 'vitest';
import { listDocuments } from './desktop';
it('uses the list_documents command', async () => {
  const invoke=vi.fn().mockResolvedValue([]);
  expect(await listDocuments(invoke)).toEqual([]);
  expect(invoke).toHaveBeenCalledWith('list_documents');
});
~~~

- [ ] **Step 2: Run it and verify failure**

~~~bash
npx vitest run src/lib/desktop.test.ts
~~~

Expected: FAIL because `desktop.ts` is missing.

- [ ] **Step 3: Add the native bridge**

Create `src/lib/desktop.ts`:

~~~ts
import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import type { LibraryDocument } from '../domain/document';
export type Invoke=<T>(command:string,args?:Record<string,unknown>)=>Promise<T>;
export const listDocuments=(invoke:Invoke=tauriInvoke)=>invoke<LibraryDocument[]>('list_documents');
export const importLocalDocuments=(paths:string[],invoke:Invoke=tauriInvoke)=>invoke<LibraryDocument[]>('import_local_documents',{paths});
export const searchDocuments=(query:string,invoke:Invoke=tauriInvoke)=>invoke<LibraryDocument[]>('search_documents',{query});
export const saveReadPage=(id:string,page:number,invoke:Invoke=tauriInvoke)=>invoke<void>('save_read_page',{id,page});
~~~

Create `src-tauri/src/commands.rs` with command functions `list_documents`, `import_local_documents`, `search_documents`, and `save_read_page`. Reject non-PDF import paths and pages below 1.

Implement `LibraryDb` with this public API:

~~~rust
pub fn open(app_data:&std::path::Path)->Result<Self,String>;
pub fn list(&self)->Result<Vec<crate::model::DocumentSummary>,String>;
pub fn insert_local(&self,id:&str,hash:&str,title:&str,path:&str)->Result<crate::model::DocumentSummary,String>;
pub fn search(&self,query:&str)->Result<Vec<crate::model::DocumentSummary>,String>;
pub fn update_read_page(&self,id:&str,page:i64)->Result<(),String>;
~~~

`open` executes the migration, `insert_local` returns the existing row for a duplicate hash, and `search` uses bound query parameters and a 30-result limit. Register a single managed database state and the four commands in `main.rs`.

- [ ] **Step 4: Verify and commit**

~~~bash
npx vitest run src/lib/desktop.test.ts
cargo test --manifest-path src-tauri/Cargo.toml
git add src src-tauri
git commit -m "feat: add local library command API"
~~~

Expected: the command bridge and storage tests pass.

### Task 4: Build the flat cover Library and local import flow

**Files:**
- Create: `src/features/library/DocumentCard.tsx`
- Create: `src/features/library/DocumentGrid.tsx`
- Create: `src/features/library/LibraryPage.tsx`
- Create: `src/features/library/LibraryPage.test.tsx`
- Modify: `src/app/App.tsx` and `src/styles/tokens.css`

- [ ] **Step 1: Write the failing Library page test**

~~~tsx
import { render,screen } from '@testing-library/react';
import { LibraryPage } from './LibraryPage';
it('renders an import action and a cover card',()=>{
 render(<LibraryPage documents={[{id:'1',title:'Linear Algebra',author:'Gilbert Strang',source:'local_managed',coverUrl:null,indexed:true,status:'ready',lastReadPage:null}]} onOpen={()=>{}} onImport={()=>{}} />);
 expect(screen.getByRole('button',{name:'Import from Mac'})).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Open Linear Algebra'})).toBeInTheDocument();
});
~~~

- [ ] **Step 2: Run it and verify failure**

~~~bash
npx vitest run src/features/library/LibraryPage.test.tsx
~~~

Expected: FAIL because `LibraryPage` is missing.

- [ ] **Step 3: Implement the UI components**

Create `DocumentCard.tsx`:

~~~tsx
import type { LibraryDocument } from '../../domain/document';
import { documentStatusLabel } from '../../domain/document';
export function DocumentCard({document,onOpen}:{document:LibraryDocument;onOpen:()=>void}) {
 return <button className="document-card" onClick={onOpen} aria-label={'Open '+document.title}>
  <div className="cover">{document.coverUrl?<img src={document.coverUrl} alt="" />:<span>{document.title.slice(0,1)}</span>}</div>
  <strong>{document.title}</strong>{document.author&&<small>{document.author}</small>}
  {documentStatusLabel(document)&&<small>{documentStatusLabel(document)}</small>}
 </button>;
}
~~~

Create `DocumentGrid.tsx` and `LibraryPage.tsx` using the props from the test. `LibraryPage` renders a `document-grid` when nonempty, otherwise `Your books will appear here.`. In `App.tsx`, load `listDocuments` on mount and pass selected PDF paths from the Tauri dialog plugin to `importLocalDocuments`.

- [ ] **Step 4: Add styles, verify, and commit**

~~~css
.library-page{padding:32px 40px}.library-page header{display:flex;justify-content:space-between;align-items:center;margin-bottom:32px}
.document-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:28px 20px}
.document-card{border:0;background:transparent;text-align:left;color:inherit;cursor:pointer;display:grid;gap:6px}
.cover{aspect-ratio:.72;border-radius:10px;overflow:hidden;display:grid;place-items:center;background:#e5e5ea;box-shadow:0 10px 24px #0002}
.cover img{width:100%;height:100%;object-fit:cover}.document-card small{color:#6e6e73}
~~~

~~~bash
npx vitest run src/features/library/LibraryPage.test.tsx
git add src src-tauri
git commit -m "feat: add flat local PDF library"
~~~

Expected: app imports PDF through the native picker and shows the document in the grid.

### Task 5: Index in background and expose Cmd+K

**Files:**
- Create: `src-tauri/src/indexer.rs` and `src-tauri/src/indexer_tests.rs`
- Create: `src/features/search/CommandPalette.tsx` and `src/features/search/CommandPalette.test.tsx`
- Modify: `src-tauri/src/library_db.rs` and `src/app/App.tsx`

- [ ] **Step 1: Write failing error-state and keyboard tests**

~~~rust
#[test] fn failed_index_keeps_document_readable() {
 assert_eq!(crate::indexer::index_state(Err("bad pdf".into())),("ready".into(),"failed".into()));
}
~~~

~~~tsx
import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {CommandPalette} from './CommandPalette';
it('opens via Cmd+K and opens selected result',async()=>{
 const user=userEvent.setup(),opened:string[]=[];
 render(<CommandPalette search={async()=>[{id:'1',title:'Matrix Calculus',author:null,source:'local_managed',coverUrl:null,indexed:true,status:'ready',lastReadPage:null}]} onOpen={id=>opened.push(id)}/>);
 await user.keyboard('{Meta>}k{/Meta}'); await user.type(screen.getByRole('searchbox'),'matrix'); await user.keyboard('{Enter}');
 expect(opened).toEqual(['1']);
});
~~~

- [ ] **Step 2: Run them and verify failure**

~~~bash
cargo test --manifest-path src-tauri/Cargo.toml indexer_tests
npx vitest run src/features/search/CommandPalette.test.tsx
~~~

Expected: both fail.

- [ ] **Step 3: Implement background work and search**

Create `indexer.rs`:

~~~rust
pub fn index_state(result:Result<(String,Vec<u8>),String>)->(String,String) {
 match result { Ok(_)=>("ready".into(),"ready".into()), Err(_)=>("ready".into(),"failed".into()) }
}
~~~

Add `set_index_ready` and `set_index_failed` to `LibraryDb`. They update `updated_at`; the success call replaces its FTS row in the same transaction. Import first creates `processing/pending`, then runs thumbnail/text extraction outside the UI thread. Index failure changes only `index_state` to `failed`.

Create `CommandPalette.tsx` with `search(query)` and `onOpen(id)` props. It listens for Meta/Ctrl+K, focuses a `role="searchbox"` input, debounces 150ms, supports arrows and Enter, and clears/closes on Escape. Use a parameter-bound `LibraryDb::search` query with maximum 30 results. Keep the palette mounted in both Library and Reader.

- [ ] **Step 4: Verify and commit**

~~~bash
cargo test --manifest-path src-tauri/Cargo.toml
npx vitest run src/features/search/CommandPalette.test.tsx
git add src src-tauri
git commit -m "feat: add background index and command search"
~~~

Expected: recovery state and Cmd+K keyboard flow pass.

### Task 6: Implement the PDF.js reader, e2e tests, and macOS build

**Files:**
- Create: `src/features/reader/ReaderPage.tsx` and `src/features/reader/ReaderPage.test.tsx`
- Create: `playwright.config.ts` and `tests/e2e/library.spec.ts`
- Modify: `src/app/App.tsx`, `src/lib/desktop.ts`, `src-tauri/src/commands.rs`, and `README.md`

- [ ] **Step 1: Write the failing reader test**

~~~tsx
import {render,screen} from '@testing-library/react';
import {ReaderPage} from './ReaderPage';
it('restores saved page',()=>{
 render(<ReaderPage document={{id:'1',title:'PGM',author:null,source:'local_managed',coverUrl:null,indexed:true,status:'ready',lastReadPage:12}} fileUrl="/book.pdf" onBack={()=>{}} onPageChange={()=>{}}/>);
 expect(screen.getByRole('button',{name:'Back to Library'})).toBeInTheDocument();
 expect(screen.getByText('Page 12')).toBeInTheDocument();
});
~~~

- [ ] **Step 2: Run it and verify failure**

~~~bash
npx vitest run src/features/reader/ReaderPage.test.tsx
~~~

Expected: FAIL because `ReaderPage` is missing.

- [ ] **Step 3: Implement the reader**

Create `ReaderPage.tsx`:

~~~tsx
import type {LibraryDocument} from '../../domain/document';
export function ReaderPage({document,fileUrl,onBack,onPageChange}:{document:LibraryDocument;fileUrl:string;onBack:()=>void;onPageChange:(page:number)=>void}) {
 const page=document.lastReadPage??1;
 return <main className="reader-page"><header><button onClick={onBack}>Back to Library</button><strong>{document.title}</strong></header>
  <section aria-label="PDF reader" data-file-url={fileUrl}><p>Page {page}</p><button onClick={()=>onPageChange(page+1)}>Next page</button></section>
 </main>;
}
~~~

Add a `get_document_file_url(id)` command that returns only normalized paths beneath app data. Route Library selection to Reader and save pages through `saveReadPage`. Install `pdfjs-dist`; replace the placeholder with a PDF.js canvas view, worker URL via `new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString()`, page thumbnails, zoom, and in-document search. Persist only a successfully rendered new page.

- [ ] **Step 4: Write and run the end-to-end smoke test**

Create `tests/e2e/library.spec.ts`:

~~~ts
import {test,expect} from '@playwright/test';
test('Library exposes import and Cmd+K',async({page})=>{
 await page.goto('http://127.0.0.1:1420');
 await expect(page.getByRole('button',{name:'Import from Mac'})).toBeVisible();
 await page.keyboard.press(process.platform==='darwin'?'Meta+K':'Control+K');
 await expect(page.getByRole('searchbox')).toBeVisible();
});
~~~

Create `playwright.config.ts`:

~~~ts
import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/e2e',use:{baseURL:'http://127.0.0.1:1420'},webServer:{command:'npm run dev -- --host 127.0.0.1',url:'http://127.0.0.1:1420',reuseExistingServer:!process.env.CI}});
~~~

- [ ] **Step 5: Verify every layer and commit**

~~~bash
npm install pdfjs-dist
npx vitest run src/features/reader/ReaderPage.test.tsx
npx playwright test tests/e2e/library.spec.ts
npm test
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri build
git add .
git commit -m "feat: complete local library reader"
~~~

Expected: unit, Rust, e2e, and macOS bundle checks pass.

## Acceptance check

- Local PDF import copies the original to app-managed storage and leaves the source unchanged.
- Equal-content imports deduplicate by SHA-256.
- Library is flat and cover-first; background failures do not hide usable PDFs.
- Cmd+K searches Library from both views by keyboard.
- Reader renders in-app, supports thumbnails, zoom, text search, and restores reading position.

