# Reader Toolbar & Flashcard Panel Responsive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the reader toolbar's Tag and Zoom controls into a "⋯" menu and turn the flashcard panel into an overlay below 900px, so nothing overlaps or sits below the toolbar at narrow widths.

**Architecture:** Keep the inline Tag and Zoom controls but hide them with a CSS media query and render a single `ReaderToolbarOverflowMenu` (shown only ≤900px) that carries the Tag toggle/list and the Zoom row. Wrap the reader's `CardComposer` in a `.reader-composer` container that is an in-flow 360px flex child above 900px and an absolutely-positioned overlay at or below 900px.

**Tech Stack:** React 19, TypeScript, CSS media queries, Vitest, Testing Library, Tauri/WKWebView.

## Global Constraints

- Breakpoint is exactly `max-width: 900px`, reusing the existing `@media (max-width: 900px)` block in `reader.css`.
- Page indicator ("Page X of Y") stays visible and centered at every width.
- The overlay must scope to the reader's composer only, never the Add/Edit Card `CardSidePanel`.
- No backdrop is added to the overlay panel.
- No new routes, commands, or user-invokable actions.

---

### Task 1: Toolbar Overflow Menu

**Files:**
- Create: `apps/desktop/src/features/reader/ReaderToolbarOverflowMenu.tsx`
- Modify: `apps/desktop/src/features/reader/ReaderPage.tsx:760-876,1246-1414`
- Modify: `apps/desktop/src/features/reader/reader.css:120-197,255-268`
- Test: `apps/desktop/src/features/reader/ReaderToolbarOverflowMenu.test.tsx`

**Interfaces:**
- Consumes: `PageTag` from `../../domain/document`; the reader's `zoomBy(delta, pointerX, pointerY)`, `pagesContainerRef`, `handleToggleTag`, `handlePageSelect`, `pageTags`, `currentPage`, `togglePageTag`.
- Produces: `ReaderToolbarOverflowMenu` component with props
  `{ zoomPercent: number; onZoomBy: (delta: number) => void; currentTagged?: boolean; currentPage?: number; pageTags?: PageTag[]; onToggleTag?: () => void; onSelectTaggedPage?: (page: number) => void }`,
  plus `zoomPercent` state and `handleZoomBy(delta)` in `ReaderPage`.

- [ ] **Step 1: Write the failing component test**

  In `ReaderToolbarOverflowMenu.test.tsx`:

  ```tsx
  import { render, screen } from "@testing-library/react";
  import userEvent from "@testing-library/user-event";
  import { expect, test, vi } from "vitest";
  import { ReaderToolbarOverflowMenu } from "./ReaderToolbarOverflowMenu";

  test("opens a menu exposing Tag and Zoom controls", async () => {
    const user = userEvent.setup();
    const onToggleTag = vi.fn();
    const onZoomBy = vi.fn();
    render(
      <ReaderToolbarOverflowMenu
        zoomPercent={120}
        onZoomBy={onZoomBy}
        currentTagged
        currentPage={3}
        pageTags={[{ id: "t1", page: 3 }]}
        onToggleTag={onToggleTag}
        onSelectTaggedPage={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByText("✓ Page 3 tagged")).toBeInTheDocument();
    expect(screen.getByText("120%")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(onZoomBy).toHaveBeenCalledWith(0.1);

    await user.click(screen.getByText("✓ Page 3 tagged"));
    expect(onToggleTag).toHaveBeenCalledOnce();
  });
  ```

- [ ] **Step 2: Run the test to verify it fails**

  Run: `npm test -- src/features/reader/ReaderToolbarOverflowMenu.test.tsx`
  Expected: FAIL because `ReaderToolbarOverflowMenu` does not exist.

