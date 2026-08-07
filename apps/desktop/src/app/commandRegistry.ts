import type { LibraryDocument } from "../domain/document";
import type { Deck } from "../domain/learning";
import type { TranslationEngineId } from "../domain/translation";
import type { SearchResult } from "../lib/learning";
import { DEFAULT_PLUGIN_REGISTRY } from "../plugins/firstParty";
import type {
  PluginRegistry,
  RegisteredCommand,
  RegisteredSearchProvider,
  RegisteredSurface,
} from "../plugins/registry";
import type { AppRoute, SettingsSection } from "./routes";

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
  setTranslationEngine: (engine: TranslationEngineId) => void;
  windowsOnDeviceTranslationAvailable: boolean;
}

export const COMMAND_REGISTRY_BINDINGS = Object.freeze({
  surfaces: Object.freeze([
    "route.library",
    "route.memora",
    "route.statistics",
    "route.trash",
    "route.settings",
    "route.settings.account",
    "route.settings.appearance",
    "route.settings.drive",
    "route.settings.memora",
    "route.settings.model",
  ]),
  commands: Object.freeze([
    "action.import-pdf",
    "action.review-today",
    "action.theme-dark",
    "action.theme-light",
    "action.theme-system",
    "action.translation-windows-on-device",
  ]),
  searchProviders: Object.freeze([
    "search.cards",
    "search.decks",
    "search.documents",
    "search.trash",
  ]),
});

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
  const text = [entry.title, ...entry.aliases, ...entry.breadcrumb]
    .join(" ")
    .toLocaleLowerCase();
  return terms.every((term) => fuzzyMatch(text, term));
}

function destination(
  id: string,
  title: string,
  aliases: readonly string[],
  breadcrumb: readonly string[],
  group: string,
  execute: () => void | Promise<void>,
): CommandEntry {
  return {
    id,
    surface: "quick-open",
    title,
    aliases: [...aliases],
    breadcrumb: [...breadcrumb],
    group,
    execute,
  };
}

function action(
  id: string,
  title: string,
  aliases: readonly string[],
  breadcrumb: readonly string[],
  group: string,
  execute: () => void | Promise<void>,
): CommandEntry {
  return {
    id,
    surface: "command-palette",
    title,
    aliases: [...aliases],
    breadcrumb: [...breadcrumb],
    group,
    execute,
  };
}

function settingsRoute(section: SettingsSection): AppRoute {
  return { name: "settings", section };
}

function executeSurface(bindingId: string, context: CommandContext) {
  const routes: Record<string, AppRoute> = {
    "route.library": { name: "library" },
    "route.memora": { name: "memora" },
    "route.statistics": { name: "statistics" },
    "route.trash": { name: "trash" },
    "route.settings": { name: "settings" },
    "route.settings.account": settingsRoute("account"),
    "route.settings.appearance": settingsRoute("appearance"),
    "route.settings.drive": settingsRoute("drive"),
    "route.settings.memora": settingsRoute("memora"),
    "route.settings.model": settingsRoute("model"),
  };
  const route = routes[bindingId];
  if (!route) throw new Error(`Unsupported Surface binding: ${bindingId}`);
  return () => context.openRoute(route);
}

function staticDestination(surface: RegisteredSurface, context: CommandContext): CommandEntry {
  return destination(
    surface.id,
    surface.title,
    surface.aliases,
    surface.breadcrumb,
    surface.group,
    executeSurface(surface.bindingId, context),
  );
}

function commandAvailable(command: RegisteredCommand, context: CommandContext) {
  if (!command.availabilityId) return true;
  if (command.availabilityId === "availability.windows-on-device-translation") {
    return context.windowsOnDeviceTranslationAvailable;
  }
  throw new Error(`Unsupported Command availability binding: ${command.availabilityId}`);
}

