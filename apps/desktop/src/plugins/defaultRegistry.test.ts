import { describe, expect, it } from "vitest";

import { DEFAULT_PLUGIN_REGISTRY } from "./firstParty";

describe("DEFAULT_PLUGIN_REGISTRY", () => {
  it("registers the exact Phase 1 First-party plugin inventory", () => {
    expect(DEFAULT_PLUGIN_REGISTRY.listPlugins().map((plugin) => plugin.id)).toEqual([
      "corelib.drive",
      "corelib.library",
      "corelib.memora",
      "corelib.models",
      "corelib.statistics",
    ]);
  });

  it.each([
    ["route.library", "corelib.library"],
    ["action.import-pdf", "corelib.library"],
    ["search.documents", "corelib.library"],
    ["route.memora", "corelib.memora"],
    ["route.trash", "corelib.memora"],
    ["search.decks", "corelib.memora"],
    ["search.cards", "corelib.memora"],
    ["search.trash", "corelib.memora"],
    ["route.statistics", "corelib.statistics"],
    ["route.settings.drive", "corelib.drive"],
    ["route.settings.model", "corelib.models"],
  ])("assigns %s to %s", (contributionId, pluginId) => {
    expect(DEFAULT_PLUGIN_REGISTRY.ownerOf(contributionId)).toEqual({
      kind: "plugin",
      id: pluginId,
    });
  });

  it.each([
    ["route.settings", "settings"],
    ["route.settings.account", "account"],
    ["route.settings.appearance", "appearance"],
    ["action.theme-system", "appearance"],
  ])("keeps %s owned by Core Service %s", (contributionId, serviceId) => {
    expect(DEFAULT_PLUGIN_REGISTRY.ownerOf(contributionId)).toEqual({
      kind: "core-service",
      id: serviceId,
    });
  });
});
