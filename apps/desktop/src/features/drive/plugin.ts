import type { PluginDefinition } from "../../plugins/registry";

export const DRIVE_PLUGIN = {
  manifest: {
    manifestVersion: 1,
    id: "corelib.drive",
    version: "1.0.0",
    name: "Google Drive",
    description: "Connects Library storage to Google Drive.",
    publisher: "Corelib",
    compatibility: { pluginApi: "^1.0.0" },
    dependencies: [{ pluginId: "corelib.library", version: "^1.0.0", optional: false }],
    permissions: [],
    contributions: {
      surfaces: [
        {
          id: "route.settings.drive",
          title: "Google Drive",
          aliases: ["cloud", "oauth"],
          breadcrumb: ["Settings", "General"],
          group: "Settings",
          kind: "settings",
          quickOpen: true,
          bindingId: "route.settings.drive",
        },
      ],
      commands: [],
      searchProviders: [],
      resources: [],
      events: [],
    },
  },
  declaredBindings: ["route.settings.drive"],
} satisfies PluginDefinition;
