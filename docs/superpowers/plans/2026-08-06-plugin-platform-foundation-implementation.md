# Plugin Platform Foundation Implementation Plan

**Goal:** Introduce the Phase 1 Plugin Manifest and Plugin Registry foundation, then make existing public route, command, Quick Open, and default navigation metadata flow through that Registry without changing user-visible behavior.

**Architecture:** A deep `PluginRegistry` Module validates JSON-compatible Core and First-party definitions once and returns an immutable snapshot through a small read Interface. Existing React and Tauri implementations remain behind transitional First-party adapters keyed by stable contribution IDs. Route search, command search, and sidebar rendering consume the snapshot instead of owning duplicate feature metadata.

**Tech stack:** React 19, TypeScript, Vite, Vitest, Testing Library, AJV, json-schema-to-ts, semver, Tauri 2.

**Design:** [`docs/superpowers/specs/2026-08-06-plugin-platform-foundation-design.md`](../specs/2026-08-06-plugin-platform-foundation-design.md)

## Constraints

- Work on `feat/plugin-architecture`.
- Preserve the current PocketBase login gate and all current feature behavior.
- Do not modify Rust commands, SQLite schemas, native Tauri plugin registration, or Plugin Data.
- Do not add enable/disable UI, external packages, sandbox execution, Marketplace calls, or Agent Runtime behavior.
- Keep existing stable route and command IDs.
- Before modifying public route, command, or navigation registration, read and follow `.agents/skills/checking-command-registration/SKILL.md`.
- No scroll behavior is planned. If implementation changes a scrollable Surface, stop and apply `.agents/skills/checking-scroll-surfaces/SKILL.md` before continuing.
- Use `apply_patch` for source edits and preserve unrelated user changes.
- Follow red-green-refactor for every task; do not write production implementation before the focused failing test exists.

## Planned file structure

```text
apps/desktop/src/
├── plugins/
│   ├── manifest.schema.ts          # JSON Schema source of truth and derived types
│   ├── manifest.ts                 # compiled validator and structured validation issues
│   ├── manifest.test.ts
│   ├── registry.ts                 # deep PluginRegistry Module and immutable snapshot
│   ├── registry.test.ts
│   ├── coreContributions.ts        # non-removable Core Service metadata
│   ├── firstParty.ts               # explicit First-party composition root
│   └── defaultRegistry.test.ts     # whole-app ownership and binding coverage
├── features/
│   ├── library/plugin.ts
│   ├── memora/plugin.ts
│   ├── statistics/plugin.ts
│   ├── drive/plugin.ts
│   └── settings/modelPlugin.ts
└── app/
    ├── routes.ts                   # AppRoute plus Registry-derived public catalog
    ├── commandRegistry.ts          # Registry consumer and current-code adapters
    ├── AppSidebar.tsx              # registered navigation items supplied as props
    └── App.tsx                     # constructs and supplies the default Registry
```

No new file under `src-tauri` is expected.

## Task 1: Establish one typed and runtime-validated Manifest contract

**Files:**

- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/package-lock.json`
- Create: `apps/desktop/src/plugins/manifest.schema.ts`
- Create: `apps/desktop/src/plugins/manifest.ts`
- Create: `apps/desktop/src/plugins/manifest.test.ts`

- [ ] **Step 1: Add the failing contract tests**

Test only through the public manifest Interface:

```ts
const result = validatePluginManifest(candidate);
expect(result).toEqual({ ok: true, manifest: candidate });

expect(validatePluginManifest({ ...candidate, manifestVersion: 2 })).toEqual({
  ok: false,
  issues: [expect.objectContaining({ code: "unsupported_manifest_version" })],
});
```

Cover:

- a valid minimal manifest;
- unsupported `manifestVersion`;
- malformed Plugin ID;
- invalid semantic version and Plugin API range;
- invalid dependency range;
- blank contribution title or breadcrumb;
- unsupported Command Audience or effect;
- JSON serializability of the accepted value.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm test -- --run src/plugins/manifest.test.ts
```

Expected: FAIL because the manifest Module does not exist.

- [ ] **Step 3: Install contract dependencies**

