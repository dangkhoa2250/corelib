# MuPDF Engine Migration Design

## Summary

Replace every PDF engine in the desktop application with MuPDF while preserving the existing user experience, application features, stored data, and cross-platform direction. The final application must contain neither `pdfjs-dist` nor `lopdf`, including as a fallback.

The project will use MuPDF under the GNU AGPL and remain open source. Distributed builds must include the required license notices, corresponding source, and reproducible build instructions for the MuPDF components.

## Goals

- Make MuPDF the application's only PDF engine.
- Improve cold open, warm open, rendering, scrolling, zooming, in-document search, and import-time indexing performance.
- Preserve every existing PDF-facing behavior and all non-PDF application functionality.
- Preserve the current SQLite schema, library records, managed files, Drive cache, reading progress, page tags, cards, and search data.
- Support macOS, Windows, and Linux without relying on platform-specific PDF APIs.
- Keep untrusted PDF parsing and extraction isolated from the desktop process where it is isolated today.

## Non-goals

- Redesigning the reader UI or changing its controls.
- Adding PDF editing, annotation authoring, form filling, signing, or other new PDF features.
- Changing the import model, Google Drive behavior, learning model, cards, or database schema.
- Keeping PDF.js or lopdf as a compatibility fallback.
- Expanding the application to non-PDF document formats supported by MuPDF.

## Current State

The application currently has two PDF engine boundaries:

- `pdfjs-dist` runs in the frontend and supplies page rendering, first-page covers, thumbnails, page geometry, text layers, selection, outline data, link annotations, in-document search, and source viewing.
- `lopdf` runs in a resource-limited Rust child process and supplies import-time text extraction and page counts for SQLite full-text indexing.

The migration must replace both boundaries. Replacing only the reader would leave `lopdf` as a second PDF engine; replacing only indexing would leave PDF.js as the primary reader engine.

## Selected Architecture

Use MuPDF in two runtime forms, pinned to the same MuPDF release:

1. MuPDF WebAssembly in a Web Worker for interactive reader work.
2. Native MuPDF in the existing resource-limited child-process architecture for background extraction and indexing.

Both runtime forms use the same engine. The split places interactive rendering next to the WebView canvas and keeps durable background indexing independent from the WebView lifecycle.

A native-only reader was rejected because transferring large page bitmaps and detailed text geometry through Tauri IPC would add latency and complexity to scrolling, zooming, and selection. A WASM-only solution was rejected because import indexing must survive reader navigation and remain controlled by the native scheduler and database lifecycle.

## Frontend Engine Boundary

Introduce an application-owned `PdfEngine` interface. Reader and library components must not import MuPDF directly. The interface covers only the capabilities the application already consumes:

- Open and close a document from bytes.
- Return page count and page geometry.
- Render a page at a requested transform and device pixel ratio.
- Return structured page text with character or span geometry and reading order.
- Return the document outline and resolve outline destinations.
- Return link and supported annotation geometry and destinations.
- Search document text and return page-local match geometry.
- Cancel queued or active work.

`MuPdfWebWorkerEngine` implements this contract. Messages between React and the worker use serializable application-owned types, not MuPDF objects. This prevents MuPDF-specific types from spreading into `ReaderPage`, `DocumentCard`, or `SourceViewer` and makes behavioral contract tests possible.

### Document Loading

The frontend continues to obtain a managed or cached document URL through the existing application API. It fetches the bytes and transfers them to the MuPDF worker. The worker opens the document once, retains its handle, and immediately returns:

- Page count.
- Geometry for every page.
- Outline data when available.

Returning page geometry before rendering allows React to build the final scroll layout without intermediate page-size reflow.

### Page Presentation

Each visible page is composed from three MuPDF-derived data layers:

- A rendered bitmap for visual content.
- Structured text geometry for selection, copying, translation, card creation, search highlighting, and source highlighting.
- Link and supported annotation geometry for existing interactions.

