import type { PluginDefinition } from "../../plugins/registry";

export const LIBRARY_PLUGIN = {
  manifest: {
    manifestVersion: 1,
    id: "corelib.library",
    version: "1.0.0",
    name: "Library",
    description: "Stores, imports, searches, and opens documents.",
    publisher: "Corelib",
    compatibility: { pluginApi: "^1.0.0" },
    dependencies: [],
    permissions: [],
    contributions: {
      surfaces: [
        {
          id: "route.library",
          title: "Library",
          aliases: ["documents", "pdf"],
          breadcrumb: ["Library"],
          group: "Navigate",
          kind: "page",
          quickOpen: true,
          navigation: { defaultPinned: true, order: 10 },
          icon: "library",
          bindingId: "route.library",
        },
      ],
      commands: [
        {
          id: "action.import-pdf",
          title: "Import PDF",
          aliases: ["add document"],
          breadcrumb: ["Library"],
          group: "Library",
          audiences: ["human", "agent"],
          effect: "write",
          bindingId: "action.import-pdf",
        },
      ],
      searchProviders: [
        { id: "search.documents", group: "Library", bindingId: "search.documents" },
      ],
      resources: [],
      events: [],
    },
  },
  declaredBindings: ["route.library", "action.import-pdf", "search.documents"],
} satisfies PluginDefinition;
