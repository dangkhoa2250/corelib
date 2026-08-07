import { describe, expect, it } from "vitest";

import { CORE_CONTRIBUTIONS } from "../plugins/coreContributions";
import { FIRST_PARTY_PLUGIN_CATALOG } from "../plugins/firstParty";
import { createPluginLifecycle } from "../plugins/lifecycle";
import { createMemoryPluginLifecycleStateStore } from "../plugins/lifecycleState";
import { CORELIB_PLUGIN_API_VERSION } from "../plugins/manifest";
import { deriveAppPluginActivation } from "./pluginActivation";

describe("deriveAppPluginActivation", () => {
  it("centralizes route, Settings, and embedded integration availability", async () => {
    const lifecycle = createPluginLifecycle({
      pluginApiVersion: CORELIB_PLUGIN_API_VERSION,
      coreContributions: CORE_CONTRIBUTIONS,
      installedPlugins: FIRST_PARTY_PLUGIN_CATALOG,
      store: createMemoryPluginLifecycleStateStore(),
    });
    await lifecycle.load("account-a");
    const snapshot = await lifecycle.apply(
      lifecycle.plan({ kind: "disable-plugin", pluginId: "corelib.models" }),
    );

    const activation = deriveAppPluginActivation(snapshot);

    expect(activation.library).toBe(true);
    expect(activation.models).toBe(false);
    expect(activation.settingsSections).toEqual(["account", "appearance", "drive", "memora"]);
    expect(activation.isRouteAvailable({ name: "library" })).toBe(true);
    expect(activation.isRouteAvailable({ name: "settings", section: "model" })).toBe(false);
    expect(activation.isRouteAvailable({ name: "settings", section: "appearance" })).toBe(true);
  });
});
