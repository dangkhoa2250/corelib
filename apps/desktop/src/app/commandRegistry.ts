import type { LibraryDocument } from "../domain/document";
import type { Deck } from "../domain/learning";
import type { SearchResult } from "../lib/learning";
import { PUBLIC_ROUTE_CATALOG, type AppRoute, type SettingsSection } from "./routes";

export type CommandSurface = "quick-open" | "command-palette";

export interface CommandEntry {
  id: string;
  surface: CommandSurface;
  title: string;
  aliases: string[];
  breadcrumb: string[];
  group: string;
  execute: () => void | Promise<void>;
}

export interface TrashSearchTarget {
  id: string;
  title: string;
  deckName: string | null;
}

export interface CommandContext {
  documents: LibraryDocument[];
  decks: Deck[];
  searchCards: (query: string) => Promise<SearchResult[]>;
  searchTrash: (query: string) => Promise<TrashSearchTarget[]>;
  openRoute: (route: AppRoute) => void;
  openDocument: (document: LibraryDocument) => void;
  openDeck: (deck: Deck) => void;
  openCard: (id: string, title: string) => void | Promise<void>;
  openTrash: () => void;
  importPdf: () => void | Promise<void>;
  reviewToday: () => void | Promise<void>;
  setTheme: (theme: "light" | "dark" | "system") => void;
}

function fuzzyMatch(text: string, query: string): boolean {
  let queryIndex = 0;
  for (let index = 0; index < text.length && queryIndex < query.length; index += 1) {
    if (text[index] === query[queryIndex]) queryIndex += 1;
  }
  return queryIndex === query.length;
}

function matches(entry: CommandEntry, query: string): boolean {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const text = [entry.title, ...entry.aliases, ...entry.breadcrumb].join(" ").toLocaleLowerCase();
  return terms.every((term) => fuzzyMatch(text, term));
}

function destination(
  id: string,
  title: string,
  aliases: string[],
  breadcrumb: string[],
  group: string,
  execute: () => void | Promise<void>,
): CommandEntry {
  return { id, surface: "quick-open", title, aliases, breadcrumb, group, execute };
}

function action(
  id: string,
  title: string,
  aliases: string[],
  breadcrumb: string[],
  group: string,
  execute: () => void | Promise<void>,
): CommandEntry {
  return { id, surface: "command-palette", title, aliases, breadcrumb, group, execute };
}

function settingsDestination(
  context: CommandContext,
  section: SettingsSection,
  title: string,
  aliases: string[],
  breadcrumb: string[],
): CommandEntry {
  return destination(`route.settings.${section}`, title, aliases, breadcrumb, "Settings", () => {
    context.openRoute({ name: "settings", section });
  });
}

function staticDestinations(context: CommandContext): CommandEntry[] {
  return [
    destination(
      PUBLIC_ROUTE_CATALOG.library.id,
      PUBLIC_ROUTE_CATALOG.library.title,
      PUBLIC_ROUTE_CATALOG.library.aliases,
      PUBLIC_ROUTE_CATALOG.library.breadcrumb,
      "Navigate",
      () => context.openRoute({ name: "library" }),
    ),
    destination(
      PUBLIC_ROUTE_CATALOG.memora.id,
      PUBLIC_ROUTE_CATALOG.memora.title,
      PUBLIC_ROUTE_CATALOG.memora.aliases,
      PUBLIC_ROUTE_CATALOG.memora.breadcrumb,
      "Navigate",
      () => context.openRoute({ name: "memora" }),
    ),
    destination(
      PUBLIC_ROUTE_CATALOG.trash.id,
      PUBLIC_ROUTE_CATALOG.trash.title,
      PUBLIC_ROUTE_CATALOG.trash.aliases,
      PUBLIC_ROUTE_CATALOG.trash.breadcrumb,
      "Navigate",
      () => context.openRoute({ name: "trash" }),
    ),
    destination(
      PUBLIC_ROUTE_CATALOG.settings.id,
      PUBLIC_ROUTE_CATALOG.settings.title,
      PUBLIC_ROUTE_CATALOG.settings.aliases,
      PUBLIC_ROUTE_CATALOG.settings.breadcrumb,
      "Navigate",
      () => context.openRoute({ name: "settings" }),
    ),
    settingsDestination(context, "appearance", "Appearance", ["theme"], ["Settings", "General"],),
    settingsDestination(context, "drive", "Google Drive", ["cloud", "oauth"], ["Settings", "General"],),
    settingsDestination(context, "model", "Model", ["provider", "translation"], ["Settings", "Models"],),
    settingsDestination(context, "account", "Account", ["profile"], ["Settings", "General"],),
  ];
}

function dynamicDestinations(context: CommandContext): CommandEntry[] {
  return [
    ...context.documents.map((document) => destination(
      `document.${document.id}`,
      document.title,
      document.author ? [document.author] : [],
      ["Library", "Documents"],
      "Library",
      () => context.openDocument(document),
    )),
    ...context.decks.map((deck) => destination(
      `deck.${deck.id}`,
      deck.name,
      ["flashcards"],
      ["Memora", "Decks"],
      "Memora",
      () => context.openDeck(deck),
    )),
  ];
}

function commandActions(context: CommandContext): CommandEntry[] {
  return [
    action("action.import-pdf", "Import PDF", ["add document"], ["Library"], "Library", context.importPdf),
    action("action.review-today", "Review today", ["study", "due cards"], ["Memora"], "Memora", context.reviewToday),
    action("action.theme-light", "Theme: Light", ["light theme"], ["Settings", "Appearance"], "Settings", () => context.setTheme("light")),
    action("action.theme-dark", "Theme: Dark", ["dark theme"], ["Settings", "Appearance"], "Settings", () => context.setTheme("dark")),
    action("action.theme-system", "Theme: System", ["system theme", "appearance"], ["Settings", "Appearance"], "Settings", () => context.setTheme("system")),
  ];
}

export function createCommandRegistry(context: CommandContext) {
  return {
    async search(surface: CommandSurface, query: string): Promise<CommandEntry[]> {
      if (surface === "command-palette") {
        return commandActions(context).filter((entry) => matches(entry, query));
      }

      const entries = [...staticDestinations(context), ...dynamicDestinations(context)];
      if (query.trim()) {
        const [cardResults, trashResults] = await Promise.all([
          context.searchCards(query).catch(() => []),
          context.searchTrash(query).catch(() => []),
        ]);
        entries.push(
          ...cardResults
            .filter((result) => result.kind === "card")
            .map((result) => destination(
              `card.${result.id}`,
              result.title,
              result.subtitle ? [result.subtitle] : [],
              ["Memora", result.subtitle ?? "Cards", "Cards"],
              "Cards",
              () => context.openCard(result.id, result.title),
            )),
          ...trashResults.map((result) => destination(
            `trash.${result.id}`,
            result.title,
            result.deckName ? [result.deckName] : [],
            result.deckName ? ["Trash", result.deckName] : ["Trash"],
            "Trash",
            context.openTrash,
          )),
        );
      }

      return entries.filter((entry) => matches(entry, query));
    },
  };
}
