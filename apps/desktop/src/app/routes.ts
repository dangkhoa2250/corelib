import type { LibraryDocument } from "../domain/document";
import type { Deck, LearningCard, StudySession } from "../domain/learning";
import { DEFAULT_PLUGIN_REGISTRY } from "../plugins/firstParty";

export type SettingsSection = "account" | "appearance" | "drive" | "model" | "memora";

export type StatisticsRouteTarget =
  | { kind: "app"; appKey: string }
  | { kind: "document"; documentId: string }
  | { kind: "deck"; deckId: string };

export type AppRoute =
  | { name: "home" }
  | { name: "library" }
  | { name: "memora" }
  | { name: "reader"; document: LibraryDocument }
  | { name: "review"; session: StudySession; sourceDeck?: Deck; mode: "study" }
  | { name: "review"; cards: LearningCard[]; sourceDeck: Deck; mode: "practice" }
  | { name: "cardBrowser"; deckId: string }
  | { name: "deckDetail"; deck: Deck; searchQuery?: string }
  | { name: "trash" }
  | { name: "settings"; section?: SettingsSection }
  | { name: "admin" }
  | { name: "statistics"; target?: StatisticsRouteTarget; origin?: "library" | "memora" };

export const publicRouteNames = ["home", "library", "memora", "trash", "settings", "statistics"] as const;
export type PublicRouteName = (typeof publicRouteNames)[number];

const SURFACE_ROUTES: Readonly<Record<string, AppRoute>> = Object.freeze({
  "route.home": { name: "home" },
  "route.library": { name: "library" },
  "route.memora": { name: "memora" },
  "route.statistics": { name: "statistics" },
  "route.trash": { name: "trash" },
  "route.settings": { name: "settings" },
  "route.settings.account": { name: "settings", section: "account" },
  "route.settings.appearance": { name: "settings", section: "appearance" },
  "route.settings.drive": { name: "settings", section: "drive" },
  "route.settings.memora": { name: "settings", section: "memora" },
  "route.settings.model": { name: "settings", section: "model" },
});

export function appRouteForSurfaceId(surfaceId: string): AppRoute | null {
  return SURFACE_ROUTES[surfaceId] ?? null;
}

interface PublicRouteDefinition {
  id: string;
  title: string;
  aliases: readonly string[];
  breadcrumb: readonly string[];
  route: AppRoute;
}

const PUBLIC_ROUTE_BINDINGS = {
  home: { contributionId: "route.home", route: { name: "home" } },
  library: { contributionId: "route.library", route: { name: "library" } },
  memora: { contributionId: "route.memora", route: { name: "memora" } },
  trash: { contributionId: "route.trash", route: { name: "trash" } },
  settings: { contributionId: "route.settings", route: { name: "settings" } },
  statistics: { contributionId: "route.statistics", route: { name: "statistics" } },
} as const satisfies Record<
  PublicRouteName,
  { contributionId: string; route: AppRoute }
>;

function publicRouteDefinition(name: PublicRouteName): PublicRouteDefinition {
  const binding = PUBLIC_ROUTE_BINDINGS[name];
  const surface = DEFAULT_PLUGIN_REGISTRY
    .listSurfaces()
    .find((candidate) => candidate.id === binding.contributionId);
  if (!surface || surface.kind !== "page") {
    throw new Error(`Public route has no registered page Surface: ${binding.contributionId}`);
  }
  return {
    id: surface.id,
    title: surface.title,
    aliases: surface.aliases,
    breadcrumb: surface.breadcrumb,
    route: binding.route,
  };
}

export const PUBLIC_ROUTE_CATALOG = Object.freeze({
  home: publicRouteDefinition("home"),
  library: publicRouteDefinition("library"),
  memora: publicRouteDefinition("memora"),
  trash: publicRouteDefinition("trash"),
  settings: publicRouteDefinition("settings"),
  statistics: publicRouteDefinition("statistics"),
}) satisfies Record<PublicRouteName, PublicRouteDefinition>;
