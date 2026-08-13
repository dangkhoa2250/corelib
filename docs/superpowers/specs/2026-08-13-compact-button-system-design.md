# Compact Button System Design

## Goal

Make text-action buttons feel like one native desktop application rather than a
collection of page-specific controls. The system should use the compact visual
language already established by the Create Flashcard Save and Cancel actions.

## Scope

Create a shared text-button component and apply it to common task actions in:

- Library, including Import and document actions.
- Memora deck management, including New Deck, Study, and Review Due.
- Provider settings, including Add provider, Manage, connect/save, and removal.
- Dialog and form confirmation actions that represent the same control types.

This work does not change icon-only buttons, rich-text toolbar controls,
comboboxes, navigation buttons, or custom controls that are not text actions.

## Design Rules

The shared component exposes four semantic variants:

- `primary`: the one commit or creation action in a local context. It uses the
  app's light foreground surface with dark text. Examples: Import, New Deck,
  Add provider, Save.
- `secondary`: a contextual task that is not the primary commit. It uses a
  subtle dark surface and border. Examples: Study, Manage, Cancel.
- `quiet`: an inline or lower-emphasis action. It has no persistent border or
  surface, and uses the app's link color. Example: Review Due.
- `destructive`: an irreversible removal action. It uses restrained red text
  and a subtle red-tinted border/surface. Example: Remove key.

For normal text actions, all variants share a compact 30px minimum height,
13px semibold label, 7px corner radius, and 11px horizontal padding. States
for hover, keyboard focus, disabled, and loading must be defined centrally.

Only one primary action should appear in a local action group. Secondary and
quiet actions express lower hierarchy without becoming oversized pills.

## Explicit Exception

The review-answer buttons (`Again`, `Hard`, `Good`, `Easy`) remain unchanged.
They are high-frequency learning controls that need their existing larger
target size and rating-specific color treatment.

## Implementation Shape

1. Add reusable design tokens for compact button dimensions, typography,
   surfaces, borders, and interaction states.
2. Add a `Button` component with a `variant` prop and normal button behavior,
   including `disabled` and `type` passthrough.
3. Migrate the scoped text actions page by page. Keep specialized page class
   names only for layout, not duplicated button presentation.
4. Add component tests for variants and disabled semantics, then update focused
   feature tests where class names or accessible behavior change.

## Acceptance Criteria

- Scoped actions above use the shared component and are visually compact.
- The visual difference between primary, secondary, quiet, and destructive
  actions is intentional and consistent across pages.
- Save and Cancel in Create Flashcard remain visually compatible with the
  system; they are adjusted only when necessary for exact consistency.
- Review-answer buttons render as they did before this work.
- Existing tests pass, TypeScript compiles, and desktop runtime verification is
  performed from this feature worktree before claiming a UI fix.

## Risks and Mitigations

- A broad CSS selector could alter toolbars or icon controls. The new styling
  will be scoped to the shared component classes rather than bare `button`.
- Existing layout classes can unintentionally override component dimensions.
  Each migration will retain layout-only rules and remove only conflicting
  presentation rules.
- The worktree already contains unrelated, uncommitted feature work. Only the
  spec and files needed for the compact button system will be staged or changed.
