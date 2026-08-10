import { fireEvent, render, screen } from "@testing-library/react";
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

    expect(onNavigate).toHaveBeenCalledWith("route.statistics");
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

    expect(
      createDefaultSidebarItems(snapshot.registry, snapshot.visiblePinnedSurfaceIds).map(
        ({ section }) => section,
      ),
    ).toEqual([
      "home",
      "library",
      "statistics",
    ]);
  });

  it("renders reorderable tabs without arrow controls", () => {
    const onReorder = vi.fn();
    const items = createDefaultSidebarItems(DEFAULT_PLUGIN_REGISTRY);
    render(
      <AppSidebar
        active="library"
        items={items}
        onNavigate={vi.fn()}
        onReorder={onReorder}
        onSearchClick={vi.fn()}
        onSettingsClick={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Trash" }).closest("li"))
      .toHaveAttribute("data-reorderable", "true");

    expect(screen.queryByRole("button", { name: "Move Memora up" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Move Memora down" })).not.toBeInTheDocument();
  });

  it("reorders when a tab is dragged with pointer events", () => {
    const onReorder = vi.fn();
    const items = createDefaultSidebarItems(DEFAULT_PLUGIN_REGISTRY);
    render(
      <AppSidebar
        active="library"
        items={items}
        onNavigate={vi.fn()}
        onReorder={onReorder}
        onSearchClick={vi.fn()}
        onSettingsClick={vi.fn()}
      />,
    );
    const trashButton = screen.getByRole("button", { name: "Trash" });
    const memoraRow = screen.getByRole("button", { name: "Memora" }).closest("li")!;
    const originalElementFromPoint = document.elementFromPoint;
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => memoraRow,
    });

    fireEvent.pointerDown(trashButton, { pointerId: 1, clientX: 20, clientY: 0 });
    fireEvent.pointerMove(trashButton, { pointerId: 1, clientX: 30, clientY: 0 });
    expect(trashButton.closest("li")).toHaveAttribute("data-dragging", "true");
    expect(memoraRow).toHaveAttribute("data-drag-over", "true");
    fireEvent.pointerUp(trashButton, { pointerId: 1, clientX: 30, clientY: 0 });

    expect(onReorder).toHaveBeenCalledWith("route.trash", "route.memora");
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: originalElementFromPoint,
    });
  });
});
