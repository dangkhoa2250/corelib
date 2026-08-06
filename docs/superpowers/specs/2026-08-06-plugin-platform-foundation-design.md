# Plugin Platform Foundation Design

**Status:** Accepted for Phase 1

## Goal

Introduce the first deep Module for Corelib's Plugin architecture without changing current user-visible behavior. Phase 1 makes Plugin metadata and contribution ownership authoritative for public routes, Quick Open, the Command Palette, and default navigation, while leaving the current React pages, Tauri commands, SQLite schema, PocketBase login gate, and feature behavior intact.

This is the first stage of the accepted [Corelib Plugin Platform design](./2026-08-06-corelib-plugin-platform-design.md). It prepares the existing First-party Plugins for later enable/disable support and eventual external packages, but it does not implement those later stages.

## Current state

The desktop app already contains several useful registration ideas, but feature composition remains spread across central files:

- `app/routes.ts` owns public route metadata.
- `app/commandRegistry.ts` owns static destinations, settings destinations, dynamic result construction, and actions.
- `app/AppSidebar.tsx` owns a fixed `NAV_ITEMS` array.
- `app/App.tsx` imports every feature, constructs feature-specific contexts, and branches over every route.
- `features/statistics/registry.ts` demonstrates that a typed in-repository registry can remove app-specific branching inside one feature.
- `src-tauri/src/lib.rs` statically registers every native Tauri command.

The Phase 1 seam belongs above React feature implementations and above Tauri commands. Moving the native command set or Plugin Data is deferred because doing so would mix contract introduction with runtime isolation and storage migration.

## Agreed domain model

The canonical terms are maintained in [`CONTEXT.md`](../../../CONTEXT.md). The decisions that constrain this phase are:

- Corelib is the host platform; Library, Memora, Statistics, Drive, and model/translation capabilities become First-party Plugins.
- Core Services remain non-removable and are not disguised as Plugins.
- Plugin Manifests are declarative and versioned.
- Cross-boundary Commands, Resources, and Events use versioned JSON Schema contracts.
- The Plugin Registry is distinct from the Plugin Marketplace catalog.
- Later Marketplace Plugins run in an isolated Plugin Runtime and use Capabilities and Permissions rather than native code.

## Phase 1 scope

### Included

- A versioned, JSON-compatible Plugin Manifest schema.
- TypeScript types derived from that schema and runtime validation using the same schema.
- A deterministic Plugin Registry for static Core and First-party definitions.
- Structured validation errors for identity, versions, dependencies, compatibility, ownership, duplicate contributions, and missing bindings.
- Static First-party definitions for Library, Memora, Statistics, Drive, and model/translation capabilities.
- Core contribution definitions for Settings, Account, Appearance, theme actions, and other non-removable host behavior.
- Public routes, settings destinations, Quick Open results, Command Palette actions, and default sidebar items sourced from registered contributions.
- Existing dynamic document, deck, card, and trash results connected through First-party adapters.
- CI coverage proving every public route and executable public action has exactly one registered owner and binding.

### Excluded

- Enabling, disabling, uninstalling, or erasing Plugin Data.
- External package discovery or installation.
- Sandboxed Web UI, command workers, WebAssembly, or Capability bridges.
- Marketplace backend, review workflow, signing, or Publisher UI.
- Storage namespaces or migration of the shared SQLite schema.
- Plugin Permission prompts.
- Agent Runtime, Agent Grants, Agent Plans, or Automation.
- Core Sync, paid Plugins, or account-flow changes.
- Moving or dynamically registering Tauri commands.

## Architecture

```text
Core definitions ---------+
                          |
First-party definitions --+--> PluginRegistry --> immutable RegistrySnapshot
        |                               |                 |       |       |
        +-- Manifest metadata           |                 |       |       +--> Sidebar
        +-- current-code bindings ------+                 |       +----------> Command search
                                                          +------------------> Route catalog

Future external packages --> validator --> Plugin Runtime adapter  (not Phase 1)
```

### Deep Module: PluginRegistry

`PluginRegistry` is the Phase 1 deep Module. Its Interface stays small:

