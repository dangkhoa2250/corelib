# MuPDF Engine Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace PDF.js and lopdf with pinned MuPDF WASM and native MuPDF while preserving all current PDF behavior and improving every measured PDF latency category.

**Architecture:** React talks only to an application-owned asynchronous `PdfEngine`; a dedicated Web Worker implements it with MuPDF.js/WASM and returns bitmaps plus serializable text/link geometry. Import indexing keeps the current isolated Rust worker protocol but delegates parsing to a bundled native `mutool` sidecar built from the same pinned MuPDF release. Existing UI, SQLite schema, source files, Drive behavior, and job states remain unchanged.

**Tech Stack:** React 19, TypeScript 5.8, Vite 7, MuPDF.js 1.28.x/WASM, Web Workers, Tauri 2 sidecars, Rust 2021, Vitest, Playwright, Cargo tests.

---

## File Map

Create these focused units:

- `apps/desktop/src/pdf/types.ts` — serializable, engine-independent document/page/text/link types.
- `apps/desktop/src/pdf/PdfEngine.ts` — asynchronous engine contract.
- `apps/desktop/src/pdf/MuPdfEngine.ts` — main-thread client, request correlation, cancellation, and worker lifecycle.
- `apps/desktop/src/pdf/mupdf.worker.ts` — the only frontend module allowed to import `mupdf`.
- `apps/desktop/src/pdf/textLayer.ts` — structured-text-to-DOM layout and selection helpers.
- `apps/desktop/src/pdf/engine.test.ts` — client protocol and lifecycle contract tests.
- `apps/desktop/src/pdf/textLayer.test.ts` — geometry and selection tests.
- `apps/desktop/src/pdf/fixtures.ts` — deterministic fake contract data for component tests.
- `apps/desktop/src-tauri/mupdf/index.js` — native `mutool run` extraction script.
- `apps/desktop/src-tauri/src/mupdf_sidecar.rs` — sidecar discovery and bounded extraction protocol.
- `apps/desktop/src-tauri/src/mupdf_sidecar_tests.rs` — protocol, limits, and failure tests.
- `apps/desktop/scripts/build-mupdf-sidecar.mjs` — build and staging orchestration for the pinned official MuPDF source.
- `apps/desktop/scripts/verify-pdf-engine.mjs` — fails if an old engine remains in dependencies, source, or bundle.
- `apps/desktop/tests/pdf-bench/` — fixtures, runner, and stored baseline/result schema.
- `LICENSES/AGPL-3.0.txt`, `LICENSES/MuPDF-NOTICE.md`, `docs/building-mupdf.md` — distribution compliance and reproducible build instructions.

Modify these existing integration points:

- `apps/desktop/src/features/reader/ReaderPage.tsx`
- `apps/desktop/src/features/cards/SourceViewer.tsx`
- `apps/desktop/src/features/library/DocumentCard.tsx`
- `apps/desktop/src/main.tsx`
- Relevant frontend tests and `apps/desktop/src/test/setup.ts`
- `apps/desktop/src-tauri/src/indexer.rs`, `lib.rs`, and tests
- `apps/desktop/src-tauri/tauri.conf.json`, `build.rs`, and `Cargo.toml`
- `apps/desktop/package.json`, lockfiles, CI workflows, and project memory

## Pinned Version Rule

Pin MuPDF 1.28.0, the stable release verified while writing this plan, and record it once as `MUPDF_VERSION` in `apps/desktop/scripts/mupdf-version.mjs`. Use the exact same value for the npm package, native source tag, notices, and artifact metadata. Do not use caret or tilde ranges. The file is:

```js
export const MUPDF_VERSION = "1.28.0";
export const MUPDF_TAG = "1.28.0";
```

### Task 1: Record Baseline and Add Engine Guardrails

**Files:**
- Create: `apps/desktop/scripts/mupdf-version.mjs`
- Create: `apps/desktop/scripts/verify-pdf-engine.mjs`
- Create: `apps/desktop/tests/pdf-bench/benchmark.schema.json`
- Create: `apps/desktop/tests/pdf-bench/baseline.json`
- Modify: `apps/desktop/package.json`