- [ ] **Step 3: Implement the overflow menu component**

  Create `ReaderToolbarOverflowMenu.tsx`:

  ```tsx
  import { useEffect, useRef, useState } from "react";
  import type { PageTag } from "../../domain/document";

  export interface ReaderToolbarOverflowMenuProps {
    zoomPercent: number;
    onZoomBy: (delta: number) => void;
    currentTagged?: boolean;
    currentPage?: number;
    pageTags?: PageTag[];
    onToggleTag?: () => void;
    onSelectTaggedPage?: (page: number) => void;
  }

  export function ReaderToolbarOverflowMenu({
    zoomPercent,
    onZoomBy,
    currentTagged,
    currentPage,
    pageTags = [],
    onToggleTag,
    onSelectTaggedPage,
  }: ReaderToolbarOverflowMenuProps) {
    const [open, setOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!open) return;
      const close = (event: MouseEvent) => {
        if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
      };
      window.document.addEventListener("click", close);
      return () => window.document.removeEventListener("click", close);
    }, [open]);

    return (
      <div className="reader-toolbar__overflow" ref={menuRef}>
        <button
          type="button"
          className="reader-icon-button"
          aria-label="More actions"
          title="More actions"
          aria-expanded={open}
          onClick={(event) => {
            event.stopPropagation();
            setOpen((current) => !current);
          }}
        >
          ⋯
        </button>
        {open ? (
          <div className="reader-toolbar__overflow-menu" onClick={(event) => event.stopPropagation()}>
            {onToggleTag && currentPage !== undefined ? (
              <>
                <button
                  type="button"
                  className="reader-toolbar__overflow-item"
                  onClick={() => {
                    onToggleTag();
                    setOpen(false);
                  }}
                >
                  {currentTagged ? `✓ Page ${currentPage} tagged` : `+ Tag Page ${currentPage}`}
                </button>
                {pageTags.length > 0 ? (
                  <div className="reader-toolbar__overflow-tags">
                    {pageTags.map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        className={`reader-toolbar__overflow-item${tag.page === currentPage ? " is-active" : ""}`}
                        onClick={() => {
                          onSelectTaggedPage?.(tag.page);
                          setOpen(false);
                        }}
                      >
                        Page {tag.page}
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
            <div className="reader-toolbar__overflow-zoom">
              <button
                type="button"
                className="reader-icon-button"
                aria-label="Zoom out"
                title="Zoom out"
                onClick={() => onZoomBy(-0.1)}
              >
                −
              </button>
              <span className="reader-zoom-label">{zoomPercent}%</span>
              <button
                type="button"
                className="reader-icon-button"
                aria-label="Zoom in"
                title="Zoom in"
                onClick={() => onZoomBy(0.1)}
              >
                +
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }
  ```

- [ ] **Step 4: Run the component test to verify it passes**

  Run: `npm test -- src/features/reader/ReaderToolbarOverflowMenu.test.tsx`
  Expected: PASS.

- [ ] **Step 5: Convert the zoom label to state in ReaderPage**

  Replace `const zoomLabelRef = useRef<HTMLSpanElement | null>(null);` (near line 762) with:

  ```tsx
  const [zoomPercent, setZoomPercent] = useState(100);
  ```

  In `applyGestureScale` (near line 874) replace:

  ```tsx
  if (zoomLabelRef.current) {
    zoomLabelRef.current.textContent = `${Math.round(scale * 100)}%`;
  }
  ```

  with:

  ```tsx
  setZoomPercent(Math.round(scale * 100));
  ```

  Replace the inline zoom label `<span ref={zoomLabelRef} className="reader-zoom-label">100%</span>` (line 1367) with:

  ```tsx
  <span className="reader-zoom-label">{zoomPercent}%</span>
  ```

  Add a `handleZoomBy` helper next to `zoomBy`:

  ```tsx
  const handleZoomBy = useCallback((delta: number) => {
    const container = pagesContainerRef.current;
    if (!container) return;
    zoomBy(delta, container.clientWidth / 2, container.clientHeight / 2);
  }, [zoomBy]);
  ```

- [ ] **Step 6: Integrate the overflow menu into the toolbar**

  Import `ReaderToolbarOverflowMenu` at the top of `ReaderPage.tsx`. Add class
  `reader-toolbar__collapsible` to the tag menu wrapper
  (`<div className="reader-tag-menu">`) and to the zoom group
  (`<div className="reader-toolbar__group">` that contains the −/label/+). After
  the zoom group, render:

  ```tsx
  <ReaderToolbarOverflowMenu
    zoomPercent={zoomPercent}
    onZoomBy={handleZoomBy}
    currentTagged={togglePageTag ? currentTagged : undefined}
    currentPage={togglePageTag ? currentPage : undefined}
    pageTags={togglePageTag ? pageTags : []}
    onToggleTag={togglePageTag ? handleToggleTag : undefined}
    onSelectTaggedPage={togglePageTag ? handlePageSelect : undefined}
  />
  ```

- [ ] **Step 7: Add the show/hide CSS**

  In `reader.css`, add a base rule near `.reader-toolbar__group`:

  ```css
  .reader-toolbar__overflow {
    position: relative;
    display: none;
  }
  ```

  In the existing `@media (max-width: 900px)` block, add:

  ```css
  .reader-toolbar__collapsible {
    display: none;
  }

  .reader-toolbar__overflow {
    display: inline-flex;
  }
  ```

  Add styles for the dropdown (near `.reader-tag-dropdown`):

  ```css
  .reader-toolbar__overflow-menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    min-width: 200px;
    padding: 6px;
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    background: var(--surface-1);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
    z-index: 100;
  }

  .reader-toolbar__overflow-item {
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

  .reader-toolbar__overflow-item:hover {
    background: var(--interactive-hover);
  }

  .reader-toolbar__overflow-item.is-active {
    font-weight: 600;
  }

  .reader-toolbar__overflow-tags {
    margin: 4px 0;
    border-top: 1px solid var(--border-subtle);
    padding-top: 4px;
    max-height: 240px;
    overflow-y: auto;
  }

  .reader-toolbar__overflow-zoom {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
    margin-top: 4px;
    border-top: 1px solid var(--border-subtle);
    padding-top: 4px;
  }
  ```

