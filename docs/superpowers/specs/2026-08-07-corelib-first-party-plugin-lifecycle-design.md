# Corelib First-party Plugin Lifecycle Design

**Status:** Accepted for Phase 2

## Goal

Make the bundled Library, Memora, Statistics, Google Drive, and Models capabilities genuinely selectable First-party Plugins. Users can enable or disable Plugins, launch them from a non-removable Corelib Home, and customize pinned Plugin Surfaces without deleting Plugin Data or introducing the external Plugin Runtime.

This phase builds on the validated static Registry from [Phase 1](./2026-08-06-plugin-platform-foundation-design.md). The current PocketBase login gate remains unchanged.

## Scope

### Included

- Account-scoped, device-local enable/disable state for bundled First-party Plugins.
- A versioned Core-owned JSON state file written atomically by Tauri.
- A deep `PluginLifecycle` Module that plans and applies lifecycle and navigation changes.
- Required dependency auto-enable and confirmation-gated cascade disable.
- Optional-dependency integrations that disappear without disabling the remaining Plugin.
- A non-removable Corelib Home registered in Quick Open and pinned first in the sidebar.
- Plugin cards for status, dependency impact, enable, disable, and launch.
- Surface-level pin, unpin, drag-and-drop reorder, and keyboard-accessible move controls.
- Effective Registry snapshots containing only enabled Plugin contributions plus all Core contributions.
- Disabled Plugin activation, background work, settings, search, actions, routes, and embedded integrations are stopped.
- Agent-audience Core Commands for lifecycle and navigation, using versioned JSON Schema inputs and outputs.
- Corrupt-state quarantine and visible recovery to safe defaults.

### Excluded

- External package discovery, installation, or Uninstall.
- Erase Plugin Data.
- Marketplace submission, review, signatures, or updates.
- Sandboxed Plugin Surfaces, command workers, WebAssembly, or dynamic native code.
- Capability and Permission prompts or isolated Plugin storage namespaces.
- Moving existing Library or Memora SQLite records.
- Agent model configuration, Agent Plans, Agent Grants, an Agent UI, or autonomous execution.
- Core Sync, paid distribution, and account-flow changes.
- Sidebar groups or multiple saved navigation layouts.

## Agreed behavior

### First launch and upgrades

The first lifecycle state for an account enables all five existing First-party Plugins and preserves the current default sidebar order after Corelib Home. Every state records `knownPluginIds`. A First-party Plugin introduced in a later application version is visible as new in Home but remains disabled and unpinned for an existing account. A new account uses the composition root's current defaults.

Core Services are always active and cannot be represented as enabled or disabled Plugin records.

### Lifecycle operations

Enabling a Plugin also enables every missing required dependency in dependency order. Disabling a Plugin with enabled required dependents produces a cascade plan and requires explicit confirmation before all affected Plugins are disabled. A missing optional dependency removes only the corresponding integration.

An inactive independent Plugin may be disabled without confirmation. Confirmation is required when the Plugin is currently displayed, has unsaved work, has active work that will stop, or causes cascade disable. Enabling is immediate after successful persistence.

Lifecycle changes are committed only after an atomic state write succeeds. A failed write leaves the visible and effective state unchanged.

### Disable means stop, not delete

For a disabled Plugin, Corelib removes its Surfaces, Commands, search providers, Settings destinations, background activation, and embedded integrations. The React and Tauri implementation remains in the application bundle during Phase 2. Existing Plugin Data and Plugin-specific settings remain untouched.

Examples:

- Disabling Drive hides Library Drive controls and Drive Settings.
- Disabling Models hides translation controls and Model Settings.
- Disabling Memora hides Reader card creation and all Memora routes/search.
- Disabling Statistics removes statistics links and stops statistics synchronization.

### Navigation

Corelib Home is a Core Service page, is always first in the sidebar, and is always discoverable through Quick Open. The application continues to open Library by default when Library is enabled; otherwise it opens Home. Disabling the owner of the active route returns to Home after any required confirmation.

Pinning is independent from Plugin enablement. Disabled Surfaces retain their saved positions but are not rendered. Re-enabling restores their previous placement. Users reorder pinned Surfaces by drag-and-drop or accessible move-up/move-down controls; both invoke the same lifecycle change.

## Deep Module

`PluginLifecycle` is the Phase 2 deep Module. Its Interface is deliberately small:

```ts
interface PluginLifecycle {
  load(accountId: string): Promise<PluginLifecycleSnapshot>;
  plan(change: PluginLifecycleChange): PluginLifecyclePlan;
  apply(plan: PluginLifecyclePlan): Promise<PluginLifecycleSnapshot>;
}
```