```ts
export interface PluginRegistry {
  listPlugins(): readonly RegisteredPlugin[];
  listSurfaces(): readonly RegisteredSurface[];
  listCommands(): readonly RegisteredCommand[];
  listSearchProviders(): readonly RegisteredSearchProvider[];
  ownerOf(contributionId: string): ContributionOwner | null;
}

export function createPluginRegistry(input: RegistryInput): PluginRegistry;
```

Creation performs all validation and returns an immutable snapshot. Callers do not resolve dependency graphs, validate schemas, merge Core and Plugin contributions, sort entries, or reason about duplicate IDs. Invalid static configuration throws one `PluginRegistryValidationError` containing every deterministic issue rather than exposing a partially usable registry.

The Interface intentionally does not expose installation, execution, storage, networking, or lifecycle methods. Those behaviors do not exist in Phase 1, and adding hypothetical seams now would make the Module shallow.

### Manifest schema as source of truth

`manifest.schema.ts` exports one JSON Schema value and derives `PluginManifest` from it. The same value is compiled for runtime validation. Phase 1 uses:

- `ajv` for runtime JSON Schema validation.
- `json-schema-to-ts` to derive the TypeScript manifest type from the schema.
- `semver` to validate Plugin versions, Corelib Plugin API ranges, and dependency ranges.

The current verified package versions are AJV 8.20.0, json-schema-to-ts 3.1.1, semver 7.8.5, and `@types/semver` 7.8.0. Package manifests need not pin those exact numbers in this design document; the lockfile remains authoritative after installation.

The initial manifest shape is deliberately declarative and JSON-serializable:

```ts
interface PluginManifest {
  manifestVersion: 1;
  id: string;
  version: string;
  name: string;
  description: string;
  publisher: string;
  compatibility: { pluginApi: string };
  dependencies: Array<{
    pluginId: string;
    version: string;
    optional: boolean;
  }>;
  permissions: PluginPermissionDeclaration[];
  contributions: {
    surfaces: SurfaceDeclaration[];
    commands: CommandDeclaration[];
    searchProviders: SearchProviderDeclaration[];
    resources: ResourceDeclaration[];
    events: EventDeclaration[];
  };
}
```

`manifestVersion` versions the package document itself. `compatibility.pluginApi` targets a separate `CORELIB_PLUGIN_API_VERSION`, initially `1.0.0`; it does not target the desktop app's `0.1.0` product version. This prevents every Corelib release from appearing incompatible with every Plugin.

Plugin IDs are stable lowercase namespaces such as `corelib.library`. Contribution IDs remain the stable IDs already used by routes and commands, such as `route.library` and `action.import-pdf`, to preserve user-facing and test compatibility.

Resources, Events, and Permissions are represented and validated in Phase 1, but First-party manifests may leave those arrays empty until the later stage that introduces their runtime behavior.

### Contributions and ownership

Every registered contribution has exactly one owner:

```ts
type ContributionOwner =
  | { kind: "core-service"; id: string }
  | { kind: "plugin"; id: string };
```

Core contributions use the same surface and command metadata shapes but do not require a Plugin Manifest. This preserves the agreed distinction between a Core Service and a First-party Plugin while allowing one registry snapshot to drive discovery.

Phase 1 contribution categories are:

- **Surface**: public page or Settings destination metadata, navigation placement, aliases, breadcrumb, and symbolic icon ID.
- **Command**: Command Palette metadata, Command Audiences, effect classification, and declared handler ID.
- **Search provider**: a dynamic Quick Open producer such as documents, decks, cards, or trash.
- **Resource/Event**: schema metadata reserved for later cross-Plugin use.

Manifest data contains no React component, callback, Tauri command, or other executable value.

### First-party adapters

Current code is connected through colocated First-party adapters. An adapter binds registered IDs to current implementation behavior:

- a Surface ID to an existing `AppRoute`;
- a Command ID to an existing handler supplied by `CommandContext`;
- a Search provider ID to an existing dynamic resolver;
- a symbolic icon ID to an existing Corelib icon.

These adapters are transitional and remain in process. They are not serialized into a Plugin Release and do not claim to be the future external Plugin Runtime adapter. The Registry validates that each static executable contribution has one binding and that no binding points to an undeclared contribution.

Definitions are colocated with their feature:

```text
features/library/plugin.ts
features/memora/plugin.ts
features/statistics/plugin.ts
features/drive/plugin.ts
features/settings/modelPlugin.ts
```

