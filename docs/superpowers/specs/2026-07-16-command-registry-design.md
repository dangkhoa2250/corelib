# Command Registry and Dual Palette Design

## Goal

Make every public Corelib destination and action discoverable through a registered command, while separating navigation (`⌘K`) from state-changing commands (`⇧⌘K`). CI must reject a new public page or feature that is not registered.

## User experience

### Quick Open (`⌘K`)

Quick Open only opens destinations. It must never mutate settings or run an operational action. It searches titles, aliases, and an internal-app breadcrumb, then presents the result title above its breadcrumb.

Examples:

```text
math.pdf                 Library › Documents
Linear Algebra           Memora › Decks
What is a vector?        Memora › Linear Algebra › Cards
Appearance               Settings › General
```

The breadcrumb describes Corelib's internal navigation, not the original filesystem or Google Drive folder. It therefore requires no document schema change or migration. Dynamic items use the current in-memory documents, decks, and cards; unavailable or unauthorized targets are omitted rather than producing broken links.

### Command Palette (`⇧⌘K`)

The Command Palette only executes actions. It contains operational commands such as importing a PDF, creating a deck, and starting review, plus setting commands that open a small picker or toggle and persist the selected value. Complex or sensitive configuration, such as API keys, is represented by an action that opens the relevant settings section instead of editing secrets inline.

Each command displays its category and keyboard shortcut when one exists. The shortcuts themselves remain configurable in a later iteration; this change establishes stable command IDs so that configuration has a reliable target.

## Architecture

Each feature exports a colocated `commands.ts` manifest. Vite loads every manifest into one typed registry, so feature work does not require editing separate arrays in `App.tsx` and `CommandPalette.tsx`.

The registry has two distinct entry types:

- `destination`: stable ID, title, aliases, breadcrumb, availability predicate, and `open(context)`. Its `surfaces` can include only `quick-open`.
- `action`: stable ID, title, category, aliases, availability predicate, and `run(context)`. Its `surfaces` can include only `command-palette`.

Type constructors enforce the separation: a destination cannot provide `run`, and an action cannot provide `open`. A shared search engine ranks exact title matches, title fuzzy matches, aliases, then breadcrumb matches. It returns stable, source-aware result models consumed by both palette UIs; the old `SearchResult` union is not used as the registry's domain model.

Route definitions are centralized and derive their public route IDs from the route catalog. A public route definition must declare its destination registration. Feature manifests may add dynamic destination resolvers, such as one item per document, deck, or card, and actions. App navigation receives typed route payloads from the selected destination rather than reconstructing routing with result-kind conditionals.

## Registration and enforcement

The feature directory is the registration boundary. A public feature with a `*Page.tsx` entry point must provide `commands.ts`; a feature can register several pages and commands from that one manifest. A route intentionally unavailable to users must be marked internal in the route catalog with a short rationale. This keeps exceptions explicit without weakening the public-route invariant.

CI runs the desktop typecheck and focused registry tests. They must fail when:

1. a public route has no `destination` registration;
2. a feature exposing a page lacks its manifest;
3. an ID is duplicated, a title or breadcrumb is blank, or a manifest is malformed;
4. a Quick Open entry attempts to run an action, or a Command Palette entry attempts to open a destination;
5. an unavailable, deleted, or unauthorized target is returned.

The validation intentionally checks the registry contract rather than inferring behavior by scanning arbitrary JSX. Route catalog typing catches route additions at compile time; manifest coverage tests enforce the feature convention.

## Error handling and accessibility

Search requests are cancellation-safe: stale async results cannot replace newer input. If a dynamic target disappears after search but before selection, the palette stays open and shows an actionable error. Existing dialog focus management, Escape behavior, arrow-key selection, and selection announcements are retained. Empty searches show high-value destinations in Quick Open and common actions in Command Palette; filtered empty states state that no matching destination or command exists.

## Test strategy

Add unit tests for registry discovery, uniqueness, route coverage, page-manifest coverage, surface separation, permissions, and stale/unavailable target behavior. Add palette tests for shortcut separation, breadcrumb rendering, title/alias/breadcrumb matching, keyboard navigation, and action execution. Retain a lightweight end-to-end check that `⌘K` opens a registered destination and `⇧⌘K` runs a registered action.

## Non-goals

- Persisting source filesystem or cloud-folder metadata.
- A configurable keybinding editor in this iteration.
- A generic runtime plugin system for third-party commands.