`load` validates or initializes state and returns one immutable snapshot. `plan` has no side effects and calculates dependencies, confirmation reasons, next navigation, and the proposed next state. `apply` rejects stale plans, persists atomically, and returns a new immutable snapshot.

The snapshot contains the effective `PluginRegistry`, installed Plugin status records, ordered visible navigation, recovery notices, and stable query methods such as `isEnabled(pluginId)`. Callers do not traverse dependency graphs, merge defaults, edit JSON, filter Registry contributions, or decide fallback routes.

The persistence seam is:

```ts
interface PluginLifecycleStateStore {
  load(): Promise<PluginLifecycleStateLoadResult>;
  save(state: PluginLifecycleStateFile): Promise<void>;
}
```

The production Adapter invokes Tauri. Tests use an in-memory Adapter. This is a real seam because both implementations exist in Phase 2.

## State contract

The Core-owned JSON file is stored below the Tauri application data directory and has this logical shape:

```json
{
  "schemaVersion": 1,
  "accounts": {
    "account-id": {
      "revision": 3,
      "knownPluginIds": ["corelib.library"],
      "enabledPluginIds": ["corelib.library"],
      "navigation": {
        "pinnedSurfaceIds": ["route.library"]
      }
    }
  }
}
```

The store writes a temporary sibling file, flushes it, and replaces the destination. A malformed file is renamed with a `.corrupt-<timestamp>` suffix. Corelib then initializes safe defaults and exposes a recovery notice in Home. Unknown account entries and retained state for temporarily absent Plugins are preserved rather than guessed or erased.

## Effective Registry and activation

Phase 1 static definitions remain the installed catalog. `PluginLifecycle` supplies only enabled definitions to `createPluginRegistry`; Core contributions are always included. Required-dependency validity is established by the lifecycle plan before Registry construction.

`App.tsx` must not own feature-specific enable rules. Feature activation and embedded integration availability are derived from the lifecycle snapshot through colocated adapters. Static imports remain acceptable in Phase 2, but disabled Plugins must not initiate loads, effects, synchronization, or callable contribution handlers.

## Agent Commands

The following human-hidden, Agent-audience Core Commands are registered through the shared Command contract:

- `core.plugins.enable`
- `core.plugins.disable`
- `core.navigation.pin`
- `core.navigation.unpin`
- `core.navigation.reorder`

Each Command declares versioned JSON Schema input and output, effect classification, and confirmation policy. These Commands are excluded from the Command Palette. The Phase 2 executor accepts an already authorized caller and delegates to `PluginLifecycle`; it does not implement an Agent model, planning UI, grants, or autonomous invocation. Disable and cascade operations require execution-time confirmation when the lifecycle plan says so.

## Error handling

- Unknown Plugin or Surface IDs return structured lifecycle issues.
- Core contribution changes are rejected.
- Invalid or stale plans do not write state.
- Dependency failures return the complete deterministic impact list.
- Persistence failures preserve the previous snapshot and display a recoverable Home error.
- Corrupt JSON is quarantined and reported after safe initialization.
- Disabled or stale routes resolve to Home rather than rendering a partial Plugin.

## Test seams

Tests exercise only the agreed public seams:

1. `PluginLifecycle` Interface with an in-memory state Adapter.
2. Tauri lifecycle state commands against a temporary application-data directory.
3. Registry/route/command/sidebar consumers using a lifecycle snapshot.
4. Corelib Home through its user-visible React Interface.
5. Desktop E2E for disable, cascade, restore, pin, drag reorder, keyboard reorder, account switching, and corrupt-state recovery.

The Home scroll surface uses `ScrollArea`, and its immediate content reserves at least 20px on the thumb side. Focused tests cover both requirements.

## Migration and rollback

Phase 2 does not migrate or delete Plugin Data. Removing the lifecycle state file restores the all-enabled default for the current bundled Plugins. Reverting Phase 2 code leaves existing Library and Memora storage untouched. The lifecycle JSON may remain unused and can be removed separately.

## Completion criteria

- All five existing First-party Plugins can be disabled and re-enabled without data loss.
- Disabled Plugins have no public contributions, background activation, or embedded integrations.
- Required and optional dependencies behave as specified.
- Home is the safe non-removable fallback and Plugin management Surface.
- Pinned navigation persists and supports drag and keyboard reorder.
- Lifecycle state is account-scoped, atomic, recoverable, and versioned.
- Agent-audience lifecycle Commands have schema and execution coverage but no Palette entries.
- Existing login behavior and current data remain unchanged.
- Focused, full, production-CSP, Rust, and fresh desktop verification pass.