Run:

```powershell
npm install ajv semver
npm install --save-dev json-schema-to-ts @types/semver
```

Do not hand-edit `package-lock.json`.

- [ ] **Step 4: Implement the schema-derived Interface**

In `manifest.schema.ts`:

- export `PLUGIN_MANIFEST_SCHEMA` as a JSON Schema `as const` value;
- export `PluginManifest = FromSchema<typeof PLUGIN_MANIFEST_SCHEMA>`;
- define `manifestVersion: 1`;
- define `CORELIB_PLUGIN_API_VERSION = "1.0.0"` separately from the app version;
- define dependencies, Permissions, Surfaces, Commands, Search providers, Resources, and Events as JSON-compatible declarations;
- keep executable functions and React values out of the schema.

In `manifest.ts`:

- compile the schema once with AJV;
- validate semver fields after structural validation;
- return structured `{ code, path, message }` issues;
- never throw for one candidate manifest.

- [ ] **Step 5: Run focused tests and typecheck**

```powershell
npm test -- --run src/plugins/manifest.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit the contract**

```powershell
git add apps/desktop/package.json apps/desktop/package-lock.json apps/desktop/src/plugins
git commit -m "feat(desktop): define plugin manifest contract"
```

## Task 2: Build the deep PluginRegistry Module

**Files:**

- Create: `apps/desktop/src/plugins/registry.ts`
- Create: `apps/desktop/src/plugins/registry.test.ts`

- [ ] **Step 1: Write failing Interface-level snapshot tests**

Exercise only `createPluginRegistry` and the returned Interface:

```ts
const registry = createPluginRegistry({
  pluginApiVersion: "1.0.0",
  coreContributions: [],
  plugins: [libraryDefinition, memoraDefinition],
});