- [ ] **Step 8: Run reader tests and build**

  Run: `npm test -- src/features/reader/ src/features/reader/ReaderToolbarOverflowMenu.test.tsx`
  Run: `npm run build`
  Expected: all reader tests and the build pass.

- [ ] **Step 9: Commit**

  ```bash
  git add apps/desktop/src/features/reader/ReaderToolbarOverflowMenu.tsx apps/desktop/src/features/reader/ReaderToolbarOverflowMenu.test.tsx apps/desktop/src/features/reader/ReaderPage.tsx apps/desktop/src/features/reader/reader.css
  git commit -m "feat: collapse reader tag/zoom controls into an overflow menu"
  ```

---

### Task 2: Flashcard Panel Overlay Below 900px

**Files:**
- Modify: `apps/desktop/src/features/reader/ReaderPage.tsx:1244,1502-1513`
- Modify: `apps/desktop/src/features/reader/reader.css:255-268`
- Test: `apps/desktop/src/features/reader/readerStyles.test.ts`

**Interfaces:**
- Consumes: the reader's main-view `<div>` and the `CardComposer` panel render.
- Produces: a `.reader-composer` wrapper around the reader's `CardComposer` and a media-query rule that makes it an overlay at ≤900px.

- [ ] **Step 1: Write the failing source-level test**

  In `readerStyles.test.ts`, add:

  ```ts
  test("scopes the flashcard panel to an overlay container for narrow widths", () => {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const reader = normalizeNewlines(readFileSync(join(currentDir, "ReaderPage.tsx"), "utf8"));
    const css = normalizeNewlines(readFileSync(join(currentDir, "reader.css"), "utf8"));

    expect(reader).toContain('className="reader-composer"');
    expect(css).toMatch(
      /\.reader-composer\s*\{[\s\S]*?flex:\s*0 0 auto;/,
    );
    expect(css).toMatch(
      /@media \(max-width:\s*900px\)\s*\{[\s\S]*?\.reader-composer\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?right:\s*0;[\s\S]*?bottom:\s*0;[\s\S]*?width:\s*360px;[\s\S]*?z-index:\s*20;/,
    );
  });
  ```

- [ ] **Step 2: Run the test to verify it fails**

  Run: `npm test -- src/features/reader/readerStyles.test.ts`
  Expected: FAIL because `.reader-composer` does not exist.

- [ ] **Step 3: Wrap the panel and add position:relative to its container**

  In `ReaderPage.tsx`, add `position: "relative"` to the main-view div style (line 1244):

  ```tsx
  <div style={{ flex: 1, display: "flex", overflow: "hidden", background: "var(--viewer-canvas-bg)", position: "relative" }}>
  ```

  Wrap the composer panel (lines 1502-1513) in `.reader-composer`:

  ```tsx
  {composerSource && onSaveCard && onCloseComposer ? (
    <div className="reader-composer">
      <CardComposer
        draft={composerSource}
        decks={composerDecks ?? []}
        onCancel={onCloseComposer}
        onSave={onSaveCard}
        onTranslate={onTranslate}
        defaultBackLanguage={composerDefaultBackLanguage}
        variant="panel"
        externalError={composerError}
      />
    </div>
  ) : null}
  ```

- [ ] **Step 4: Add the overlay CSS**

  In `reader.css`, add a base rule (outside any media query):

  ```css
  .reader-composer {
    flex: 0 0 auto;
  }

  .reader-composer .card-composer--panel {
    height: 100%;
  }
  ```

  In the existing `@media (max-width: 900px)` block, add:

  ```css
  .reader-composer {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 360px;
    z-index: 20;
  }
  ```

- [ ] **Step 5: Run reader tests and build**

  Run: `npm test -- src/features/reader/`
  Run: `npm run build`
  Expected: all reader tests and the build pass.

- [ ] **Step 6: Fresh runtime verification**

  Restart `npm run tauri dev` from `apps/desktop`. At a window width above 900px
  confirm the panel is a 360px right sidebar; at half width (≤900px) confirm the
  toolbar shows ⋯ (Tag/Zoom collapsed), the page indicator stays centered, and the
  panel overlays the reader without pushing the toolbar.

- [ ] **Step 7: Commit**

  ```bash
  git add apps/desktop/src/features/reader/ReaderPage.tsx apps/desktop/src/features/reader/reader.css apps/desktop/src/features/reader/readerStyles.test.ts
  git commit -m "feat: overlay the reader flashcard panel below 900px"
  ```
