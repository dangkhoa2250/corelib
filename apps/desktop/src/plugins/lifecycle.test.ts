import { describe, expect, it } from "vitest";

import { CORE_CONTRIBUTIONS } from "./coreContributions";
import { FIRST_PARTY_PLUGINS } from "./firstParty";
import {
  createMemoryPluginLifecycleStateStore,
  createPluginLifecycle,
} from "./lifecycle";
import { createEmptyPluginLifecycleState } from "./lifecycleState";
import { CORELIB_PLUGIN_API_VERSION } from "./manifest";
import type { PluginDefinition } from "./registry";

const CURRENT_PLUGIN_IDS = [
  "corelib.drive",
  "corelib.library",
  "corelib.memora",
  "corelib.models",
  "corelib.statistics",
] as const;

const CURRENT_PINNED_SURFACE_IDS = [
  "route.library",
  "route.memora",
  "route.statistics",
  "route.trash",
] as const;

function createEmptyPlugin(pluginId: string): PluginDefinition {
  return {
    manifest: {
      manifestVersion: 1,
      id: pluginId,
      version: "1.0.0",
      name: "Later Plugin",
      description: "Introduced after the account state was created.",
      publisher: "Corelib",
      compatibility: { pluginApi: "^1.0.0" },
      dependencies: [],
      permissions: [],
      contributions: {
        surfaces: [],
        commands: [],
        searchProviders: [],
        resources: [],
        events: [],
      },
    },
    declaredBindings: [],
  };
}

function expectLifecycleIssue(action: () => unknown, code: string) {
  let caught: unknown;
  try {
    action();
  } catch (error) {
    caught = error;
  }
  expect(caught).toMatchObject({
    issues: [expect.objectContaining({ code })],
  });
}

