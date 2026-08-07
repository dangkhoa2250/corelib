import type { PluginLifecycleSnapshot } from "../plugins/lifecycle";
import type { AppRoute, SettingsSection } from "./routes";

export interface AppPluginActivation {
  readonly library: boolean;
  readonly memora: boolean;
  readonly statistics: boolean;
  readonly drive: boolean;
  readonly models: boolean;
  readonly settingsSections: readonly SettingsSection[];
  isRouteAvailable(route: AppRoute): boolean;
}

export function deriveAppPluginActivation(
  snapshot: PluginLifecycleSnapshot,
): AppPluginActivation {
  const library = snapshot.isEnabled("corelib.library");
  const memora = snapshot.isEnabled("corelib.memora");
  const statistics = snapshot.isEnabled("corelib.statistics");
  const drive = snapshot.isEnabled("corelib.drive");
  const models = snapshot.isEnabled("corelib.models");
  const settingsSections: readonly SettingsSection[] = Object.freeze([
    "account",
    "appearance",
    ...(drive ? ["drive" as const] : []),
    ...(models ? ["model" as const] : []),
    ...(memora ? ["memora" as const] : []),
  ]);

  return Object.freeze({
    library,
    memora,
    statistics,
    drive,
    models,
    settingsSections,
    isRouteAvailable: (route: AppRoute): boolean => {
      switch (route.name) {
        case "library":
        case "reader":
          return library;
        case "memora":
        case "deckDetail":
        case "cardBrowser":
        case "trash":
        case "review":
          return memora;
        case "statistics":
          return statistics;
        case "settings":
          return route.section === "drive"
            ? drive
            : route.section === "model"
              ? models
              : route.section === "memora"
                ? memora
                : true;
        default:
          return true;
      }
    },
  });
}
