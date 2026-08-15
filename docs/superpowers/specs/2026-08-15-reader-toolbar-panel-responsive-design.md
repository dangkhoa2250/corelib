# Reader Toolbar & Flashcard Panel Responsive Design

## Goal

At narrow window widths (≤900px) the reader toolbar's secondary controls must
collapse into an overflow menu and the flashcard side panel must overlay the
reader instead of squeezing it, so nothing overlaps or gets pushed below the
toolbar.

## Root cause

The reader is a flex row: `[sidebar 260px][reader section flex:1][panel 360px]`.
The panel's fixed 360px plus the sidebar's 260px consume 620px. Below roughly
900px the reader section collapses to near-zero width while the toolbar
(title + tag + page + zoom + search) has a large minimum content width, so the
toolbar overflows and overlaps the panel — the panel appears to sit below the
resize/zoom controls.

## Design

Breakpoint: `max-width: 900px` (reuse the existing `@media (max-width: 900px)`
block in `reader.css`).

### 1. Toolbar overflow menu (≤900px)

- Collapse the **Page tags** button and the **Zoom group** (zoom out, percentage
  label, zoom in) into a single **"⋯" (More)** button on the toolbar's right
  side.
- Clicking ⋯ opens a dropdown menu containing:
  - **Tag Page** toggle (same action/label as the current tag button).
  - **Zoom out**, **Zoom in** controls plus the current percentage label.
- **Page X of Y** stays visible, centered, regardless of width.
- Back, Title, and Search remain visible (Search keeps its existing 130px
  minimum at ≤900px).

### 2. Flashcard panel overlay (≤900px)

- The `CardComposer` panel switches from an in-flow flex sibling to an overlay:
  `position: absolute; top: 0; right: 0; bottom: 0; width: 360px; z-index`
  above the reader section. The reader's main-view container becomes
  `position: relative` so the overlay anchors to it.
- The reader section keeps the full remaining width underneath, so the page and
  toolbar stay visible.
- The panel keeps its existing left border, background, padding, and × close
  button. No backdrop is added — it remains a side panel, not a modal.
- The overlay applies only to the reader's composer instance, not the Add/Edit
  Card side panel (`CardSidePanel`), which lives in a different layout.

### Above 900px

Behavior is unchanged from today.

## Components affected

- `apps/desktop/src/features/reader/ReaderPage.tsx` — render the toolbar's tag
  and zoom controls through the new overflow menu below the breakpoint, and
  position the composer panel as an overlay.
- `apps/desktop/src/features/reader/reader.css` — extend the 900px media query
  with the overflow-menu and panel-overlay rules.
- A small overflow-menu component (reuse an existing menu primitive such as
  `ActionMenu` or `CompactToolbarMenu` where appropriate).

## Testing

- Unit/component tests: the ⋯ button appears (and Tag/Zoom are hidden) when the
  viewport is ≤900px, and the menu exposes Tag Page and Zoom actions; the page
  indicator stays present at all widths.
- The panel renders with overlay positioning at ≤900px and in-flow above 900px.
- Existing reader toolbar and card composer tests must keep passing.
- Manual verification in a fresh `tauri dev` at half width: toolbar does not
  overlap the panel, page indicator stays centered, ⋯ opens Tag/Zoom, and the
  panel overlays the reader without pushing the toolbar.

## Scope

Reader page only. No new routes, commands, or user-invokable actions are added;
this changes layout and a dropdown menu, so command-registration checks are not
triggered.
