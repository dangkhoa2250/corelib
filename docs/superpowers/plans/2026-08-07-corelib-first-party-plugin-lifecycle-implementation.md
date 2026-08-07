# Corelib First-party Plugin Lifecycle Implementation

**Spec:** [Corelib First-party Plugin Lifecycle Design](../specs/2026-08-07-corelib-first-party-plugin-lifecycle-design.md)

**Delivery rule:** Complete tickets in dependency order using vertical-slice TDD. A ticket is complete only when its acceptance tests pass through the agreed seam. Preserve PocketBase login and all Plugin Data.

## Ticket graph

```text
P2-01 Lifecycle contract
  +--> P2-02 Tauri JSON store
  +--> P2-03 Effective Registry and account composition
          +--> P2-04 Corelib Home lifecycle UI
          +--> P2-05 Navigation pin and reorder
          +--> P2-06 Activation and embedded integrations
          +--> P2-07 Agent Core Commands
                    |
                    +--> P2-08 Reconciliation and release verification
```

## P2-01 — Implement the PluginLifecycle Module

**Depends on:** Phase 1

**Likely files:**

- `apps/desktop/src/plugins/lifecycle.ts`
- `apps/desktop/src/plugins/lifecycle.test.ts`
- `apps/desktop/src/plugins/lifecycleState.schema.ts`
- `apps/desktop/src/plugins/lifecycleState.ts`

**Slices:**

1. Load a new account with the five existing Plugins enabled and default Surface order.
2. Keep newly introduced Plugin IDs disabled for an existing account using `knownPluginIds`.
3. Plan and apply independent enable/disable without mutating the previous snapshot.
4. Auto-enable required dependencies.
5. Plan deterministic cascade disable and confirmation reasons.
6. Preserve optional dependents while exposing unavailable integrations.
7. Plan pin, unpin, and reorder with stale-plan rejection.
8. Reject Core, unknown Plugin, and unknown Surface changes with structured issues.

**Acceptance:** Only `load`, `plan`, and `apply` expose graph, defaulting, state, and navigation behavior. Snapshots and plans are immutable.

## P2-02 — Add the account-scoped atomic Tauri JSON store

**Depends on:** P2-01

**Likely files:**

- `apps/desktop/src-tauri/src/plugin_lifecycle.rs`
- `apps/desktop/src-tauri/src/plugin_lifecycle_tests.rs`
- `apps/desktop/src-tauri/src/lib.rs`
- `apps/desktop/src/lib/pluginLifecycle.ts`
- `apps/desktop/src/lib/pluginLifecycle.test.ts`

**Slices:**

1. Load a missing file as an empty versioned state.
2. Save and reload two independent account records.
3. Write through a temporary sibling and replace the destination.
4. Quarantine malformed JSON and return a structured recovery notice.
5. Preserve the previous file when a write fails.
6. Register only the narrow `load_plugin_lifecycle_state` and `save_plugin_lifecycle_state` Tauri commands.

**Acceptance:** Tests use temporary directories and prove atomic replacement, account separation, and recovery without touching real application data.

## P2-03 — Compose lifecycle state with the effective Registry

**Depends on:** P2-01, P2-02

**Likely files:**

- `apps/desktop/src/plugins/firstParty.ts`
- `apps/desktop/src/plugins/registry.ts`
- `apps/desktop/src/plugins/defaultRegistry.test.ts`
- `apps/desktop/src/app/PluginLifecycleProvider.tsx`
- `apps/desktop/src/app/App.tsx`
- `apps/desktop/src/app/routes.ts`
- `apps/desktop/src/app/commandRegistry.ts`

**Slices:**

1. Distinguish the installed catalog from an account's effective Registry.
2. Load lifecycle only after an approved account session is available.
3. Exclude disabled Plugin contributions while retaining Core contributions.
4. Resolve disabled or stale public routes to Home.
5. Keep Quick Open navigation-only and Command Palette action-only.
6. Reset lifecycle composition on sign-out/account switch.

**Acceptance:** No consumer independently filters Plugin IDs. Existing public registration coverage passes against both all-enabled and selectively disabled snapshots.

## P2-04 — Add Corelib Home and lifecycle controls

**Depends on:** P2-03

**Likely files:**

- `apps/desktop/src/features/home/HomePage.tsx`
- `apps/desktop/src/features/home/HomePage.test.tsx`
- `apps/desktop/src/features/home/home.css`
- `apps/desktop/src/plugins/coreContributions.ts`
- `apps/desktop/src/app/routes.ts`
- `apps/desktop/src/app/commandRegistry.test.ts`
- `apps/desktop/src/app/App.tsx`

