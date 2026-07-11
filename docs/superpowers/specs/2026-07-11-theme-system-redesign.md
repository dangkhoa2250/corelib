# Theme System Redesign

## Goal

Replace the current flat dark/light mode with a semantic surface-hierarchy system inspired by ChatGPT/Codex. Dark mode is not color inversion — it changes application chrome while preserving document content.

## Token Architecture

Replace ad-hoc CSS variables with semantic surface tokens:

- `--window-bg`, `--sidebar-bg`, `--main-bg`, `--viewer-canvas-bg`, `--toolbar-bg`, `--panel-bg`
- `--surface-1`, `--surface-2`, `--surface-3` for card/component hierarchy
- `--interactive-hover`, `--interactive-selected`, `--interactive-pressed`
- `--border-subtle`, `--border-strong`
- `--text-primary`, `--text-secondary`, `--text-disabled`
- `--button-primary-bg`, `--button-primary-text`, `--button-secondary-bg`, `--button-secondary-text`
- `--focus-ring` (neutral, no blue)
- `--warning`, `--error`, `--success`, `--link` (semantic only)

## Key Rules

1. **Sidebar translucent** — `background: var(--sidebar-bg)` with `backdrop-filter: blur(24px) saturate(140%)`, border-right from main view.
2. **Main view solid** — `background: var(--main-bg)`. Never matches sidebar color.
3. **No blue for interaction** — hover/selected/pressed use neutral `--interactive-*` tokens. Blue only for semantic links.
4. **Primary button** — black bg / white text (light), white bg / black text (dark). Pill shape.
5. **Secondary button** — neutral gray surface, subtle border.
6. **PDF viewer** — canvas uses `--viewer-canvas-bg`, page stays white, toolbar/panel/sidebar are dark-theme aware.
7. **Inputs/textarea/select** — `--surface-1` bg, neutral border, no browser defaults, neutral focus ring.
8. **Cards** — `--surface-1` bg, subtle border + shadow, hover uses `--surface-2`.
9. **No global invert or opacity tricks** — each surface has explicit background.
10. **All colors through tokens** — no hardcoded colors in components.

## Components to Update

- Sidebar (translucent, neutral selected)
- All buttons (primary, secondary, icon)
- Inputs, textareas, selects
- PDF viewer (canvas, toolbar, outline sidebar, flashcard panel)
- Cards, panels, modals, popovers, menus
- Search fields
- Focus rings (neutral)
- Dividers/borders
- Empty states
- Context menus

## Acceptance

1. Sidebar translucent, main view solid, different surfaces.
2. Dark mode: PDF page white, chrome dark, panel dark, inputs dark.
3. No blue on hover/selected/button defaults.
4. Primary button black/white per theme.
5. All colors through semantic tokens.
6. Same layout and spacing in both themes.
