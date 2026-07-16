import type { LibraryDocument } from "../domain/document";
import type { Deck, LearningCard, ReviewPreview } from "../domain/learning";

export type SettingsSection = "account" | "appearance" | "drive" | "model";

export type AppRoute =
  | { name: "library" }
  | { name: "memora" }
  | { name: "reader"; document: LibraryDocument }
  | { name: "review"; cards: LearningCard[]; previews: Record<string, ReviewPreview>; sourceDeck?: Deck; mode?: "study" | "practice" }
  | { name: "cardBrowser"; deckId: string }
  | { name: "deckDetail"; deck: Deck; searchQuery?: string }
  | { name: "trash" }
  | { name: "settings"; section?: SettingsSection }
  | { name: "admin" };

export const publicRouteNames = ["library", "memora", "trash", "settings"] as const;
export type PublicRouteName = (typeof publicRouteNames)[number];

interface PublicRouteDefinition {
  id: string;
  title: string;
  aliases: string[];
  breadcrumb: string[];
  route: AppRoute;
}

export const PUBLIC_ROUTE_CATALOG = {
  library: { id: "route.library", title: "Library", aliases: ["documents", "pdf"], breadcrumb: ["Library"], route: { name: "library" } },
  memora: { id: "route.memora", title: "Memora", aliases: ["flashcards", "decks"], breadcrumb: ["Memora"], route: { name: "memora" } },
  trash: { id: "route.trash", title: "Trash", aliases: ["deleted cards"], breadcrumb: ["Trash"], route: { name: "trash" } },
  settings: { id: "route.settings", title: "Settings", aliases: ["preferences"], breadcrumb: ["Settings"], route: { name: "settings" } },
} satisfies Record<PublicRouteName, PublicRouteDefinition>;
