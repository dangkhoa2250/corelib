import { describe, expect, it } from "vitest";

import { CORE_CONTRIBUTIONS } from "./coreContributions";
import { FIRST_PARTY_PLUGIN_CATALOG } from "./firstParty";
import { createPluginLifecycle } from "./lifecycle";
import {
  createPluginLifecycleCommandExecutor,
  PLUGIN_LIFECYCLE_COMMAND_IDS,
} from "./lifecycleCommands";
import { createMemoryPluginLifecycleStateStore } from "./lifecycleState";
import { CORELIB_PLUGIN_API_VERSION } from "./manifest";
import { createPluginRegistry } from "./registry";

function createLoadedLifecycle() {
  const lifecycle = createPluginLifecycle({
    pluginApiVersion: CORELIB_PLUGIN_API_VERSION,
    coreContributions: CORE_CONTRIBUTIONS,
    installedPlugins: FIRST_PARTY_PLUGIN_CATALOG,
    store: createMemoryPluginLifecycleStateStore(),
  });
  return lifecycle.load("account-a").then(() => lifecycle);
}

describe("Plugin lifecycle Agent Core Commands", () => {
  it("registers five Agent-only Commands with versioned input and output schemas", () => {
    const registry = createPluginRegistry({
      pluginApiVersion: CORELIB_PLUGIN_API_VERSION,
      coreContributions: CORE_CONTRIBUTIONS,
      plugins: FIRST_PARTY_PLUGIN_CATALOG.map(({ definition }) => definition),
    });
    const lifecycleCommandIds = new Set<string>(PLUGIN_LIFECYCLE_COMMAND_IDS);
    const commands = registry.listCommands().filter(({ id }) =>
      lifecycleCommandIds.has(id),
    );

    expect(commands.map(({ id }) => id)).toEqual([...PLUGIN_LIFECYCLE_COMMAND_IDS].sort());
    commands.forEach((command) => {
      expect(command.audiences).toEqual(["agent"]);
      expect(command.effect).toBe("write");
      expect(command.input).toMatchObject({ schemaVersion: 1, schema: { type: "object" } });
      expect(command.output).toMatchObject({ schemaVersion: 1, schema: { type: "object" } });
    });
    expect(commands.find(({ id }) => id === "core.plugins.disable")?.confirmation).toBe("when-required");
  });

  it("executes enable, disable, pin, unpin, and reorder through PluginLifecycle", async () => {
    const lifecycle = await createLoadedLifecycle();
    const executor = createPluginLifecycleCommandExecutor(lifecycle);

    await executor.execute("core.plugins.disable", { pluginId: "corelib.models" });
    expect((await executor.execute("core.plugins.enable", { pluginId: "corelib.models" })).enabledPluginIds)
      .toContain("corelib.models");

    await executor.execute("core.navigation.unpin", { surfaceId: "route.memora" });
    expect((await executor.execute("core.navigation.pin", { surfaceId: "route.memora" })).pinnedSurfaceIds)
      .toContain("route.memora");

    const reordered = await executor.execute("core.navigation.reorder", {
      surfaceId: "route.memora",
      beforeSurfaceId: "route.library",
    });
    expect(reordered.pinnedSurfaceIds.indexOf("route.memora"))
      .toBeLessThan(reordered.pinnedSurfaceIds.indexOf("route.library"));
  });

  it("does not bypass confirmation for a required dependency cascade", async () => {
    const lifecycle = await createLoadedLifecycle();
    const executor = createPluginLifecycleCommandExecutor(lifecycle);

    await expect(executor.execute("core.plugins.disable", { pluginId: "corelib.library" }))
      .rejects.toMatchObject({ issues: [expect.objectContaining({ code: "confirmation_required" })] });

    const result = await executor.execute(
      "core.plugins.disable",
      { pluginId: "corelib.library" },
      { confirmed: true },
    );
    expect(result.enabledPluginIds).not.toContain("corelib.library");
    expect(result.enabledPluginIds).not.toContain("corelib.drive");
    expect(result.affectedPluginIds).toEqual(["corelib.drive", "corelib.library"]);
  });
});