The current React toolbar, sidebar, scrolling stage, zoom behavior, page state, tags, selection toolbar, composer integration, and styling remain responsible for the UI. MuPDF replaces the source of PDF data, not the product behavior.

### Scheduling and Cache

The worker prioritizes the current page, then neighboring pages, thumbnails, and speculative work. Work that is no longer useful after navigation or zoom is cancellable.

Use bounded caches:

- Open document handles for fast reopen.
- Per-page display lists and structured text to avoid repeated parsing during zoom, search, and selection.
- Rendered bitmaps keyed by page and render scale, governed by an explicit memory budget and LRU eviction.

Visible and adjacent pages are protected from eviction while in active use. Closing a document releases its MuPDF objects unless the bounded warm-document cache retains it.

## Native Indexing Boundary

Keep the existing database scheduling, job states, and child-process isolation protocol. Replace the worker's `lopdf::Document` parsing and text extraction with native MuPDF.

The worker must:

- Validate the input file and configured input budget before parsing.
- Open the document with MuPDF and reject documents that require an unavailable password.
- Enforce the configured page-count budget.
- Extract text one page at a time in reading order.
- Enforce the output budget incrementally.
- Return the page count and extracted text through the existing bounded parent/worker protocol.
- Exit unsuccessfully on parsing, extraction, timeout, resource-limit, or output-limit failure.

The parent retains its output cap, wall-clock deadline, process termination, and recoverable failure mapping. An indexing failure leaves the document readable and maps to the existing `ready` document state with a failed index state.

Native MuPDF integration must be reproducibly built for supported target triples. The initial release matrix is:

- macOS arm64 and x86_64.
- Windows x86_64.
- Linux x86_64.

The build structure must allow Windows arm64 and Linux arm64 artifacts to be added without changing application-level interfaces.

## Preserved Behavior

The migration is incomplete unless all of the following continue to work:

- Local import validation, hashing, deduplication, atomic managed copies, and recovery.
- Google Drive selection, download-on-demand, removable cache, offline cached reading, and cache clearing.
- First-page library covers and lazy cover generation.
- Lazy full-page rendering and continuous scrolling.
- Button zoom, trackpad or pinch zoom, and pointer-anchored zoom behavior.
- Page thumbnails, outline navigation, direct page navigation, and mixed page sizes.
- In-document search, next/previous result navigation, and visual result highlighting.
- Text selection, copy, translation, pronunciation flow, card creation, and cross-page selection guards.
- Persisted last-read page and document page count.
- Page tags.
- Flashcard source viewing and source quote highlighting.
- SQLite full-text indexing and global command-palette search.
- Existing recoverable loading and indexing error states.

No database migration is required. Existing library files and records remain valid inputs to the new engine.

## Error Handling and Security

Malformed, encrypted, unsupported, or resource-exhausting PDFs must not crash or permanently stall the desktop application.

- Native extraction remains in a local child process with hard resource limits where supported, a parent-enforced timeout, bounded output, and forced termination on violation.
- Platforms must not silently fall back to in-process parsing when required isolation controls are unavailable. Equivalent platform-specific process limits may be implemented to retain safe indexing support.
- MuPDF WASM runs outside the UI thread. Worker failure is contained, reported through the engine contract, and recoverable by recreating the worker.
- Rendering failure is scoped to the affected page when the document remains usable.
- Cancelling a render, search, or document load is not presented as a document failure.
- Index failure does not delete the library record or managed file and does not prevent an independent reader open attempt.
- User-facing error behavior and recovery actions remain consistent with the current application.

## Performance Strategy

Establish the current implementation as the baseline before migration. Measure with the same application build mode, machine, fixture set, viewport, zoom levels, and repeated-run protocol.

The benchmark suite records at least:

- Cold document open to usable first page.
- Warm reopen to usable first page.
- First-page and representative complex-page render duration.
- Continuous scroll frame stability and page-ready latency.
- Zoom response and final high-resolution render latency.
- Full-document search latency.
- Import-to-index-ready duration.
- Peak memory during large-document reading and indexing.