describe("PluginLifecycle", () => {
  it("loads a new account with the current First-party defaults", async () => {
    const lifecycle = createPluginLifecycle({
      pluginApiVersion: CORELIB_PLUGIN_API_VERSION,
      coreContributions: CORE_CONTRIBUTIONS,
      installedPlugins: FIRST_PARTY_PLUGINS.map((definition) => ({
        definition,
        defaultEnabled: true,
      })),
      store: createMemoryPluginLifecycleStateStore(),
    });

    const snapshot = await lifecycle.load("account-a");

    expect(snapshot.accountId).toBe("account-a");
    expect(snapshot.enabledPluginIds).toEqual(CURRENT_PLUGIN_IDS);
    expect(snapshot.pinnedSurfaceIds).toEqual(CURRENT_PINNED_SURFACE_IDS);
    expect(snapshot.registry.listPlugins().map((plugin) => plugin.id)).toEqual(
      snapshot.enabledPluginIds,
    );
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it("keeps a later First-party plugin disabled for an existing account", async () => {
    const persistedState = {
      ...createEmptyPluginLifecycleState(),
      accounts: {
        "account-a": {
          revision: 3,
          knownPluginIds: CURRENT_PLUGIN_IDS,
          enabledPluginIds: CURRENT_PLUGIN_IDS,
          navigation: { pinnedSurfaceIds: CURRENT_PINNED_SURFACE_IDS },
        },
      },
    };
    const store = createMemoryPluginLifecycleStateStore(persistedState);
    const laterPlugin = createEmptyPlugin("corelib.later");
    const lifecycle = createPluginLifecycle({
      pluginApiVersion: CORELIB_PLUGIN_API_VERSION,
      coreContributions: CORE_CONTRIBUTIONS,
      installedPlugins: [
        ...FIRST_PARTY_PLUGINS.map((definition) => ({ definition, defaultEnabled: true })),
        { definition: laterPlugin, defaultEnabled: true },
      ],
      store,
    });

    const snapshot = await lifecycle.load("account-a");

    expect(snapshot.knownPluginIds).toEqual([...CURRENT_PLUGIN_IDS, "corelib.later"]);
    expect(snapshot.enabledPluginIds).toEqual(CURRENT_PLUGIN_IDS);
    expect(snapshot.registry.listPlugins().map((plugin) => plugin.id)).toEqual(
      CURRENT_PLUGIN_IDS,
    );
    expect(snapshot.pinnedSurfaceIds).toEqual(CURRENT_PINNED_SURFACE_IDS);
    expect(
      snapshot.installedPlugins.find(({ manifest }) => manifest.id === "corelib.later"),
    ).toMatchObject({ status: "new" });
    expect(Object.isFrozen(snapshot.installedPlugins)).toBe(true);
  });

  it("plans and applies an independent disable and enable immutably", async () => {
    const store = createMemoryPluginLifecycleStateStore();
    const lifecycle = createPluginLifecycle({
      pluginApiVersion: CORELIB_PLUGIN_API_VERSION,
      coreContributions: CORE_CONTRIBUTIONS,
      installedPlugins: FIRST_PARTY_PLUGINS.map((definition) => ({
        definition,
        defaultEnabled: true,
      })),
      store,
    });
    const before = await lifecycle.load("account-a");
    expect(before.isIntegrationAvailable("corelib.memora", "corelib.library")).toBe(true);

    const disablePlan = lifecycle.plan({
      kind: "disable-plugin",
      pluginId: "corelib.models",
    });

    expect(disablePlan.affectedPluginIds).toEqual(["corelib.models"]);
    expect(disablePlan.confirmationReasons).toEqual([]);
    expect(Object.isFrozen(disablePlan)).toBe(true);

    const disabled = await lifecycle.apply(disablePlan);
    expect(before.isEnabled("corelib.models")).toBe(true);
    expect(disabled.isEnabled("corelib.models")).toBe(false);
    expect(disabled.registry.ownerOf("route.settings.model")).toBeNull();
    expect(disabled.revision).toBe(before.revision + 1);

    const enabled = await lifecycle.apply(
      lifecycle.plan({ kind: "enable-plugin", pluginId: "corelib.models" }),
    );
    expect(enabled.isEnabled("corelib.models")).toBe(true);
    expect(enabled.registry.ownerOf("route.settings.model")).toEqual({
      kind: "plugin",
      id: "corelib.models",
    });
  });

  it("auto-enables required dependencies in dependency order", async () => {
    const store = createMemoryPluginLifecycleStateStore({
      ...createEmptyPluginLifecycleState(),
      accounts: {
        "account-a": {
          revision: 1,
          knownPluginIds: CURRENT_PLUGIN_IDS,
          enabledPluginIds: [
            "corelib.memora",
            "corelib.models",
            "corelib.statistics",
          ],
          navigation: { pinnedSurfaceIds: CURRENT_PINNED_SURFACE_IDS },
        },
      },
    });
    const lifecycle = createPluginLifecycle({
      pluginApiVersion: CORELIB_PLUGIN_API_VERSION,
      coreContributions: CORE_CONTRIBUTIONS,
      installedPlugins: FIRST_PARTY_PLUGINS.map((definition) => ({
        definition,
        defaultEnabled: true,
      })),
      store,
    });
    await lifecycle.load("account-a");

    const plan = lifecycle.plan({
      kind: "enable-plugin",
      pluginId: "corelib.drive",
    });

    expect(plan.affectedPluginIds).toEqual(["corelib.library", "corelib.drive"]);
    const snapshot = await lifecycle.apply(plan);
    expect(snapshot.isEnabled("corelib.library")).toBe(true);
    expect(snapshot.isEnabled("corelib.drive")).toBe(true);
  });

  it("requires confirmation for a deterministic required-dependent cascade", async () => {
    const lifecycle = createPluginLifecycle({
      pluginApiVersion: CORELIB_PLUGIN_API_VERSION,
      coreContributions: CORE_CONTRIBUTIONS,
      installedPlugins: FIRST_PARTY_PLUGINS.map((definition) => ({
        definition,
        defaultEnabled: true,
      })),
      store: createMemoryPluginLifecycleStateStore(),
    });
    const before = await lifecycle.load("account-a");

    const unconfirmedPlan = lifecycle.plan({
      kind: "disable-plugin",
      pluginId: "corelib.library",
    });

    expect(unconfirmedPlan.affectedPluginIds).toEqual([
      "corelib.drive",
      "corelib.library",
    ]);
    expect(unconfirmedPlan.confirmationReasons).toEqual([
      { code: "cascade", pluginIds: ["corelib.drive"] },
    ]);
    await expect(lifecycle.apply(unconfirmedPlan)).rejects.toMatchObject({
      issues: [{ code: "confirmation_required" }],
    });
    expect(before.isEnabled("corelib.library")).toBe(true);
    expect(before.isEnabled("corelib.drive")).toBe(true);

    const confirmedPlan = lifecycle.plan({
      kind: "disable-plugin",
      pluginId: "corelib.library",
      confirmationGranted: true,
    });
    const after = await lifecycle.apply(confirmedPlan);
    expect(after.isEnabled("corelib.library")).toBe(false);
    expect(after.isEnabled("corelib.drive")).toBe(false);
    expect(after.isEnabled("corelib.memora")).toBe(true);
    expect(after.isEnabled("corelib.statistics")).toBe(true);
    expect(after.pinnedSurfaceIds).toEqual(CURRENT_PINNED_SURFACE_IDS);
    expect(after.visiblePinnedSurfaceIds).toEqual([
      "route.memora",
      "route.statistics",
      "route.trash",
    ]);
    expect(after.isIntegrationAvailable("corelib.memora", "corelib.library")).toBe(false);
    expect(after.isIntegrationAvailable("corelib.statistics", "corelib.memora")).toBe(true);
  });

  it("plans pin, unpin, and stable-ID reorder while rejecting a stale plan", async () => {
    const lifecycle = createPluginLifecycle({
      pluginApiVersion: CORELIB_PLUGIN_API_VERSION,
      coreContributions: CORE_CONTRIBUTIONS,
      installedPlugins: FIRST_PARTY_PLUGINS.map((definition) => ({
        definition,
        defaultEnabled: true,
      })),
      store: createMemoryPluginLifecycleStateStore(),
    });
    await lifecycle.load("account-a");

    const selfReorderPlan = lifecycle.plan({
      kind: "reorder-surface",
      surfaceId: "route.memora",
      beforeSurfaceId: "route.memora",
    });
    expect(selfReorderPlan.proposedState.navigation.pinnedSurfaceIds).toEqual(
      CURRENT_PINNED_SURFACE_IDS,
    );

    const staleUnpinPlan = lifecycle.plan({
      kind: "unpin-surface",
      surfaceId: "route.statistics",
    });
    const reordered = await lifecycle.apply(
      lifecycle.plan({
        kind: "reorder-surface",
        surfaceId: "route.trash",
        beforeSurfaceId: "route.memora",
      }),
    );
    expect(reordered.pinnedSurfaceIds).toEqual([
      "route.library",
      "route.trash",
      "route.memora",
      "route.statistics",
    ]);

    await expect(lifecycle.apply(staleUnpinPlan)).rejects.toMatchObject({
      issues: [{ code: "stale_plan" }],
    });

    const unpinned = await lifecycle.apply(
      lifecycle.plan({ kind: "unpin-surface", surfaceId: "route.statistics" }),
    );
    expect(unpinned.pinnedSurfaceIds).toEqual([
      "route.library",
      "route.trash",
      "route.memora",
    ]);

    const repinned = await lifecycle.apply(
      lifecycle.plan({ kind: "pin-surface", surfaceId: "route.statistics" }),
    );
    expect(repinned.pinnedSurfaceIds).toEqual([
      "route.library",
      "route.trash",
      "route.memora",
      "route.statistics",
    ]);
  });

  it("returns structured issues for unloaded, unknown, and Core changes", async () => {
    const lifecycle = createPluginLifecycle({
      pluginApiVersion: CORELIB_PLUGIN_API_VERSION,
      coreContributions: CORE_CONTRIBUTIONS,
      installedPlugins: FIRST_PARTY_PLUGINS.map((definition) => ({
        definition,
        defaultEnabled: true,
      })),
      store: createMemoryPluginLifecycleStateStore(),
    });

    expectLifecycleIssue(
      () => lifecycle.plan({ kind: "enable-plugin", pluginId: "corelib.models" }),
      "not_loaded",
    );

    await lifecycle.load("account-a");
    expectLifecycleIssue(
      () => lifecycle.plan({ kind: "disable-plugin", pluginId: "corelib.missing" }),
      "unknown_plugin",
    );
    expectLifecycleIssue(
      () => lifecycle.plan({ kind: "pin-surface", surfaceId: "route.missing" }),
      "unknown_surface",
    );
    expectLifecycleIssue(
      () => lifecycle.plan({ kind: "pin-surface", surfaceId: "route.settings" }),
      "core_contribution",
    );
  });

  it("plans confirmation for active, unsaved, and running work", async () => {
    const lifecycle = createPluginLifecycle({
      pluginApiVersion: CORELIB_PLUGIN_API_VERSION,
      coreContributions: CORE_CONTRIBUTIONS,
      installedPlugins: FIRST_PARTY_PLUGINS.map((definition) => ({
        definition,
        defaultEnabled: true,
      })),
      store: createMemoryPluginLifecycleStateStore(),
    });
    await lifecycle.load("account-a");

    const plan = lifecycle.plan({
      kind: "disable-plugin",
      pluginId: "corelib.models",
      context: {
        activePluginId: "corelib.models",
        unsavedWorkPluginIds: ["corelib.models"],
        activeWorkPluginIds: ["corelib.models"],
      },
    });

    expect(plan.confirmationReasons).toEqual([
      { code: "active-plugin", pluginIds: ["corelib.models"] },
      { code: "unsaved-work", pluginIds: ["corelib.models"] },
      { code: "active-work", pluginIds: ["corelib.models"] },
    ]);
  });

  it("keeps the current snapshot when persistence fails", async () => {
    let persistedState = createEmptyPluginLifecycleState();
    let saves = 0;
    const lifecycle = createPluginLifecycle({
      pluginApiVersion: CORELIB_PLUGIN_API_VERSION,
      coreContributions: CORE_CONTRIBUTIONS,
      installedPlugins: FIRST_PARTY_PLUGINS.map((definition) => ({
        definition,
        defaultEnabled: true,
      })),
      store: {
        async load() {
          return persistedState;
        },
        async save(state) {
          saves += 1;
          if (saves > 1) throw new Error("disk full");
          persistedState = state;
        },
      },
    });
    const before = await lifecycle.load("account-a");
    const plan = lifecycle.plan({
      kind: "disable-plugin",
      pluginId: "corelib.models",
    });

    await expect(lifecycle.apply(plan)).rejects.toThrow("disk full");

    const retryPlan = lifecycle.plan({
      kind: "disable-plugin",
      pluginId: "corelib.models",
    });
    expect(retryPlan.baseRevision).toBe(before.revision);
    expect(before.isEnabled("corelib.models")).toBe(true);
  });
});
