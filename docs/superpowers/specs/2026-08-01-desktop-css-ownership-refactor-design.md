# Desktop CSS Ownership Refactor Design

**Date:** 2026-08-01

**Status:** Approved design, pending written-spec review

**Scope:** `apps/desktop` React/Tauri styling architecture

## Summary

Refactor the desktop application's global CSS into a small foundation layer and feature-owned stylesheets without changing visual output, runtime behavior, selector semantics, or loading strategy.

The current `apps/desktop/src/styles/tokens.css` is approximately 4,488 lines and contains about 613 rule blocks. Only its opening theme blocks are design tokens; the rest includes application layout, shared controls, and styles for Settings, Library, Memora, Reader, Cards, Review, Search, and Drive. This makes ownership unclear and causes unrelated changes and tests to accumulate in a file whose name implies a much narrower responsibility.

This work optimizes maintainability and ownership. It is not a performance project.

## Goals

- Make `tokens.css` contain only root typography defaults, light-theme custom properties, and dark-theme custom-property overrides.
- Keep truly global element behavior in a dedicated base stylesheet.
- Keep reusable global UI primitives in a dedicated primitives stylesheet.
- Put feature CSS beside the TypeScript/TSX files that own the feature.
- Keep one stylesheet per feature unless a feature later demonstrates a concrete need for further decomposition.
- Preserve the current synchronous loading strategy and make stylesheet order explicit in one entry point.
- Preserve all current selectors, declarations, responsive rules, keyframes, theme behavior, and WKWebView scrollbar contracts.
- Move CSS regression tests to the same ownership boundaries as the styles they validate.

## Non-goals

- Route-level lazy loading or JavaScript code splitting.
- Reducing initial CSS transfer size.
- Converting styles to CSS Modules, Sass, CSS-in-JS, Tailwind, or another styling system.
- Adding cascade layers.
- Renaming BEM classes or changing JSX `className` values.
- Redesigning screens, normalizing existing visual inconsistencies, or deduplicating declarations.
- Splitting every component into its own stylesheet.
- Reworking scrollable surfaces or replacing existing scrolling implementations.

## Architecture

### Foundation styles

The global foundation remains under `apps/desktop/src/styles`:

```text
apps/desktop/src/styles/
├── tokens.css
├── base.css
└── primitives.css
```

Responsibilities:

- `tokens.css`: `:root` and `[data-theme="dark"]` theme definitions. It may set root typography and semantic root color as part of the theme contract, but it must not contain class selectors, keyframes, media queries, component layout, or feature selectors.
- `base.css`: box sizing, document/root sizing, form-element defaults, focus-visible behavior, Tauri drag-region behavior, and the existing native scrollbar fallback contract.
- `primitives.css`: global reusable primitives such as `.ui-button`, `.action-menu`, `.combobox`, `.scroll-area`, `.model-brand-icon`, and `.provider-brand-icon`.

### Application shell

Application-level shell styling is owned by:

```text
apps/desktop/src/app/app.css
```

It contains `.app-shell`, `.app-sidebar`, and their modifiers and descendants. It does not contain feature-page styles.

### Feature styles

Feature styles are colocated with the feature source:

```text
apps/desktop/src/features/
├── settings/settings.css
├── library/library.css
├── drive/drive.css
├── memora/memora.css
├── cards/cards.css
├── reader/reader.css
├── review/review.css
├── search/search.css
└── statistics/statistics.css
```

The files have the following ownership:

| Stylesheet | Selector and behavior ownership |
| --- | --- |
| `settings/settings.css` | `.settings-page` and Settings provider/editor/modal styles |
| `library/library.css` | `.library-page`, `.library-import-menu`, `.document-grid`, `.document-card`, and cover-loading animation styles |
| `drive/drive.css` | `.drive-picker`, `.drive-setup-modal`, their overlays, and modal keyframes |
| `memora/memora.css` | `.memora-*`, `.deck-detail-page`, and `.deck-learning-dialog` |
| `cards/cards.css` | `.card-browser`, `.card-side-panel`, `.source-viewer`, and their keyframes |
| `reader/reader.css` | `.reader-*`, reader PDF/canvas/outline helpers, and reader-responsive rules |
| `review/review.css` | `.review-page` styles and Review overrides targeting shared children such as `.source-viewer` |
| `search/search.css` | `.command-palette` styles and responsive rules |
| `statistics/statistics.css` | Existing Statistics feature stylesheet, retained as one file |

No empty `account.css` or `admin.css` file is introduced. A feature receives a stylesheet only when it owns CSS rules.

### Shared-selector ownership

A selector is owned by the component or feature that defines the reusable surface, not every consumer that renders it. For example, base `.source-viewer` styles belong to `cards/cards.css` because `SourceViewer.tsx` is owned by the Cards feature. A consumer-specific override such as `.review-page__split > .source-viewer` remains in `review/review.css` because Review owns the surrounding layout decision.

Media queries and keyframes move with the rules that use them. The migration must classify selectors by ownership rather than cut the existing file at arbitrary line ranges, because unrelated groups are currently interleaved.

## Loading and Cascade Contract

All CSS remains synchronously imported from `apps/desktop/src/main.tsx`. Feature components do not import their stylesheets in this refactor. Centralizing imports makes global source order visible and prevents it from depending on the TypeScript component-import graph.

The required order is:

