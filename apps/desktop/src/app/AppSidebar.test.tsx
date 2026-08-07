import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_PLUGIN_REGISTRY, FIRST_PARTY_PLUGIN_CATALOG } from "../plugins/firstParty";
import { CORE_CONTRIBUTIONS } from "../plugins/coreContributions";
import { createPluginLifecycle } from "../plugins/lifecycle";
import { createMemoryPluginLifecycleStateStore } from "../plugins/lifecycleState";
import { CORELIB_PLUGIN_API_VERSION } from "../plugins/manifest";
import { AppSidebar, createDefaultSidebarItems } from "./AppSidebar";

describe("AppSidebar plugin navigation", () => {
  it("derives the existing default navigation order from registered Surfaces", () => {
    expect(
      createDefaultSidebarItems(DEFAULT_PLUGIN_REGISTRY).map(({ section, label }) => ({
        section,
        label,
      })),
    ).toEqual([
      { section: "home", label: "Home" },
      { section: "library", label: "Library" },
      { section: "memora", label: "Memora" },
      { section: "statistics", label: "Statistics" },
      { section: "trash", label: "Trash" },
    ]);
  });

  it("keeps registered navigation wired to the existing host callback", async () => {
    const onNavigate = vi.fn();
    const items = createDefaultSidebarItems(DEFAULT_PLUGIN_REGISTRY);
    render(
      <AppSidebar
        active="library"
        items={items}
        onNavigate={onNavigate}
        onSearchClick={vi.fn()}
        onSettingsClick={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Statistics" }));

    expect(onNavigate).toHaveBeenCalledWith("statistics");
  });

  it("omits disabled Plugin Surfaces from navigation", async () => {
    const lifecycle = createPluginLifecycle({
      pluginApiVersion: CORELIB_PLUGIN_API_VERSION,
      coreContributions: CORE_CONTRIBUTIONS,
      installedPlugins: FIRST_PARTY_PLUGIN_CATALOG,
      store: createMemoryPluginLifecycleStateStore(),
    });
    await lifecycle.load("account-a");
    const snapshot = await lifecycle.apply(
      lifecycle.plan({ kind: "disable-plugin", pluginId: "corelib.memora" }),
    );

    expect(createDefaultSidebarItems(snapshot.registry).map(({ section }) => section)).toEqual([
      "home",
      "library",
      "statistics",
    ]);
  });
});