One explicit `plugins/firstParty.ts` import list is the composition root. Phase 1 avoids build-time glob discovery because explicit imports produce deterministic bundles and failures. External package discovery replaces this composition mechanism later.

### First-party ownership map

| Owner | Phase 1 contributions |
| --- | --- |
| `corelib.library` | Library route, document search provider, PDF import command |
| `corelib.memora` | Memora and Trash routes, Memora settings, deck/card/trash search providers, Review today command |
| `corelib.statistics` | Statistics route |
| `corelib.drive` | Google Drive settings destination |
| `corelib.models` | Model settings destination and available translation/model actions |
| Core Services | Settings route, Account and Appearance settings, theme actions, Admin/internal host behavior |

Reader, review, deck detail, card browser, and other child routes stay explicit internal `AppRoute` variants. They are not public Plugin Surfaces in Phase 1.

### Route, command, and navigation consumers

`routes.ts` continues to own the `AppRoute` discriminated union. Its public catalog joins registered Surface metadata to First-party route bindings, so public titles, aliases, breadcrumbs, and ownership no longer live in a second catalog.

`commandRegistry.ts` remains the deep search Module. It consumes registered Surface, Command, and Search provider metadata, binds executable behavior through the current context adapters, and retains fuzzy matching and the strict Quick Open versus Command Palette separation.

`AppSidebar.tsx` receives registered default navigation items as props instead of owning `NAV_ITEMS`. Settings and Admin remain Core controls. Rendering, resizing, accessibility, styling, and ordering remain visually unchanged.

`App.tsx` constructs the static Registry once, supplies it to route, command, and sidebar consumers, and keeps its current explicit route rendering. Page extraction belongs to Phase 2.

## Validation rules

Registry creation rejects:

1. Unsupported manifest versions or malformed JSON Schema values.
2. Invalid or duplicate Plugin IDs.
3. Invalid Plugin versions, Plugin API ranges, or dependency ranges.
4. Missing required dependencies or incompatible installed versions.
5. Dependency cycles; missing optional dependencies remain valid.
6. Duplicate contribution IDs across Core Services and Plugins.
7. Contributions whose IDs or owner metadata are inconsistent.
8. Executable Surfaces, Commands, or Search providers without bindings.
9. Bindings for undeclared contributions.
10. Blank titles, invalid breadcrumbs, unsupported Command Audiences, or invalid effect classifications.

Registry output is sorted deterministically by declared order and then stable ID. It is frozen in development and tests so consumers cannot mutate the snapshot.

## Error handling

Static registry errors are developer/build failures, not recoverable user errors. `PluginRegistryValidationError` contains structured issues with a code, Plugin ID when known, contribution ID when known, and JSON path. Tests assert codes and paths rather than full prose.

Later external packages will need quarantine and user-facing recovery instead of host startup failure. That behavior is explicitly deferred and must not be inferred from Phase 1's static failure policy.

## Verification

The Interface is the test surface. Focused tests cover valid snapshots and all validation rules through `createPluginRegistry`, not private validator helpers.

Integration tests then prove:

- every public route has exactly one Core or Plugin Surface owner;
- current Quick Open entries and Command Palette actions preserve IDs and behavior;
- dynamic document, deck, card, and trash results retain provenance;
- sidebar labels, order, active state, accessibility, and Admin behavior remain unchanged;
- default First-party manifests pass runtime schema validation;
- the existing full desktop test suite and production build still pass.

No fresh Tauri runtime claim is required for metadata-only changes unless implementation changes rendered behavior. If sidebar or palette rendering changes during implementation, follow the repository's fresh-runtime verification instructions and report the exact revision and artifact.

## Migration and rollback

Phase 1 changes no user data. Reverting the code restores the previous static catalogs without a database migration. Existing route and command IDs are preserved, so saved preferences, tests, analytics keys, and keyboard-driven workflows do not need conversion.

The main implementation risk is two sources of truth. Completion therefore requires deleting duplicated display metadata from `PUBLIC_ROUTE_CATALOG`, `NAV_ITEMS`, and static command arrays once equivalent registered contributions are active; temporary compatibility exports may derive from the Registry but may not retain independent copies.
