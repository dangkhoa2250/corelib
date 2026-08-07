import type { PluginDefinition } from "../../plugins/registry";

export const STATISTICS_PLUGIN = {
  manifest: {
    manifestVersion: 1,
    id: "corelib.statistics",
    version: "1.0.0",
    name: "Statistics",
    description: "Shows activity, progress, and application insights.",
    publisher: "Corelib",
    compatibility: { pluginApi: "^1.0.0" },
    dependencies: [
      { pluginId: "corelib.library", version: "^1.0.0", optional: true },
      { pluginId: "corelib.memora", version: "^1.0.0", optional: true },
    ],
    permissions: [],
    contributions: {
      surfaces: [
        {
          id: "route.statistics",
          title: "Statistics",
          aliases: ["analytics", "activity", "progress", "insights"],
          breadcrumb: ["Statistics"],
          group: "Navigate",
          kind: "page",
          quickOpen: true,
          navigation: { defaultPinned: true, order: 30 },
          icon: "statistics",
          bindingId: "route.statistics",
        },
      ],
      commands: [],
      searchProviders: [],
      resources: [],
      events: [],
    },
  },
  declaredBindings: ["route.statistics"],
} satisfies PluginDefinition;
