import type { PluginManifest } from "./manifest";
import type { CoreContributionDefinition } from "./registry";

const emptyReservedContributions = {
  searchProviders: [],
  resources: [],
  events: [],
} satisfies Pick<
  PluginManifest["contributions"],
  "searchProviders" | "resources" | "events"
>;

export const CORE_CONTRIBUTIONS = [
  {
    ownerId: "settings",
    contributions: {
      ...emptyReservedContributions,
      surfaces: [
        {
          id: "route.settings",
          title: "Settings",
          aliases: ["preferences"],
          breadcrumb: ["Settings"],
          group: "Navigate",
          kind: "page",
          quickOpen: true,
          icon: "settings",
          bindingId: "route.settings",
        },
      ],
      commands: [],
    },
    declaredBindings: ["route.settings"],
  },
  {
    ownerId: "account",
    contributions: {
      ...emptyReservedContributions,
      surfaces: [
        {
          id: "route.settings.account",
          title: "Account",
          aliases: ["profile"],
          breadcrumb: ["Settings", "General"],
          group: "Settings",
          kind: "settings",
          quickOpen: true,
          bindingId: "route.settings.account",
        },
      ],
      commands: [],
    },
    declaredBindings: ["route.settings.account"],
  },
  {
    ownerId: "appearance",
    contributions: {
      ...emptyReservedContributions,
      surfaces: [
        {
          id: "route.settings.appearance",
          title: "Appearance",
          aliases: ["theme"],
          breadcrumb: ["Settings", "General"],
          group: "Settings",
          kind: "settings",
          quickOpen: true,
          bindingId: "route.settings.appearance",
        },
      ],
      commands: [
        {
          id: "action.theme-light",
          title: "Theme: Light",
          aliases: ["light theme"],
          breadcrumb: ["Settings", "Appearance"],
          group: "Settings",
          audiences: ["human", "agent"],
          effect: "write",
          bindingId: "action.theme-light",
        },
        {
          id: "action.theme-dark",
          title: "Theme: Dark",
          aliases: ["dark theme"],
          breadcrumb: ["Settings", "Appearance"],
          group: "Settings",
          audiences: ["human", "agent"],
          effect: "write",
          bindingId: "action.theme-dark",
        },
        {
          id: "action.theme-system",
          title: "Theme: System",
          aliases: ["system theme", "appearance"],
          breadcrumb: ["Settings", "Appearance"],
          group: "Settings",
          audiences: ["human", "agent"],
          effect: "write",
          bindingId: "action.theme-system",
        },
      ],
    },
    declaredBindings: [
      "route.settings.appearance",
      "action.theme-light",
      "action.theme-dark",
      "action.theme-system",
    ],
  },
] satisfies readonly CoreContributionDefinition[];
