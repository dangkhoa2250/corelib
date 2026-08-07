import type { PluginDefinition } from "../../plugins/registry";

export const MODELS_PLUGIN = {
  manifest: {
    manifestVersion: 1,
    id: "corelib.models",
    version: "1.0.0",
    name: "Models and Translation",
    description: "Configures AI models and translation engines.",
    publisher: "Corelib",
    compatibility: { pluginApi: "^1.0.0" },
    dependencies: [],
    permissions: [],
    contributions: {
      surfaces: [
        {
          id: "route.settings.model",
          title: "Model",
          aliases: ["provider", "translation"],
          breadcrumb: ["Settings", "Models"],
          group: "Settings",
          kind: "settings",
          quickOpen: true,
          bindingId: "route.settings.model",
        },
      ],
      commands: [
        {
          id: "action.translation-windows-on-device",
          title: "Translation: Windows on-device",
          aliases: ["offline translation", "no api key", "edge translator"],
          breadcrumb: ["Settings", "Models"],
          group: "Settings",
          audiences: ["human"],
          effect: "write",
          bindingId: "action.translation-windows-on-device",
          availabilityId: "availability.windows-on-device-translation",
        },
      ],
      searchProviders: [],
      resources: [],
      events: [],
    },
  },
  declaredBindings: ["route.settings.model", "action.translation-windows-on-device"],
} satisfies PluginDefinition;
