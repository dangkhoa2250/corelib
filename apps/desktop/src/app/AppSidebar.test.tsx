import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_PLUGIN_REGISTRY } from "../plugins/firstParty";
import { AppSidebar, createDefaultSidebarItems } from "./AppSidebar";

describe("AppSidebar plugin navigation", () => {
  it("derives the existing default navigation order from registered Surfaces", () => {
    expect(
      createDefaultSidebarItems(DEFAULT_PLUGIN_REGISTRY).map(({ section, label }) => ({
        section,
        label,
      })),
    ).toEqual([
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
});