- [ ] **Step 1: Add a failing dependency guard test**

Create `verify-pdf-engine.mjs` to inspect `package.json`, `package-lock.json`, `Cargo.toml`, `Cargo.lock`, `src`, and `src-tauri/src`. It accepts `--migration` while old engines are temporarily present and fails without that flag if it finds `pdfjs-dist`, `lopdf`, or direct `mupdf` imports outside `src/pdf/mupdf.worker.ts`.

```js
const forbiddenFinal = [/pdfjs-dist/, /\blopdf\b/];
const allowedMuPdfImport = "src/pdf/mupdf.worker.ts";
// Walk only tracked source/manifests; print every path and match, then exit 1.
```

- [ ] **Step 2: Verify the guard detects the current engines**

Run: `cd apps/desktop && node scripts/verify-pdf-engine.mjs`

Expected: exit 1 listing `package.json`, `src/features/reader/ReaderPage.tsx`, `src/features/cards/SourceViewer.tsx`, `src/features/library/DocumentCard.tsx`, and `src-tauri/Cargo.toml`.

- [ ] **Step 3: Add benchmark schema and capture baseline**

The JSON schema requires `coldOpenMs`, `warmOpenMs`, `firstPageMs`, `scrollDroppedFrameRatio`, `zoomSettleMs`, `searchMs`, `indexMs`, and `peakMemoryMb`, each with fixture name, five raw samples, median, machine, OS, build mode, and commit. Add a Playwright/native harness that exercises the existing app with the checked-in representative PDFs and writes `baseline.json`.

- [ ] **Step 4: Run baseline and preserve raw evidence**

Run: `cd apps/desktop && npm run benchmark:pdf -- --engine=baseline`

Expected: exit 0; `tests/pdf-bench/baseline.json` validates against the schema and contains five samples per latency category.

- [ ] **Step 5: Add migration-safe scripts and commit**

Add `benchmark:pdf` and `verify:pdf-engine:migration` scripts. Run:

```bash
cd apps/desktop
npm run verify:pdf-engine:migration
git add package.json scripts tests/pdf-bench
git commit -m "test: capture PDF engine performance baseline"
```

Expected: migration guard passes; commit succeeds.

### Task 2: Introduce the Engine Contract and Worker Client

**Files:**
- Create: `apps/desktop/src/pdf/types.ts`
- Create: `apps/desktop/src/pdf/PdfEngine.ts`
- Create: `apps/desktop/src/pdf/MuPdfEngine.ts`
- Create: `apps/desktop/src/pdf/engine.test.ts`

- [ ] **Step 1: Write failing protocol tests**

Test open request correlation, out-of-order replies, cancellation, worker crash rejection, document close, and engine disposal with a fake `WorkerLike`.

```ts
it("correlates out-of-order worker replies", async () => {
  const worker = new FakeWorker();
  const engine = new MuPdfEngine(() => worker);
  const first = engine.pageInfo("doc", 0);
  const second = engine.pageInfo("doc", 1);
  worker.replyTo(1, { page: 1, width: 612, height: 792, rotation: 0 });
  worker.replyTo(0, { page: 0, width: 595, height: 842, rotation: 0 });
  await expect(Promise.all([first, second])).resolves.toMatchObject([
    { page: 0 }, { page: 1 },
  ]);
});
```

- [ ] **Step 2: Confirm tests fail**

Run: `cd apps/desktop && npm test -- src/pdf/engine.test.ts`

Expected: FAIL because contract files do not exist.

- [ ] **Step 3: Define serializable contract types**

Define `PdfDocumentInfo`, `PdfPageInfo`, `PdfQuad`, `PdfTextLine`, `PdfTextPage`, `PdfLink`, `PdfOutlineNode`, `PdfSearchHit`, `PdfRenderRequest`, and `PdfRenderResult`. Use zero-based page numbers inside the engine and convert only at UI boundaries.

