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
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("app-sidebar__nav")) return new DOMRect(0, 0, 220, 200);
      if (this.dataset.surfaceId) {
        const rows = [...document.querySelectorAll<HTMLElement>(".app-sidebar__nav > li[data-surface-id]")];
        const baseTop = rows.indexOf(this) * 34;
        const translateX = Number.parseFloat(this.style.getPropertyValue("--sidebar-drag-x")) || 0;
        const translateY = Number.parseFloat(this.style.getPropertyValue("--sidebar-drag-y")) || 0;
        return new DOMRect(translateX, baseTop + translateY, 220, 32);
      }
      return new DOMRect();
    });
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

    fireEvent.pointerDown(trashButton, { pointerId: 1, clientX: 20, clientY: 153 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 30, clientY: 70 });
    expect(trashButton.closest("li")).toHaveAttribute("data-dragging", "true");
    expect(memoraRow).toHaveAttribute("data-drag-over", "true");
    expect([...document.querySelectorAll<HTMLElement>(".app-sidebar__nav > li[data-surface-id]")]
      .map((row) => row.dataset.surfaceId)).toEqual([
        "route.home",
        "route.library",
        "route.trash",
        "route.memora",
        "route.statistics",
      ]);
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 30, clientY: 70 });

    expect(onReorder).toHaveBeenCalledWith("route.trash", "route.memora");
    rectSpy.mockRestore();
  });

  it("does not highlight the next tab while the dragged tab remains in its slot", () => {
    const onReorder = vi.fn();
    const defaultItems = createDefaultSidebarItems(DEFAULT_PLUGIN_REGISTRY);
    const order = ["route.home", "route.library", "route.statistics", "route.memora", "route.trash"];
    const items = order.map((surfaceId) => defaultItems.find((item) => item.surfaceId === surfaceId)!);
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("app-sidebar__nav")) return new DOMRect(0, 0, 220, 200);
      if (this.dataset.surfaceId) {
        const rows = [...document.querySelectorAll<HTMLElement>(".app-sidebar__nav > li[data-surface-id]")];
        const baseTop = rows.indexOf(this) * 34;
        const translateX = Number.parseFloat(this.style.getPropertyValue("--sidebar-drag-x")) || 0;
        const translateY = Number.parseFloat(this.style.getPropertyValue("--sidebar-drag-y")) || 0;
        return new DOMRect(translateX, baseTop + translateY, 220, 32);
      }
      return new DOMRect();
    });
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
    const memoraButton = screen.getByRole("button", { name: "Memora" });
    const trashRow = screen.getByRole("button", { name: "Trash" }).closest("li")!;

    fireEvent.pointerDown(memoraButton, { pointerId: 1, clientX: 20, clientY: 119 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 21, clientY: 120 });

    expect(memoraButton.closest("li")).toHaveAttribute("data-dragging", "true");
    expect(trashRow).not.toHaveAttribute("data-drag-over");
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 21, clientY: 120 });
    expect(onReorder).not.toHaveBeenCalled();
    rectSpy.mockRestore();
  });
});
