# Command Palette Polish Design

## Goal

Make Quick Open (`Cmd/Ctrl+K`) and Command Palette (`Shift+Cmd/Ctrl+K`) available from every app route, including Settings, and give both surfaces a compact Codex-inspired neutral interface.

## Interaction design

- Quick Open remains navigation-only. Command Palette remains action-only.
- The active result uses a neutral selected surface token, not blue.
- Matched query characters use stronger text contrast and weight. They never use a blue accent.
- Arrow keys update the same selected state used by mouse hover/click; Enter runs the selected entry; Escape closes and restores focus.
- The result row presents an icon, title, internal breadcrumb, and optional keycap in one compact horizontal layout. A footer exposes `Up/Down`, `Enter`, and `Escape` affordances.

## Component boundaries

- `CommandPalette` keeps shortcut ownership, focus management, querying, selection, and execution.
- A shared palette presentation component renders the common dialog chrome, search input, grouped result list, footer, and error state for both surfaces.
- Small shared primitives render query matches, result rows, and keycaps. They receive semantic data and CSS classes; they do not know whether the surface is navigation or action.
- Match rendering receives the query and creates neutral highlight spans without changing the stored command title or accessible name.

## Route availability

`App` renders the palette pair for the Settings route as well as the existing app routes. The palettes remain mounted only once per rendered route tree, so each global shortcut has one listener and Settings navigation retains its existing behavior.

## Theme and scrollbar rules

- All palette colors come from existing light/dark CSS custom properties, with new neutral palette-specific variables only where needed.
- Direct selectors on the results scroller set a transparent scrollbar track and theme-aware gray thumb. They override the WebKit gutter that can ignore the generic scrollbar rule.
- No palette selection, query match, focus, or scrollbar color is hard-coded blue.

## Verification

- Component tests cover shortcuts, selection movement, mouse/keyboard parity, neutral match markup, footer controls, and focus behavior.
- App or browser tests open both palettes after navigating to Settings.
- Token tests assert palette scrollbar track and thumb use theme variables.
- Run frontend unit tests, Playwright E2E, TypeScript/Vite build, and fresh macOS/Tauri verification if a desktop app runtime is launched.