```ts
export interface PdfEngine {
  open(key: string, bytes: ArrayBuffer, signal?: AbortSignal): Promise<PdfDocumentInfo>;
  pageInfo(key: string, page: number, signal?: AbortSignal): Promise<PdfPageInfo>;
  render(key: string, request: PdfRenderRequest, signal?: AbortSignal): Promise<PdfRenderResult>;
  text(key: string, page: number, signal?: AbortSignal): Promise<PdfTextPage>;
  links(key: string, page: number, signal?: AbortSignal): Promise<PdfLink[]>;
  outline(key: string, signal?: AbortSignal): Promise<PdfOutlineNode[]>;
  search(key: string, query: string, signal?: AbortSignal): Promise<PdfSearchHit[]>;
  close(key: string): Promise<void>;
  dispose(): void;
}
```

- [ ] **Step 4: Implement minimal typed worker RPC client**

Use monotonically increasing request IDs, one pending promise map, transferable `ArrayBuffer`/`ImageBitmap`, `AbortSignal` cancellation messages, and a single fatal handler that rejects all pending requests before recreating the worker on the next call.

- [ ] **Step 5: Run tests and commit**

Run: `cd apps/desktop && npm test -- src/pdf/engine.test.ts`

Expected: PASS.

```bash
git add apps/desktop/src/pdf
git commit -m "feat: add asynchronous PDF engine contract"
```

### Task 3: Implement MuPDF WASM Worker

**Files:**
- Create: `apps/desktop/src/pdf/mupdf.worker.ts`
- Create: `apps/desktop/src/pdf/mupdf.worker.test.ts`
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/vite.config.ts`

- [ ] **Step 1: Pin MuPDF.js and write failing worker contract tests**

Install the exact pinned version with `npm install --save-exact mupdf@1.28.0`. Mock only the WASM API boundary in unit tests. Assert open/page geometry, bitmap transfer, structured text JSON parsing, links, recursive outline conversion, per-page search quads, cancellation, cache reuse, and cleanup.

- [ ] **Step 2: Run tests to verify the unimplemented worker fails**

Run: `cd apps/desktop && npm test -- src/pdf/mupdf.worker.test.ts`

Expected: FAIL because no worker handler exists.

- [ ] **Step 3: Implement document and per-page caches**

Open with `mupdf.Document.openDocument(bytes, "application/pdf")`; retain `{document, pages, displayLists, structuredText}` by document key. Enforce duplicate-key replacement by closing the prior entry first. Convert MuPDF exceptions to stable error codes: `invalid`, `password-required`, `cancelled`, and `engine-failed`.

- [ ] **Step 4: Implement render and extraction operations**

Render from a cached display list at `scale * devicePixelRatio`, create an `ImageBitmap`, and transfer it. Extract with `page.toStructuredText("preserve-whitespace,preserve-spans")`, parse `asJSON(1)`, and normalize coordinates. Use `page.getLinks()`, recursive outline traversal, and `StructuredText.search(query)` for geometry-bearing hits.

- [ ] **Step 5: Add bounded LRU eviction**

Track estimated bitmap bytes as `width * height * 4`; cap render cache at 256 MiB by default, never retain transferred bitmap ownership in both threads, and evict inactive display lists/text after the document-cache limit. Add test-only configurable budgets.

- [ ] **Step 6: Run worker tests and production build**

Run:

```bash
cd apps/desktop
npm test -- src/pdf/mupdf.worker.test.ts src/pdf/engine.test.ts
npm run build
```

Expected: tests pass; Vite emits a worker chunk and MuPDF WASM asset without Node polyfill errors.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/package.json apps/desktop/package-lock.json apps/desktop/vite.config.ts apps/desktop/src/pdf
git commit -m "feat: implement MuPDF WASM worker engine"
```

### Task 4: Build the MuPDF Text Layer

**Files:**
- Create: `apps/desktop/src/pdf/textLayer.ts`
- Create: `apps/desktop/src/pdf/textLayer.test.ts`
- Modify: `apps/desktop/src/styles/tokens.css`

- [ ] **Step 1: Write failing geometry and selection tests**

Cover horizontal text, rotated pages, vertical writing, whitespace preservation, Unicode, a selection confined to one page, and quote reconstruction.

```ts
expect(layoutTextLayer(page, { scale: 2, rotation: 90 })[0]).toMatchObject({
  text: "Hello",
  transform: expect.stringContaining("matrix("),
});
```