```tsx
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/primitives.css";
import "./app/app.css";
import "./features/settings/settings.css";
import "./features/library/library.css";
import "./features/memora/memora.css";
import "./features/cards/cards.css";
import "./features/reader/reader.css";
import "./features/review/review.css";
import "./features/search/search.css";
import "./features/drive/drive.css";
import "./features/statistics/statistics.css";
import "pdfjs-dist/web/pdf_viewer.css";
```

The dependency order is foundation, primitives, application shell, features, then the existing external PDF viewer stylesheet. `cards.css` precedes `review.css` so Review's context-specific SourceViewer overrides remain later than the shared SourceViewer rules.

The current monolithic stylesheet contains historically interleaved feature blocks, so grouping by ownership cannot retain every unrelated block's absolute source position. The refactor therefore preserves cascade through explicit dependency ordering, namespaced BEM selectors, regression tests, production-build inspection, and fresh desktop runtime verification. It does not assume that copying declarations alone proves equivalence.

## Migration Rules

- Move rules without renaming selectors or changing declaration values.
- Preserve selector grouping, specificity, declaration ordering, media-query conditions, and keyframe bodies.
- Do not combine the move with formatting, deduplication, shorthand conversion, or visual cleanup.
- Preserve comments that document platform behavior or non-obvious layout constraints.
- Keep feature-specific responsive rules in the same feature stylesheet as their base rules.
- Keep all light/dark colors based on existing theme tokens.
- Do not introduce new `overflow: auto`, `overflow-y: auto`, or scrollbar pseudo-element rules on feature surfaces.
- Keep the existing `ScrollArea` thumb-side content inset contract of at least 20px wherever it is currently required.

## Test Ownership

The current `apps/desktop/src/styles/tokens.test.ts` reads both `tokens.css` and feature styles and validates unrelated screens. Tests will be redistributed only where an existing assertion has a clear owner:

```text
apps/desktop/src/styles/
├── tokens.test.ts
├── base.test.ts
└── primitives.test.ts

apps/desktop/src/features/
├── library/libraryStyles.test.ts
├── cards/cardsStyles.test.ts
├── reader/readerStyles.test.ts
├── review/reviewStyles.test.ts
├── search/searchStyles.test.ts
└── statistics/statisticsStyles.test.ts
```

The migration retains the meaning of existing assertions. It updates the stylesheet paths and moves the assertions to the owning test file. It does not create empty style-test files for features without existing CSS-specific assertions.

An architecture-level test must verify:

- `tokens.css` has no class selectors, media queries, or keyframes.
- Every new stylesheet is imported exactly once from `main.tsx`.
- The imports appear in the required order.
- Feature selector families are absent from `tokens.css`.
- The Statistics stylesheet remains owned by the Statistics feature.

Existing scroll-surface regression assertions remain mandatory, including:

- Statistics uses `ScrollArea` rather than native feature-level scrolling.
- The Statistics entity-pane content retains `padding-right: 20px`.
- Reader continues using the reusable `ScrollArea` for thumbnail and PDF panes.
- Review scroll content retains its thumb-side inset and does not reintroduce native `overflow-y: auto`.
- Feature styles do not add native scrollbar pseudo-element overrides.

## Verification

### Automated verification

The implementation must pass:

- Focused CSS architecture and ownership tests during each migration step.
- The complete desktop Vitest suite.
- TypeScript compilation and the Vite production build via the desktop build script.

The implementation must also compare the pre-refactor selector, declaration, media-query, and keyframe inventory against the post-refactor stylesheet set. No existing item may disappear. Any source-order difference must be explained by the approved ownership order rather than accidental omission.

The production CSS output must not show a meaningful size increase. Small minifier-induced differences are acceptable; newly duplicated rule blocks are not.

### Desktop runtime verification

Before reporting manual macOS verification:

1. Record `git rev-parse --short HEAD` and `git status --short`.
2. Identify and do not reuse an existing `tauri dev`, Vite, or `library_desktop` process.
3. Start a fresh `tauri dev` runtime from the current checkout.
4. Check representative screens in both light and dark themes: application shell, Settings, Library/import cards, Memora/deck detail, Card Browser/SourceViewer, Reader, Review, Command Palette, Drive Picker, and Statistics.
5. On long Reader, Card Browser, and Statistics content, verify that no white native scrollbar track appears and the custom thumb does not cover text, selected-row backgrounds, buttons, or controls.

A passing Vitest suite or Vite build is not evidence of correct WKWebView rendering. If fresh runtime verification is not performed, the final implementation handoff must say so explicitly.

## Acceptance Criteria

- `tokens.css` contains only its approved theme responsibility.
- Shared global, shell, and feature styles reside in their specified ownership files.
- `statistics.css` remains a single feature stylesheet.
- Styles remain global BEM CSS; no scoping system or lazy loading is added.
- `main.tsx` contains the approved, deterministic stylesheet import order.
- No selector, declaration, media query, keyframe, or relevant platform comment is accidentally lost.
- Existing automated tests pass after ownership migration.
- The production desktop frontend build passes without meaningful CSS growth or rule duplication.
- Fresh macOS/Tauri verification finds no visual, theme, focus, layout, or scrollbar regression on the representative surfaces.

## Rollout Strategy

Perform the refactor incrementally in reviewable commits:

1. Establish foundation boundaries and architecture assertions.
2. Move shared primitives and application-shell styles.
3. Move feature styles in small ownership groups while migrating their CSS assertions.
4. Complete inventory, full-suite, build, and fresh desktop runtime verification.

Each intermediate commit must leave the desktop stylesheet graph loadable and the relevant focused tests passing. The refactor does not require a compatibility shim because class names and loading remain unchanged.
