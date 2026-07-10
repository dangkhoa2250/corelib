# Reader Preview UI Refresh

## Goal

Bring the desktop PDF reader closer to macOS Preview while fixing the current visual-centering issue. Preserve all existing PDF behaviors: thumbnails, outline navigation, page navigation, zoom anchoring, search, lazy rendering, and persisted last-read page.

## Design

- Keep the left sidebar, but narrow it to a Preview-like thumbnail rail with a calm gray surface, compact Pages/Outline segmented tabs, and stronger active-page treatment.
- Replace browser-default toolbar controls with quiet macOS-style controls: compact icon buttons, a centered/ellipsized document title, page navigation and zoom groups, and a rounded search field.
- Use a dedicated reader stage for the scrollable document surface. The stage owns the centering behavior, while the scaled PDF stack remains in the same scroll coordinate system so pointer-anchored zoom continues to work.
- Render each page as a white paper surface with a subtle shadow and consistent vertical gap on a neutral gray background.
- Use CSS classes and shared reader tokens for visual treatment instead of large inline style blocks where practical; keep component-local layout values that are required by the PDF renderer.
- Add accessible labels and visible focus states for icon-only controls.

## Centering behavior

The document stack will have a minimum width equal to the reader viewport and a content width based on the scaled page stack. Its inner page column will be centered with flex alignment. This keeps a page centered when it is narrower than the viewport and still allows horizontal scrolling when zoomed beyond the viewport.

## Testing

- Add a focused test for the reader layout contract (sidebar, toolbar, centered stage hooks, and accessible control labels).
- Keep existing PDF rendering, search, page persistence, and zoom math tests passing.
- Run the desktop unit suite and production build after implementation.

## Scope

This change is visual and layout-focused. It does not add new reader capabilities, change PDF rendering semantics, or alter library data models.