- [ ] **Step 2: Confirm failure**

Run: `cd apps/desktop && npm test -- src/pdf/textLayer.test.ts`

Expected: FAIL because `layoutTextLayer` does not exist.

- [ ] **Step 3: Implement text layout and selection mapping**

Create absolutely positioned spans from engine-owned line geometry, using page transforms shared with render geometry. Add `selectionToPdfRange(root, selection)` that returns page, normalized text, and MuPDF-space quads; return `null` when endpoints belong to different page roots.

- [ ] **Step 4: Run tests and commit**

```bash
cd apps/desktop
npm test -- src/pdf/textLayer.test.ts
git add src/pdf src/styles/tokens.css
git commit -m "feat: add MuPDF structured text layer"
```

Expected: PASS.

### Task 5: Migrate Covers and Reader Without Changing UX

**Files:**
- Modify: `apps/desktop/src/features/library/DocumentCard.tsx`
- Modify: `apps/desktop/src/features/library/DocumentCard.test.tsx`
- Modify: `apps/desktop/src/features/reader/ReaderPage.tsx`
- Modify: `apps/desktop/src/features/reader/ReaderPage.test.tsx`
- Modify: `apps/desktop/src/features/reader/readerSelection.ts`
- Modify: `apps/desktop/src/test/setup.ts`

- [ ] **Step 1: Replace PDF.js mocks with the engine fixture and add failing parity assertions**

Inject `PdfEngine` through optional component props defaulting to the shared MuPDF engine. Assert lazy cover open/render, page dimensions loaded before layout, visible-page priority, bitmap painting, text selection, link activation, outline navigation, search highlights, zoom anchoring, page persistence, tags, and cancellation on unmount.

- [ ] **Step 2: Confirm the new tests fail**

Run: `cd apps/desktop && npm test -- src/features/library/DocumentCard.test.tsx src/features/reader/ReaderPage.test.tsx`

Expected: FAIL because components still call PDF.js.

- [ ] **Step 3: Migrate `DocumentCard`**

Fetch bytes only after visibility, call `engine.open`, render page zero at cover resolution, paint the returned `ImageBitmap` to canvas, and close/cancel on cleanup. Preserve the current placeholder and error UI.

- [ ] **Step 4: Split focused reader engine hooks before migration**

Extract `usePdfDocument`, `usePdfSearch`, and `PdfPageSurface` into files under `features/reader/` so `ReaderPage.tsx` retains navigation/UI state. Each hook consumes only `PdfEngine`; no MuPDF imports are permitted.

- [ ] **Step 5: Migrate page rendering, text, links, outline, and search**

Keep one-based page numbers in React and convert to zero-based at every engine call. Preserve the existing IntersectionObserver thresholds, page-stack geometry, render-scale debounce, zoom anchor calculations, selection payloads, and `onPageChange` behavior.

- [ ] **Step 6: Run focused and full frontend tests**

Run:

```bash
cd apps/desktop
npm test -- src/features/library/DocumentCard.test.tsx src/features/reader/ReaderPage.test.tsx src/features/reader/readerSelection.test.ts
npm test
npm run build
```

Expected: all tests and production build pass.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/features apps/desktop/src/test apps/desktop/src/pdf
git commit -m "feat: migrate covers and reader to MuPDF"
```

### Task 6: Migrate Flashcard Source Viewer

**Files:**
- Modify: `apps/desktop/src/features/cards/SourceViewer.tsx`
- Create: `apps/desktop/src/features/cards/SourceViewer.test.tsx`
- Modify: `apps/desktop/src/main.tsx`

- [ ] **Step 1: Write failing source-view parity tests**

Assert document loading, jump to stored one-based page, quote lookup, highlight geometry, close cleanup, and graceful missing-quote behavior.

- [ ] **Step 2: Confirm failure**

Run: `cd apps/desktop && npm test -- src/features/cards/SourceViewer.test.tsx`

Expected: FAIL while `SourceViewer` still imports PDF.js viewer APIs.

- [ ] **Step 3: Implement source view with the shared engine**

Reuse `PdfPageSurface` for the selected page, call engine search for the saved quote, and overlay returned quads. Preserve the existing modal, navigation, and close semantics.

- [ ] **Step 4: Remove PDF.js global/CSS wiring and verify**

Delete `pdfjs-dist/web/pdf_viewer.css` from `main.tsx` and all `globalThis.pdfjsLib` setup. Run:

```bash
cd apps/desktop
npm test -- src/features/cards/SourceViewer.test.tsx src/features/cards/CardBrowser.test.tsx
npm run build
```

Expected: PASS and no PDF.js viewer chunk is emitted.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/features/cards apps/desktop/src/main.tsx
git commit -m "feat: migrate source viewer to MuPDF"
```