function executeCommand(bindingId: string, context: CommandContext) {
  const handlers: Record<string, () => void | Promise<void>> = {
    "action.import-pdf": context.importPdf,
    "action.review-today": context.reviewToday,
    "action.theme-light": () => context.setTheme("light"),
    "action.theme-dark": () => context.setTheme("dark"),
    "action.theme-system": () => context.setTheme("system"),
    "action.translation-windows-on-device": () =>
      context.setTranslationEngine("windows-translation"),
  };
  const handler = handlers[bindingId];
  if (!handler) throw new Error(`Unsupported Command binding: ${bindingId}`);
  return handler;
}

function commandAction(command: RegisteredCommand, context: CommandContext): CommandEntry {
  return action(
    command.id,
    command.title,
    command.aliases,
    command.breadcrumb,
    command.group,
    executeCommand(command.bindingId, context),
  );
}

async function resolveSearchProvider(
  provider: RegisteredSearchProvider,
  context: CommandContext,
  query: string,
): Promise<CommandEntry[]> {
  switch (provider.bindingId) {
    case "search.documents":
      return context.documents.map((document) =>
        destination(
          `document.${document.id}`,
          document.title,
          document.author ? [document.author] : [],
          ["Library", "Documents"],
          provider.group,
          () => context.openDocument(document),
        ),
      );
    case "search.decks":
      return context.decks.map((deck) =>
        destination(
          `deck.${deck.id}`,
          deck.name,
          ["flashcards"],
          ["Memora", "Decks"],
          provider.group,
          () => context.openDeck(deck),
        ),
      );
    case "search.cards": {
      if (!query.trim()) return [];
      const results = await context.searchCards(query).catch(() => []);
      return results
        .filter((result) => result.kind === "card")
        .map((result) =>
          destination(
            `card.${result.id}`,
            result.title,
            result.subtitle ? [result.subtitle] : [],
            ["Memora", result.subtitle ?? "Cards", "Cards"],
            provider.group,
            () => context.openCard(result.id, result.title),
          ),
        );
    }
    case "search.trash": {
      if (!query.trim()) return [];
      const results = await context.searchTrash(query).catch(() => []);
      return results.map((result) =>
        destination(
          `trash.${result.id}`,
          result.title,
          result.deckName ? [result.deckName] : [],
          result.deckName ? ["Trash", result.deckName] : ["Trash"],
          provider.group,
          context.openTrash,
        ),
      );
    }
    default:
      throw new Error(`Unsupported Search provider binding: ${provider.bindingId}`);
  }
}

function assertBindingCoverage(registry: PluginRegistry) {
  const categories = [
    [COMMAND_REGISTRY_BINDINGS.surfaces, registry.listSurfaces()],
    [COMMAND_REGISTRY_BINDINGS.commands, registry.listCommands()],
    [COMMAND_REGISTRY_BINDINGS.searchProviders, registry.listSearchProviders()],
  ] as const;
  categories.forEach(([bindings, contributions]) => {
    const actual = contributions.map((contribution) => contribution.bindingId).sort();
    const expected = [...bindings].sort();
    if (actual.join("\n") !== expected.join("\n")) {
      throw new Error("Command Registry binding coverage does not match Plugin Registry.");
    }
  });
}

export function createCommandRegistry(
  context: CommandContext,
  pluginRegistry: PluginRegistry = DEFAULT_PLUGIN_REGISTRY,
) {
  assertBindingCoverage(pluginRegistry);
  return {
    async search(surface: CommandSurface, query: string): Promise<CommandEntry[]> {
      if (surface === "command-palette") {
        return pluginRegistry
          .listCommands()
          .filter((command) => commandAvailable(command, context))
          .map((command) => commandAction(command, context))
          .filter((entry) => matches(entry, query));
      }

      const dynamicEntries = await Promise.all(
        pluginRegistry
          .listSearchProviders()
          .map((provider) => resolveSearchProvider(provider, context, query)),
      );
      const entries = [
        ...pluginRegistry
          .listSurfaces()
          .filter((registeredSurface) => registeredSurface.quickOpen)
          .map((registeredSurface) => staticDestination(registeredSurface, context)),
        ...dynamicEntries.flat(),
      ];

      return entries.filter((entry) => matches(entry, query));
    },
  };
}