**Slices:**

1. Register `route.home` as a non-removable Core Surface in Quick Open and the first sidebar item.
2. Render installed Plugin metadata and enabled/disabled/new states.
3. Launch an enabled Plugin's primary Surface.
4. Enable a Plugin only after state persistence succeeds.
5. Show dependency and active-work confirmation before disable.
6. Display persistence and corrupt-state recovery notices.
7. Return active disabled routes to Home.
8. Use `ScrollArea` with at least 20px immediate content inset.

**Acceptance:** Home manages bundled Plugins without exposing Uninstall or Erase actions. Existing login behavior is unchanged.

## P2-05 — Persist pinning and accessible drag reorder

**Depends on:** P2-03, P2-04

**Likely files:**

- `apps/desktop/src/features/home/HomePage.tsx`
- `apps/desktop/src/features/home/HomePage.test.tsx`
- `apps/desktop/src/app/AppSidebar.tsx`
- `apps/desktop/src/app/AppSidebar.test.tsx`
- `apps/desktop/src/styles/tokens.css`

**Slices:**

1. Pin and unpin eligible Plugin Surfaces independently from enablement.
2. Restore retained placement after re-enable.
3. Reorder by native desktop drag-and-drop using stable Surface IDs.
4. Reorder through move-up and move-down buttons using the same lifecycle change.
5. Keep Home first and reject Core Surface movement.
6. Preserve focus and announce the final position after keyboard or drag movement.

**Acceptance:** One ordered state drives sidebar rendering. No second navigation array exists, and long lists satisfy the ScrollArea checks.

## P2-06 — Gate activation and embedded integrations

**Depends on:** P2-03

**Likely files:**

- `apps/desktop/src/app/App.tsx`
- `apps/desktop/src/features/library/LibraryPage.tsx`
- `apps/desktop/src/features/reader/ReaderPage.tsx`
- `apps/desktop/src/features/settings/SettingsPage.tsx`
- `apps/desktop/src/features/statistics/StatisticsAnalyticsSync.tsx`
- focused feature tests

**Slices:**

1. Do not load Library data or expose Drive controls when their owners are disabled.
2. Do not load Memora data or expose Reader card creation when Memora is disabled.
3. Hide translation controls and model settings when Models is disabled.
4. Stop Statistics synchronization and embedded statistics links when Statistics is disabled.
5. Restore every integration when its optional dependency is enabled again.
6. Confirm or reject disabling a Plugin with active or unsaved work before applying the plan.

**Acceptance:** Disabled means no activation or callable integration, not merely a hidden sidebar item. Static imports may remain.

## P2-07 — Register Agent-audience lifecycle Core Commands

**Depends on:** P2-01, P2-03

**Likely files:**

- `apps/desktop/src/plugins/manifest.schema.ts`
- `apps/desktop/src/plugins/coreContributions.ts`
- `apps/desktop/src/plugins/lifecycleCommands.ts`
- `apps/desktop/src/plugins/lifecycleCommands.test.ts`
- `apps/desktop/src/app/commandRegistry.ts`

**Slices:**

1. Extend Command declarations with versioned JSON Schema input/output and confirmation metadata.
2. Register `core.plugins.enable` and `core.plugins.disable` for the Agent audience only.
3. Register `core.navigation.pin`, `unpin`, and `reorder` for the Agent audience only.
4. Route all five executors through `PluginLifecycle.plan/apply`.
5. Require confirmation for plans that stop active work or cascade.
6. Prove none of these Commands appears in the human Command Palette.

**Acceptance:** The execution path is callable by an already authorized future Agent Adapter, but Phase 2 contains no model, Agent UI, grant bypass, or autonomous caller.

## P2-08 — Reconcile and verify the release

**Depends on:** P2-04, P2-05, P2-06, P2-07

**Checks:**

1. Search for independent enable filters, navigation arrays, route metadata, and lifecycle dependency logic.
2. Run focused lifecycle, state-store, registration, Home, sidebar, activation, and Agent Command tests.
3. Run the full Vitest and Rust suites.
4. Run the production-CSP startup E2E and lifecycle desktop E2E.
5. Record commit and worktree state, identify existing desktop processes, build a fresh Windows release, and launch only the workspace artifact.
6. Verify Home scroll inset, sidebar order, enable/disable, cascade, restore, Quick Open, Settings, embedded integrations, drag reorder, keyboard reorder, and account switching.
7. Do not replace the installed application without explicit approval.

**Acceptance:** All Phase 2 completion criteria pass from one fresh revision and artifact. Handoff names any behavior that was not manually verified.
