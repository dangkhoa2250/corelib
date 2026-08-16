# Implementation Plan - PDF Reader Search Bar & Results Preview

Revamp the PDF Reader search feature to match macOS Preview:
1. Replace the inline search match count/next button in the top toolbar with a secondary toolbar below the header containing `Sort By:` (`Search Rank` | `Page Order`), `Found on X pages`, navigation buttons `<` `>`, and `Done`.
2. Add a search results view in the sidebar with page thumbnail previews, match counts, and text snippets with bolded keywords.
3. Add yellow background highlighting (`mix-blend-mode: multiply; background-color: #fef025`) for search query matches across rendered PDF pages.

## User Review Required

> [!NOTE]
> - The secondary search bar automatically appears below the toolbar when a search query is active and results are found (or while searching).
> - Clicking `Done` or pressing `Escape` clears the search query, closes the secondary search bar, removes yellow highlights, and returns the sidebar to the normal Pages view.
> - The sidebar displays the search results in either `Search Rank` order (sorted by number of matches descending) or `Page Order` (sorted by page number ascending).

## Proposed Changes

### Desktop Reader Feature

#### [MODIFY] [ReaderPage.tsx](file:///Users/jason/project/corelib/apps/desktop/src/features/reader/ReaderPage.tsx)
- Define `SearchResultItem` interface `{ pageNumber: number; matchCount: number; snippets: string[] }`.
- Update `handleSearch` to extract match counts and context snippets around matches across pages.
- Add `sortBy` state (`"rank" | "page"`, default `"page"` or `"rank"`).
- Implement secondary search bar beneath the main toolbar with:
  - Left: `Sort By:` with `Search Rank` and `Page Order` segmented buttons.
  - Right: `Found on X pages` (or `Found on 1 page` / `Searching...`), segmented `<` and `>` buttons, and `Done` button.
- In sidebar:
  - When `searchQuery` and `searchResults` exist, display the search results list with thumbnail preview (`ThumbnailPage`), `Page X`, `N matches`, and highlighted snippet text.
  - Clicking any search result navigates to that page.
- Pass `searchQuery` to `PdfPage` and apply `applySearchHighlight` to the `textLayer` DOM elements when rendered or when `searchQuery` changes.
- Remove old inline next button / results count from the search input form in the top toolbar.

#### [MODIFY] [reader.css](file:///Users/jason/project/corelib/apps/desktop/src/features/reader/reader.css)
- Add styles for:
  - `.reader-search-bar`: Secondary toolbar below header with macOS Preview styling.
  - `.reader-sort-segmented`: Segmented pill control for Sort By (`Search Rank` vs `Page Order`).
  - `.reader-search-nav-group`: Segmented pill control for `<` and `>` navigation.
  - `.reader-search-done-btn`: Done button.
  - `.reader-search-sidebar-item`: Sidebar result card with thumbnail, page number, match count, and snippet lines.
  - `.reader-search-snippet`: Snippet line styles with bold text for matching query.
  - `.reader-search-highlight` / `.textLayer mark`: Yellow highlight styling with `mix-blend-mode: multiply; background-color: #fef025;`.

#### [MODIFY] [ReaderPage.test.tsx](file:///Users/jason/project/corelib/apps/desktop/src/features/reader/ReaderPage.test.tsx)
- Add unit and integration tests for:
  - Searching for text in the document and displaying the secondary search bar.
  - Sorting by Search Rank and Page Order.
  - Navigating with `<` and `>` buttons.
  - Clicking `Done` to close search.
  - Clicking a search result item in the sidebar to navigate to that page.
  - Verifying yellow highlight mark in textLayer.

## Verification Plan

### Automated Tests
- Run `npm --prefix apps/desktop test src/features/reader/ReaderPage.test.tsx`
- Run `npm --prefix apps/desktop test`
- Run `npm --prefix apps/desktop run typecheck` or `npm run build`

### Manual Verification
- Test searching a query in PDF reader.
- Confirm secondary bar displays `Sort By: [Search Rank] [Page Order]` and `Found on X pages [ < | > ] [ Done ]`.
- Confirm sidebar shows page thumbnails with match counts and snippets.
- Confirm text is highlighted with yellow background on the PDF page.