### Task 7: Replace lopdf Indexing With Native MuPDF Sidecar

**Files:**
- Create: `apps/desktop/src-tauri/mupdf/index.js`
- Create: `apps/desktop/src-tauri/src/mupdf_sidecar.rs`
- Create: `apps/desktop/src-tauri/src/mupdf_sidecar_tests.rs`
- Create: `apps/desktop/scripts/build-mupdf-sidecar.mjs`
- Modify: `apps/desktop/src-tauri/src/indexer.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/src/indexer_tests.rs`
- Modify: `apps/desktop/src-tauri/tests/pdf_extraction_isolation.rs`
- Modify: `apps/desktop/src-tauri/tauri.conf.json`
- Modify: `apps/desktop/src-tauri/build.rs`

- [ ] **Step 1: Write failing native protocol tests**

Use a fake sidecar executable to test argument safety, page count, page-delimited text, invalid UTF-8, nonzero exit, timeout, output cap, process kill, and filenames containing spaces/metacharacters. Keep the compressed-expansion isolation regression.

- [ ] **Step 2: Confirm tests fail**

Run: `cd apps/desktop/src-tauri && cargo test mupdf_sidecar -- --nocapture`

Expected: FAIL because `mupdf_sidecar` is absent.

- [ ] **Step 3: Implement the checked-in `mutool run` script**

The script accepts exactly one PDF path, opens it with `Document.openDocument`, rejects password-protected input, checks `countPages()` before extraction, calls `page.toStructuredText("preserve-whitespace").asText()` one page at a time, and writes the existing `pageCount\ntext` protocol. It must not read environment-provided code or network resources.

- [ ] **Step 4: Implement bounded sidecar execution**

Resolve only the Tauri-bundled sidecar path, pass the script and PDF path as separate argv values, inherit Unix limits from the existing extraction worker, capture stdout with the current 4 MiB bound, retain the five-second wall timeout, kill the entire process tree/job on failure, and map every failure to `PDF text extraction failed`.

- [ ] **Step 5: Stage pinned cross-platform binaries reproducibly**

Add the official MuPDF source at tag `1.28.0` as the repository submodule `third_party/mupdf`. `build-mupdf-sidecar.mjs` refuses a source checkout whose tag/version differs, invokes the documented release build for the host target, verifies `mutool -v` reports 1.28.0, hashes the result, and stages it under Tauri's external-binary naming convention. CI performs this source build separately on each target OS; application builds never download an unverified binary.

- [ ] **Step 6: Switch indexer and run isolation tests**

Remove `lopdf::Document` usage from `indexer.rs`; retain `index_document_with`, input/page/text budgets, parent protocol, and database state mapping.

Run:

```bash
cd apps/desktop/src-tauri
cargo test indexer -- --nocapture
cargo test --test pdf_extraction_isolation -- --nocapture
```

Expected: all indexer and isolation tests pass with MuPDF sidecar fixtures.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/scripts apps/desktop/src-tauri
git commit -m "feat: replace lopdf indexing with native MuPDF"
```

### Task 8: Remove Old Engines and Add AGPL Distribution Materials

**Files:**
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/package-lock.json`
- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Modify: `apps/desktop/src-tauri/Cargo.lock`
- Create: `LICENSES/AGPL-3.0.txt`
- Create: `LICENSES/MuPDF-NOTICE.md`
- Create: `docs/building-mupdf.md`
- Modify: project README/release packaging files