expect(registry.listPlugins().map((plugin) => plugin.id)).toEqual([
  "corelib.library",
  "corelib.memora",
]);
expect(registry.ownerOf("route.library")).toEqual({
  kind: "plugin",
  id: "corelib.library",
});
```

Also prove returned arrays and records cannot be mutated in tests/development.

- [ ] **Step 2: Write failing validation aggregation tests**

One invalid input should report all deterministic issues in stable order. Cover:

- duplicate Plugin IDs;
- duplicate contribution IDs across Core and Plugins;
- incompatible Plugin API ranges;
- missing required dependency;
- incompatible dependency version;
- allowed missing optional dependency;
- direct and indirect dependency cycles;
- declared executable contribution without a binding ID;
- binding ID not declared by the owner.

Assert issue codes and paths, not full English messages.

- [ ] **Step 3: Run tests and verify RED**

```powershell
npm test -- --run src/plugins/registry.test.ts
```

Expected: FAIL because `createPluginRegistry` does not exist.

- [ ] **Step 4: Implement creation and immutable snapshot behavior**

The public Interface is limited to:

```ts
interface PluginRegistry {
  listPlugins(): readonly RegisteredPlugin[];
  listSurfaces(): readonly RegisteredSurface[];
  listCommands(): readonly RegisteredCommand[];
  listSearchProviders(): readonly RegisteredSearchProvider[];
  ownerOf(id: string): ContributionOwner | null;
}
```

Hide schema validation, semver checks, dependency graph traversal, ownership merging, sorting, and freezing inside the Module. Invalid static definitions throw one `PluginRegistryValidationError` with an `issues` property. Do not expose validator or graph helpers merely for tests.

- [ ] **Step 5: Run focused tests and refactor through the Interface**

```powershell
npm test -- --run src/plugins/manifest.test.ts src/plugins/registry.test.ts
```

Delete or keep private any helper that tests had to reach around the Interface to exercise.

- [ ] **Step 6: Commit the Registry Module**

```powershell
git add apps/desktop/src/plugins/registry.ts apps/desktop/src/plugins/registry.test.ts
git commit -m "feat(desktop): add validated plugin registry"
```

## Task 3: Register Core and First-party contribution ownership

**Files:**

- Create: `apps/desktop/src/plugins/coreContributions.ts`
- Create: `apps/desktop/src/plugins/firstParty.ts`
- Create: `apps/desktop/src/plugins/defaultRegistry.test.ts`
- Create: `apps/desktop/src/features/library/plugin.ts`
- Create: `apps/desktop/src/features/memora/plugin.ts`
- Create: `apps/desktop/src/features/statistics/plugin.ts`
- Create: `apps/desktop/src/features/drive/plugin.ts`
- Create: `apps/desktop/src/features/settings/modelPlugin.ts`

- [ ] **Step 1: Write the failing ownership inventory test**

Assert the exact Phase 1 Plugin IDs:

```ts
expect(DEFAULT_PLUGIN_REGISTRY.listPlugins().map((plugin) => plugin.id)).toEqual([
  "corelib.drive",
  "corelib.library",
  "corelib.memora",
  "corelib.models",
  "corelib.statistics",
]);
```

Assert ownership for at least:

- `route.library`, `action.import-pdf`, and the documents search provider;
- `route.memora`, `route.trash`, `action.review-today`, and deck/card/trash providers;
- `route.statistics`;
- Drive, Model, and Memora settings destinations;
- Settings, Account, Appearance, and theme actions as Core Service contributions.

Assert existing stable IDs are unchanged.

- [ ] **Step 2: Write failing dependency tests against the real inventory**

Expected declarations:

- `corelib.drive` requires `corelib.library`;
- `corelib.memora` optionally integrates with `corelib.library`;
- `corelib.statistics` has optional dependencies on Library and Memora;
- missing optional integration does not invalidate a reduced test registry.

- [ ] **Step 3: Run and verify RED**

```powershell
npm test -- --run src/plugins/defaultRegistry.test.ts
```

- [ ] **Step 4: Add JSON-compatible colocated definitions**

Each feature `plugin.ts` exports only declarative manifest data and symbolic binding IDs. It must not import React components, Tauri functions, `AppRoute`, `CommandContext`, or mutable feature state.

`firstParty.ts` is the one explicit composition root. Keep the import list intentional; do not use a Vite glob in Phase 1.

`coreContributions.ts` uses the same contribution metadata shapes but identifies owners as Core Services rather than inventing a `corelib.host` Plugin.

- [ ] **Step 5: Run focused tests and build**

```powershell
npm test -- --run src/plugins/manifest.test.ts src/plugins/registry.test.ts src/plugins/defaultRegistry.test.ts
npm run build
```

- [ ] **Step 6: Commit the static inventory**

```powershell
git add apps/desktop/src/plugins apps/desktop/src/features/library/plugin.ts apps/desktop/src/features/memora/plugin.ts apps/desktop/src/features/statistics/plugin.ts apps/desktop/src/features/drive/plugin.ts apps/desktop/src/features/settings/modelPlugin.ts
git commit -m "feat(desktop): register first-party plugins"
```

## Task 4: Derive public routes and Quick Open metadata from the Registry

**Files:**

- Modify: `apps/desktop/src/app/routes.ts`
- Modify: `apps/desktop/src/app/commandRegistry.ts`
- Modify: `apps/desktop/src/app/commandRegistry.test.ts`
- Modify: `apps/desktop/src/features/search/CommandPalette.test.tsx`

- [ ] **Step 1: Read the command-registration project skill**

Read `.agents/skills/checking-command-registration/SKILL.md` completely before editing these files.

- [ ] **Step 2: Write failing catalog ownership tests**

Add tests proving:

- every `publicRouteNames` value has exactly one registered Surface;
- display metadata comes from the registered Surface;
- an undeclared route binding fails coverage;
- a declared public Surface without an `AppRoute` binding fails coverage;
- Core Service settings destinations and Plugin settings destinations remain Quick Open-only.

- [ ] **Step 3: Run and verify RED**

```powershell
npm test -- --run src/app/commandRegistry.test.ts src/features/search/CommandPalette.test.tsx
```

- [ ] **Step 4: Join Surface metadata to route bindings**

Keep the `AppRoute` discriminated union in `routes.ts`. Replace duplicated titles, aliases, breadcrumbs, and groups with a catalog derived from `DEFAULT_PLUGIN_REGISTRY` plus an explicit map from registered Surface IDs to existing `AppRoute` values.

Do not move internal reader, review, deck detail, card browser, or Admin route rendering into the Registry.

- [ ] **Step 5: Make static Quick Open entries consume registered Surfaces**

`commandRegistry.ts` should use Registry metadata for static destinations. Preserve:

- Quick Open versus Command Palette separation;
- existing stable IDs and breadcrumbs;
- fuzzy matching behavior;
- Settings section navigation behavior;
- unavailable and unauthorized omission rules.

Delete independent copies of equivalent metadata rather than layering the Registry beside them.

- [ ] **Step 6: Run focused tests and commit**

```powershell
npm test -- --run src/plugins/defaultRegistry.test.ts src/app/commandRegistry.test.ts src/features/search/CommandPalette.test.tsx
git add apps/desktop/src/app/routes.ts apps/desktop/src/app/commandRegistry.ts apps/desktop/src/app/commandRegistry.test.ts apps/desktop/src/features/search/CommandPalette.test.tsx
git commit -m "refactor(desktop): source routes from plugin registry"
```

## Task 5: Bind registered Commands and dynamic search providers

**Files:**

- Modify: `apps/desktop/src/app/commandRegistry.ts`
- Modify: `apps/desktop/src/app/commandRegistry.test.ts`
- Modify: `apps/desktop/src/app/App.tsx`
- Modify: `apps/desktop/src/app/App.test.tsx`

- [ ] **Step 1: Write failing binding-completeness tests**

Tests must fail when:

- a declared Command has no current-code handler;
- a handler exists for an undeclared Command;
- a declared Search provider has no resolver;
- a resolver exists for an undeclared provider.

Keep these as Registry/adapter outcomes; do not scan source text.

- [ ] **Step 2: Write failing behavior-preservation tests**

Cover the current behaviors through the public command search Interface:

- PDF import action;
- Review today action;
- theme actions;
- conditional Windows Translation action;
- dynamic document and deck destinations;
- async card and trash results with current breadcrumbs;
- one provider failure does not remove other results.

- [ ] **Step 3: Run and verify RED**

```powershell
npm test -- --run src/app/commandRegistry.test.ts src/app/App.test.tsx
```

- [ ] **Step 4: Add transitional First-party adapters**

Bind stable registered IDs to the existing `CommandContext` handlers and dynamic resolver logic. Keep the adapters local to the command Registry implementation; do not expose `CommandContext` from the PluginRegistry Interface and do not represent functions in manifests.

Make `App.tsx` pass the default Registry explicitly to `createCommandRegistry`. Preserve dependency injection used by existing App tests.

- [ ] **Step 5: Run focused tests and commit**

```powershell
npm test -- --run src/plugins/defaultRegistry.test.ts src/app/commandRegistry.test.ts src/app/App.test.tsx
git add apps/desktop/src/app/commandRegistry.ts apps/desktop/src/app/commandRegistry.test.ts apps/desktop/src/app/App.tsx apps/desktop/src/app/App.test.tsx
git commit -m "refactor(desktop): bind registered plugin commands"
```

## Task 6: Source default sidebar navigation from registered Surfaces

**Files:**

- Modify: `apps/desktop/src/app/AppSidebar.tsx`
- Create or modify: `apps/desktop/src/app/AppSidebar.test.tsx`
- Modify: `apps/desktop/src/app/App.tsx`
- Modify: `apps/desktop/src/app/App.test.tsx`

- [ ] **Step 1: Write failing registered-navigation tests**

Test that:

- Library, Memora, Statistics, and Trash appear in the existing order;
- labels and symbolic icons come from registered Surface metadata and the host icon adapter;
- Settings remains a Core control in the footer;
- Admin remains role-restricted and is not turned into a Plugin;
- active state and accessible navigation labels remain unchanged;
- a non-navigation Surface does not enter the sidebar.

- [ ] **Step 2: Run and verify RED**

```powershell
npm test -- --run src/app/AppSidebar.test.tsx src/app/App.test.tsx
```

- [ ] **Step 3: Replace fixed `NAV_ITEMS` with supplied items**

`AppSidebar` receives an immutable list derived from default-pinned registered Surfaces. Preserve width behavior, resize handling, CSS classes, DOM structure, keyboard behavior, and visual order. This task changes the metadata source, not the design.

Use one exhaustive host icon adapter. Unknown symbolic icons fail Registry/binding coverage instead of silently rendering a placeholder.

- [ ] **Step 4: Run focused UI tests and command coverage**

```powershell
npm test -- --run src/app/AppSidebar.test.tsx src/app/App.test.tsx src/app/commandRegistry.test.ts
```

- [ ] **Step 5: Commit navigation consumption**

```powershell
git add apps/desktop/src/app/AppSidebar.tsx apps/desktop/src/app/AppSidebar.test.tsx apps/desktop/src/app/App.tsx apps/desktop/src/app/App.test.tsx
git commit -m "refactor(desktop): derive navigation from plugin surfaces"
```

## Task 7: Reconcile documentation and complete verification

**Files:**

- Modify if needed: `apps/desktop/README.md`
- Modify if implementation changed terminology: `CONTEXT.md`
- Modify only if a new hard-to-reverse decision emerged: `docs/adr/NNNN-*.md`

- [ ] **Step 1: Check for duplicate sources of truth**

Search:

```powershell
rg -n "NAV_ITEMS|PUBLIC_ROUTE_CATALOG|staticDestinations|commandActions|route\.library|action\.import-pdf" apps/desktop/src
```

Every remaining occurrence must be either:

- the derived compatibility export;
- an executable binding;
- a test expectation;
- or a documented internal route.

Remove independent display metadata copies.

- [ ] **Step 2: Run formatting and diff checks**

```powershell
git diff --check
git status --short
```

- [ ] **Step 3: Run the focused Plugin and registration suites**

```powershell
npm test -- --run src/plugins/manifest.test.ts src/plugins/registry.test.ts src/plugins/defaultRegistry.test.ts src/app/commandRegistry.test.ts src/app/AppSidebar.test.tsx src/features/search/CommandPalette.test.tsx src/app/App.test.tsx
```

Expected: all focused tests pass.

- [ ] **Step 4: Run the full desktop verification**

```powershell
npm test
npm run build
```

Expected: all existing tests pass and TypeScript/Vite production build succeeds. The existing bundle-size warning is not a Phase 1 failure unless the new dependencies materially worsen it.

- [ ] **Step 5: Run fresh Windows release verification if rendered registration changed**

Record:

```powershell
git rev-parse --short HEAD
git status --short
```

Identify and do not reuse an older installed app or `tauri dev` process. Build from `apps/desktop` with the required account base URL:

```powershell
$env:ACCOUNT_API_BASE_URL = 'http://127.0.0.1:8090'
npm run tauri:build:windows
```

Launch only:

```text
apps/desktop/src-tauri/target/release/library_desktop.exe
```

Verify after sign-in that sidebar order, Quick Open destinations, Command Palette actions, Settings destinations, and dynamic document/deck/card results match the baseline. Do not overwrite `C:\Users\takahashi\AppData\Local\Library\library_desktop.exe` without explicit approval.

- [ ] **Step 6: Commit final reconciliation**

```powershell
git add CONTEXT.md docs/adr docs/superpowers apps/desktop/README.md
git commit -m "docs: record plugin platform foundation"
```

If no documentation changed after earlier commits, skip an empty commit.

## Completion checklist

- [ ] One JSON Schema value drives TypeScript manifest types and runtime validation.
- [ ] `PluginRegistry` has a small immutable read Interface and hides validation complexity.
- [ ] Core Services are not represented as fake Plugins.
- [ ] All current public routes and public actions have exactly one registered owner.
- [ ] Current executable behavior is connected only through explicit First-party adapters.
- [ ] Route, command, settings, and navigation display metadata have no independent duplicate source.
- [ ] Existing IDs, behavior, login, data, and native command registration remain unchanged.
- [ ] Focused registration tests, full tests, and production build pass.
- [ ] Any fresh runtime claim names the exact revision, launch mode, and artifact path.