The final implementation must show an improvement over the current baseline in each latency category. It must not trade an unbounded memory increase for latency. Exact numeric release thresholds will be recorded from repeatable baseline measurements in the implementation plan rather than invented before measurement.

## Test Strategy

### Engine Contract Tests

Run the frontend adapter contract against MuPDF for:

- Page count and geometry.
- Bitmap dimensions and render completion.
- Structured text content, reading order, and geometry.
- Outline hierarchy and destination resolution.
- External and internal links.
- Search results and match rectangles.
- Cancellation, malformed input, encrypted input, and worker restart.

Test native extraction for page count, text ordering, resource limits, bounded output, worker timeout, malformed input, encrypted input, and parent survival after worker termination.

### PDF Fixtures

Maintain fixtures covering:

- Ordinary text PDFs.
- Image-only/scanned pages.
- Embedded and substituted fonts.
- Unicode, CJK, and right-to-left text represented in current user data.
- Rotated pages and mixed page dimensions.
- Internal links, external links, outlines, and supported annotations.
- Encrypted documents.
- Malformed documents.
- Large and highly compressed documents.

### Regression and Visual Tests

Retain and adapt tests for the reader, covers, source viewer, card selection, Drive cache, persisted progress, page tags, and global search. Compare representative rendered pages with perceptual or threshold-based image comparison because antialiasing differences between PDF.js and MuPDF are expected; exact pixel equality is not a compatibility requirement.

Run production frontend builds, frontend tests, Rust unit and integration tests, formatting, linting, and application E2E flows. CI must build the supported macOS, Windows, and Linux artifacts and verify that neither `pdfjs-dist` nor `lopdf` remains in source imports, dependency manifests, lockfile dependency graphs, or shipped bundles.

## Migration Sequence and Cutover

Implement the migration behind the application-owned engine boundary while the existing implementation remains available only as a development reference. Establish baseline measurements and parity fixtures first. Then:

1. Implement and validate the MuPDF frontend worker adapter.
2. Move covers, the main reader, and source viewer to the adapter.
3. Implement and validate native MuPDF extraction in the isolated worker.
4. Run the complete parity, regression, visual, security, and benchmark suites.
5. Remove PDF.js, lopdf, their workers, imports, CSS dependencies, mocks, and build configuration.
6. Verify the final dependency graph and all supported platform builds.

The shipped result has no runtime fallback. During development, side-by-side comparison tooling may exist only in tests or non-production benchmark code and is removed from the production dependency graph at cutover.

## Licensing and Distribution

The application adopts the GNU AGPL path for MuPDF and remains open source. Before distributing binaries, the repository and release artifacts must include:

- The applicable GNU AGPL license text and MuPDF copyright notices.
- Corresponding source for the distributed application and integrated MuPDF components.
- Source and scripts needed to rebuild the bundled WASM and native MuPDF artifacts.
- Attribution and offer/access instructions required by the chosen distribution process.

Licensing files and release packaging must be reviewed against the exact pinned MuPDF release before the first distribution. This section records the project's licensing intent and engineering requirements; it is not legal advice.

## Completion Criteria

The migration is complete only when:

- MuPDF is the only PDF engine in the application.
- Every preserved behavior in this design passes automated tests or documented manual verification where automation is impractical.
- Existing application data opens without migration or loss.
- Security isolation and resource-boundary tests pass.
- Benchmarks demonstrate improvements over the recorded PDF.js/lopdf baseline across cold open, warm open, rendering, scrolling/zoom response, search, and indexing, without unbounded memory growth.
- Production builds succeed for macOS, Windows, and Linux.
- PDF.js and lopdf are absent from manifests, lockfile graphs, source imports, and distributed artifacts.
- AGPL source, notices, and reproducible build materials accompany distributed builds.