- [ ] **Step 1: Remove dependencies and obsolete code**

Run exact package removal and Cargo manifest edits:

```bash
cd apps/desktop
npm uninstall pdfjs-dist
cd src-tauri
cargo remove lopdf
```

Delete PDF.js worker imports, mocks, viewer CSS, global wiring, and lopdf-only fixture builders only after equivalent engine-neutral fixtures exist.

- [ ] **Step 2: Add complete license and build materials**

Copy the exact AGPL text and MuPDF notices from the pinned official source. Document commands and prerequisites that build both the WASM package and each native `mutool` artifact from the pinned tag, generate checksums, stage Tauri sidecars, and reproduce a release without private inputs.

- [ ] **Step 3: Run final engine guard**

Run: `cd apps/desktop && node scripts/verify-pdf-engine.mjs`

Expected: PASS; `mupdf` appears only in the approved worker and packaging/build files, while `pdfjs-dist` and `lopdf` have no dependency or source matches except migration history/docs explicitly excluded by the guard.

- [ ] **Step 4: Run full static verification**

```bash
cd apps/desktop
npm test
npm run build
cd src-tauri
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop LICENSES docs
git commit -m "chore: remove legacy PDF engines"
```

### Task 9: Cross-platform, Visual, E2E, and Performance Cutover

**Files:**
- Modify/Create: CI workflow files under `.github/workflows/`
- Create: `apps/desktop/tests/e2e/pdf-reader.spec.ts`
- Create: `apps/desktop/tests/pdf-visual/`
- Create: `apps/desktop/tests/pdf-bench/mupdf.json`
- Modify: `PROJECT_MEMORY.md`

- [ ] **Step 1: Add failing E2E and visual parity coverage**

Exercise import, cover, open, thumbnails, outline, mixed page sizes, scroll, zoom, search next/previous, selection-to-card, tags, persisted page, source viewer, Drive-cached open, malformed PDF, and failed index recovery. Store perceptual snapshots with documented thresholds; do not require exact PDF.js pixel equality.

- [ ] **Step 2: Run E2E locally and fix only migration regressions**

Run: `cd apps/desktop && npm run test:e2e`

Expected: all library, learning, and new PDF reader flows pass.

- [ ] **Step 3: Build all supported targets in CI**

Matrix: macOS arm64/x86_64, Windows x86_64, Linux x86_64. Each job stages the checksummed matching sidecar, runs frontend tests/build, Rust fmt/clippy/tests, builds the Tauri artifact, runs the engine guard against unpacked output, and uploads license/source materials with the binary.

- [ ] **Step 4: Run MuPDF benchmarks and compare medians**

Run:

```bash
cd apps/desktop
npm run benchmark:pdf -- --engine=mupdf
node tests/pdf-bench/compare.mjs tests/pdf-bench/baseline.json tests/pdf-bench/mupdf.json
```

Expected: MuPDF median is lower for cold open, warm open, first page, zoom settle, search, and index; dropped-frame ratio is lower; peak memory stays within the explicit budget. The comparator exits 1 on any latency regression.

- [ ] **Step 5: Perform documented manual checks**

On at least one macOS arm64 machine and CI artifacts for Windows/Linux, verify trackpad/pinch zoom, pointer anchoring, external link activation, selection fidelity, CJK/font fallback, encrypted/malformed errors, and offline Drive cache. Record OS, artifact hash, fixture, and result in the release checklist.

- [ ] **Step 6: Update project memory and commit**

Record the pinned MuPDF version, new engine boundaries, verified test totals, benchmark medians, supported artifacts, and removal of PDF.js/lopdf.

```bash
git add .github apps/desktop/tests PROJECT_MEMORY.md
git commit -m "test: verify MuPDF migration across platforms"
```

## Final Verification

Run from a clean checkout with all sidecars staged:

```bash
cd apps/desktop
npm ci
npm run verify:pdf-engine
npm test
npm run build
npm run test:e2e
cd src-tauri
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

Expected: every command exits 0. Then run the benchmark comparator and inspect unpacked artifacts for MuPDF version, sidecar presence, AGPL text, corresponding-source instructions, and absence of PDF.js/lopdf.
